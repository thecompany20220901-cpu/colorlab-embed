// 「自分の顔で作る」本番実画面キャプチャ（2026-09-08）
//   PHASE=1 … 生成なし。入口の選択画面 / 撮影画面 / 操作ステップ数・所要時間の実測。
//   PHASE=2 … 実際に1回だけ画像生成を叩く（課金1回）。生成カードと保存PNGを取る。
// 使い方: node test/_selfcard_capture_20260908.mjs 1 [BLUBEL|IEBEL]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve, join } from "path";

const PHASE = process.argv[2] || "1";
const ONLY = process.argv[3] || null;
const OUT = "C:/Users/newfa/Downloads/colorlab_selfcard_20260908";
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "_full"), { recursive: true });

const PHOTO = "C:/Users/newfa/instagram/renderer/test_output/colorlab_card_test_20260904/selfcard/ref_keisuke.jpg";
const WORKER = "https://colorlab-selfcard.the-company-20220901.workers.dev";
const SITES = [
  { key: "BLUBEL", url: "https://www.blubel.jp/pages/personalcolor" },
  { key: "IEBEL",  url: "https://www.iebel.jp/pages/personalcolor" },
].filter((s) => !ONLY || s.key === ONLY);

const log = [];
const say = (s) => { console.log(s); log.push(s); };

const health = async (tag) => {
  try {
    const r = await fetch(WORKER + "/health");
    const j = await r.json();
    say(`  [health ${tag}] used=${j.used} remaining=${j.remaining} limit=${j.limit ?? "-"} key=${j.key_ok ?? j.ok ?? "-"}`);
    return j;
  } catch (e) { say(`  [health ${tag}] 取得失敗: ${e.message}`); return null; }
};

const browser = await chromium.launch();
const summary = [];

for (const site of SITES) {
  say(`\n═══ ${site.key} : ${site.url} ═══`);
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const bundles = [], errs = [];
  page.on("request", (r) => { if (/colorlab\.iife\.js/.test(r.url())) bundles.push(r.url()); });
  page.on("pageerror", (e) => errs.push(e.message));

  const open = async () => {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#colorlab-root button", { timeout: 60000 });
    await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); sessionStorage.removeItem("colorlab-selfcard"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#colorlab-root button", { timeout: 60000 });
    await page.waitForTimeout(600);
  };
  // 画面はウィジェット(#colorlab-root)だけを切り出す。ページ全体は _full に別途残す。
  const shot = async (n) => {
    const el = await page.$("#colorlab-root");
    if (el) await el.screenshot({ path: join(OUT, `${site.key}_${n}.png`) });
    else await page.screenshot({ path: join(OUT, `${site.key}_${n}.png`) });
    await page.screenshot({ path: join(OUT, "_full", `${site.key}_${n}_full.png`), fullPage: true });
  };
  const txt = () => page.textContent("#colorlab-root");

  await open();
  say(`  バンドル: ${(bundles[0] || "なし").replace(/^.*colorlab-embed/, "…colorlab-embed")}`);

  // ── 操作ステップ計測（未診断ユーザー・入口B）──
  let taps = 0, t0 = Date.now();
  const tap = async (rx, waitMs = 450) => {
    await page.getByRole("button", { name: rx }).first().click();
    taps++; await page.waitForTimeout(waitMs);
  };
  await shot("00_home");

  await tap(/あなたの個性色が分かる！/, 800);
  const chooseTxt = await txt();
  say(`  [1] 選択画面「あなたの結果をどう見る？」: ${chooseTxt.includes("あなたの結果をどう見る？") ? "OK" : "NG"}`);
  say(`      アバターで見る: ${chooseTxt.includes("無料・すぐに完成") ? "「無料・すぐに完成」" : "文言なし"}`);
  say(`      自分の顔で作る: ${chooseTxt.includes("写真から本人風イラストを生成") ? "「写真から本人風イラストを生成」" : chooseTxt.includes("本日の生成枠は終了") ? "★本日の枠終了で押せない" : "文言なし"}`);
  await shot("01_choose_入口の選択画面");

  await tap(/自分の顔で作る/);
  await tap(/^直感で選ぶ/);
  await tap(/^自分から話しかける/, 600);
  // 未診断なので Q3(6ペア)。先頭ボタン=戻る、その次がA選択肢。
  for (let i = 0; i < 6; i++) { await page.locator("#colorlab-root button").nth(1).click(); taps++; await page.waitForTimeout(280); }
  await page.waitForTimeout(1500);
  const tSelf = Math.round((Date.now() - t0) / 1000);
  const selfTxt = await txt();
  say(`  [2] 撮影画面へ自動遷移: ${(await page.getByRole("button", { name: /写真を選ぶ/ }).count()) > 0 ? "OK（「写真を選ぶ」あり）" : "NG"}`);
  say(`      告知文（写真が端末外へ出る旨）: ${selfTxt.includes("画像生成AI") ? "OK" : "NG"}`);
  say(`  [4] 未診断ユーザーの操作ステップ: ${taps} タップ / ${tSelf} 秒（ホーム→撮影画面）`);
  await shot("02_selfphoto_撮影画面");

  const rec = { site: site.key, bundle: bundles[0] || "", tapsToCamera: taps, secToCamera: tSelf, errs: errs.length };

  if (PHASE === "2") {
    say(`\n  ── 生成を実行（課金1回）──`);
    const h0 = await health("before");
    const t1 = Date.now();
    await page.setInputFiles("#colorlab-root input[type=file]",
      { name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO) });
    taps++;
    await page.waitForTimeout(1200);
    await shot("03_generating_生成中");
    let done = false;
    for (let i = 0; i < 60; i++) {
      done = await page.evaluate(() => !/イラストを作っています/.test(document.querySelector("#colorlab-root").textContent));
      if (done) break;
      await page.waitForTimeout(2000);
    }
    const genSec = Math.round((Date.now() - t1) / 1000);
    await page.waitForTimeout(1500);
    const body = await txt();
    const img = await page.evaluate(() => {
      const i = document.querySelector("#colorlab-root img");
      return i ? { head: i.src.slice(0, 30), w: i.naturalWidth, h: i.naturalHeight } : null;
    });
    const m = body.match(/1st\s*(\S+)\s*2nd\s*(\S+)/);
    say(`  [3] 生成 ${done ? "完了" : "★未完了"} / 所要 ${genSec} 秒`);
    say(`      カード画像: ${img ? `${img.head}… ${img.w}x${img.h}` : "なし"}`);
    say(`      1st/2nd 表示: ${m ? `1st ${m[1]} / 2nd ${m[2]}` : "★見つからず"}`);
    say(`      エラー表示: ${/失敗|エラー|もう一度/.test(body) ? "★あり" : "なし"}`);
    await shot("04_card_生成カード_1st2nd");

    // カード本体だけを切り出す
    try {
      const box = await page.evaluate(() => {
        const i = document.querySelector("#colorlab-root img");
        const c = i && i.closest("div");
        if (!c) return null;
        const b = c.getBoundingClientRect();
        return { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height };
      });
      if (box) {
        await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 20)), box.y);
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, `${site.key}_05_card_only.png`),
          clip: { x: box.x, y: 0, width: box.w, height: Math.min(1800, box.h + 40) } });
      }
    } catch (e) { say(`      カード切り出し失敗: ${e.message}`); }

    // 「カードを画像で保存・シェア」= 1080x1920 PNG（研究所監修表記はここに入る）
    try {
      const dl = page.waitForEvent("download", { timeout: 30000 });
      await tap(/カードを画像で保存/, 1500);
      const d = await dl;
      const p = join(OUT, `${site.key}_06_saved_card_1080x1920.png`);
      await d.saveAs(p);
      say(`  [3] 保存PNG: ${p}`);
    } catch (e) { say(`  [3] 保存PNGの取得に失敗: ${e.message}`); }

    const h1 = await health("after");
    if (h0 && h1) say(`  課金が発生した生成回数: ${h1.used - h0.used}（残り ${h1.remaining}）`);
    say(`  [4] 生成まで含めた総操作ステップ: ${taps} タップ / 生成待ち ${genSec} 秒`);
    Object.assign(rec, { genSec, totalTaps: taps, first: m ? m[1] : null, second: m ? m[2] : null,
      billed: h0 && h1 ? h1.used - h0.used : null, remaining: h1 ? h1.remaining : null });
  }

  say(`  JSエラー: ${errs.length} 件${errs.length ? " → " + errs.slice(0, 3).join(" / ") : ""}`);
  summary.push(rec);
  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, `_log_phase${PHASE}.txt`), log.join("\n"), "utf-8");
writeFileSync(join(OUT, `_summary_phase${PHASE}.json`), JSON.stringify(summary, null, 2), "utf-8");
console.log("\n保存先: " + OUT);
