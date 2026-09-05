// v1.20.5 本番実測。実サイトを実ブラウザで開いて、
//   ① 読み込まれるバンドルのタグ
//   ② 「自分の顔で作る」結果画面のおすすめ商品（実サイトの商品画像が本当に出るか）
//   ③ 保存カードの研究所監修表記（BLUBEL / IEBEL）
//   ④ 既存導線の回帰（質問診断・シーズンアバター・写真診断・写真+質問・診断前選択・1st/2nd）
//   ⑤ JSエラー
// を通しで見る。
//
// 画像生成だけは中継をインターセプトして、手元で生成済みのイラストを返す。
// ここで見たいのは「商品欄と監修表記が実サイトで出るか」であって生成そのものではなく、
// 実際に叩くと1サイトにつき課金1回・日次枠1消費になるため。生成以外はすべて本物。
//
// 実行: node test/_v1205_live.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "_v1205");
mkdirSync(OUT, { recursive: true });

const TAG = "@v1.20.5";
const PHOTO = "C:/Users/newfa/instagram/renderer/test_output/colorlab_card_test_20260904/selfcard/ref_keisuke.jpg";
const BAND_TOP = 1920 - 220;

const SITES = [
  { key: "BLUBEL", url: "https://www.blubel.jp/pages/personalcolor", host: "blubel",
    stub: resolve(HERE, "_live_colors_winter_autumn.png") },
  { key: "IEBEL", url: "https://www.iebel.jp/pages/personalcolor", host: "iebel",
    stub: resolve(HERE, "_live_colors_spring_autumn.png") },
];
// 監修表記は 1st タイプの担当サイトで決まる（TYPES[].site / .sns）。
const CREDIT = { blubel: "ブルベ研究所監修  @blube_lab", iebel: "イエベ研究所監修  @iebe_lab" };

// 保存PNGの最下行（＝監修行）の文字幅を測り、期待文字列の実測幅と突き合わせる
const measureCredit = (page, dataUrl, text) => page.evaluate(async (v) => {
  const im = new Image();
  await new Promise((ok, ng) => { im.onload = ok; im.onerror = ng; im.src = v.dataUrl; });
  const cv = document.createElement("canvas");
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const cx = cv.getContext("2d");
  cx.drawImage(im, 0, 0);
  const d = cx.getImageData(0, 0, cv.width, cv.height).data;
  const rows = [];
  for (let y = 0; y < v.bandTop; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { if (lo < 0) lo = x; hi = x; }
    }
    rows.push(lo < 0 ? null : [lo, hi]);
  }
  let bottom = -1;
  for (let y = rows.length - 1; y >= 0; y--) if (rows[y]) { bottom = y; break; }
  let top = bottom;
  while (top > 0 && rows[top - 1]) top--;
  let lo = 1e9, hi = -1;
  for (let y = top; y <= bottom; y++) if (rows[y]) { lo = Math.min(lo, rows[y][0]); hi = Math.max(hi, rows[y][1]); }
  const FAM = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";
  const s = document.createElement("canvas").getContext("2d");
  s.font = "500 30px " + FAM;
  return { w: cv.width, h: cv.height, bottom, inkW: hi - lo + 1, wantW: Math.round(s.measureText(v.text).width) };
}, { dataUrl, bandTop: BAND_TOP, text });

// 保存ボタンが実際に作る PNG を dataURL で取り出す
const grabCard = (page) => page.evaluate(async () => await new Promise((ok, ng) => {
  const t = setTimeout(() => ng(new Error("save timeout")), 30000);
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    fetch(this.href).then((r) => r.blob()).then((bl) => {
      const fr = new FileReader();
      fr.onload = () => { clearTimeout(t); HTMLAnchorElement.prototype.click = orig; ok(fr.result); };
      fr.readAsDataURL(bl);
    });
  };
  [...document.querySelectorAll("#colorlab-root button")]
    .find((x) => /カードを画像で保存/.test(x.textContent)).click();
}));

const results = [];
const browser = await chromium.launch();

for (const site of SITES) {
  const ok = [], ng = [];
  const check = (c, l) => (c ? ok : ng).push(l);
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
  const page = await ctx.newPage();
  const bundles = [];
  const errs = [];
  const failed = [];
  page.on("request", (r) => { if (/colorlab\.iife\.js/.test(r.url())) bundles.push(r.url()); });
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("requestfailed", (r) => { if (!/analytics|googletag|facebook|doubleclick|clarity/.test(r.url())) failed.push(r.url().slice(0, 110)); });

  // 生成だけ差し替える。CORS はブラウザが見るので許可ヘッダを付けて返す。
  const stub = readFileSync(site.stub).toString("base64");
  await page.route(/colorlab-selfcard.*\/illustrate/, (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: {
        "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type" } });
    }
    route.fulfill({ status: 200, contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, image: stub, remaining: 99 }) });
  });

  const open = async () => {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#colorlab-root button", { timeout: 60000 });
  };
  const q3 = async () => { for (let i = 0; i < 6; i++) { await page.locator("#colorlab-root button").nth(1).click(); await page.waitForTimeout(220); } };

  await open();

  // ── ① バンドルのタグ
  check(bundles.some((u) => u.includes(TAG)), `① 読み込まれたバンドルが ${TAG} (${bundles[0] || "なし"})`);
  check(!bundles.some((u) => /@v1\.20\.[0-4]\//.test(u)), "① 旧タグを同時に読んでいない");

  // ── ④ 既存導線が全部残っている
  const home = await page.textContent("#colorlab-root");
  for (const l of ["写真で診断", "質問で診断", "写真＋質問で12タイプ診断！", "パーソナルカラー別コーデ提案", "骨格診断", "今日のコーデ採点"])
    check(home.includes(l), "④ 既存導線: " + l);
  await page.screenshot({ path: `${OUT}/${site.key}_00_home.png`, fullPage: true });

  // ── ②A アバタールート: 診断前選択 → 1st/2nd → 商品欄は出ない → 保存カードに監修表記
  await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
  await page.waitForTimeout(700);
  check((await page.textContent("#colorlab-root")).includes("あなたの結果をどう見る？"), "② 診断前の選択画面が出る");
  await page.getByRole("button", { name: /アバターで見る/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^直感で選ぶ/ }).click(); await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^自分から話しかける/ }).click(); await page.waitForTimeout(400);
  await q3();
  await page.waitForTimeout(1500);
  let body = await page.textContent("#colorlab-root");
  check(body.includes("カードを画像で保存"), "②A アバタールートで結果画面に到達");
  const m12 = body.match(/1st\s*(\S+)\s*2nd\s*(\S+)/);
  check(!!m12, "③ 1st/2nd 表示" + (m12 ? ` → 1st ${m12[1]} / 2nd ${m12[2]}` : ""));
  check(!body.includes("Recommended Items"), "②A アバタールートには商品欄を出さない（従来どおり）");
  await page.screenshot({ path: `${OUT}/${site.key}_01_avatar_result.png`, fullPage: true });

  let du = await grabCard(page);
  writeFileSync(`${OUT}/${site.key}_02_card_avatar.png`, Buffer.from(du.split(",")[1], "base64"));
  let cm = await measureCredit(page, du, CREDIT[site.host]);
  check(cm.w === 1080 && cm.h === 1920, `③ 保存PNGは 1080x1920 (実測 ${cm.w}x${cm.h})`);
  check(cm.bottom < BAND_TOP, `③ 本文が下部帯に食い込んでいない (最下端 y=${cm.bottom} / 帯 y=${BAND_TOP})`);
  check(Math.abs(cm.inkW - cm.wantW) <= 14,
    `③ 監修表記「${CREDIT[site.host]}」が出ている (幅 実測${cm.inkW}px / 期待${cm.wantW}px)`);

  // ── ②B 自分の顔ルート: 写真を渡す（生成のみスタブ）→ 商品欄 → 保存カード
  await open();
  await page.getByRole("button", { name: /あなたの個性色が分かる！/ }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /自分の顔で作る/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^考えて選ぶ/ }).click(); await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^聞き役になる/ }).click(); await page.waitForTimeout(400);
  await q3();
  await page.waitForTimeout(1200);
  await page.waitForSelector("#colorlab-root input[type=file]", { state: "attached", timeout: 30000 });
  await page.setInputFiles("#colorlab-root input[type=file]", PHOTO);
  await page.waitForTimeout(4000);
  body = await page.textContent("#colorlab-root");
  check(body.includes("カードを画像で保存"), "②B 生成後に結果画面へ");
  check(body.includes("Recommended Items"), "② おすすめ商品欄が出る");
  check(/(BLUBEL|IEBEL)の服をもっと見る/.test(body), "② 「◯◯の服をもっと見る →」が出る");
  check(body.includes("この商品一覧は画面表示のみです"), "② 保存画像には入らない旨の注記が出る");

  // 商品カードの実測。画像が本当に読めているか（naturalWidth>0）まで見る。
  const skus = await page.evaluate(() => {
    const head = [...document.querySelectorAll("#colorlab-root div")]
      .find((d) => d.textContent.trim().startsWith("Recommended Items"));
    if (!head) return null;
    const box = head.parentElement;
    const as = [...box.querySelectorAll("a[href*='/items/']")];
    return as.map((a) => {
      const im = a.querySelector("img");
      return { href: a.href, src: im ? im.src : null, w: im ? im.naturalWidth : 0, h: im ? im.naturalHeight : 0,
               text: a.textContent.replace(/\s+/g, " ").trim().slice(0, 40) };
    });
  });
  check(skus && skus.length >= 4 && skus.length <= 6, `② 商品が4〜6点 (実測 ${skus ? skus.length : 0}点)`);
  const loaded = (skus || []).filter((s) => s.w > 0).length;
  check(skus && loaded === skus.length, `② 商品画像が全点ちゃんと読めている (実測 ${loaded}/${skus ? skus.length : 0}点)`);
  const fromImgServer = (skus || []).filter((s) => s.src && /fulmo-img-server\.com/.test(s.src)).length;
  check(fromImgServer === (skus || []).length, `② 画像が fulmo-img-server.com から来ている (${fromImgServer}/${(skus || []).length})`);
  const ownSite = (skus || []).filter((s) => s.href.includes(site.host + ".jp")).length;
  check(ownSite === (skus || []).length, `② リンク先が閲覧中サイト(${site.host}.jp)のみ (${ownSite}/${(skus || []).length})`);
  const uniq = new Set((skus || []).map((s) => s.href)).size;
  check(uniq === (skus || []).length, `② 商品の重複なし (${uniq}種)`);
  for (const s of (skus || [])) console.log(`      - ${s.w}x${s.h}  ${s.href.split("?")[0].split("/").pop()}  ${s.text}`);

  await page.screenshot({ path: `${OUT}/${site.key}_03_self_result.png`, fullPage: true });
  await page.evaluate(() => {
    const head = [...document.querySelectorAll("#colorlab-root div")]
      .find((d) => d.textContent.trim().startsWith("Recommended Items"));
    if (head) head.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${site.key}_04_self_products.png` });

  du = await grabCard(page);
  writeFileSync(`${OUT}/${site.key}_05_card_self.png`, Buffer.from(du.split(",")[1], "base64"));
  cm = await measureCredit(page, du, CREDIT[site.host]);
  check(cm.w === 1080 && cm.h === 1920, `③ 自分の顔ルートの保存PNGも 1080x1920 (実測 ${cm.w}x${cm.h})`);
  check(Math.abs(cm.inkW - cm.wantW) <= 14,
    `③ 自分の顔ルートの保存カードにも監修表記 (幅 実測${cm.inkW}px / 期待${cm.wantW}px)`);

  // ── ④ 既存: 質問で診断 → シーズン代表アバター
  await open();
  await page.getByRole("button", { name: /質問で診断/ }).first().click();
  await page.waitForTimeout(700);
  for (let i = 0; i < 20; i++) {
    const t = await page.textContent("#colorlab-root");
    if (/あなたは【/.test(t)) break;
    const btns = page.locator("#colorlab-root button");
    if (await btns.count() < 2) break;
    await btns.nth(1).click();
    await page.waitForTimeout(320);
  }
  await page.waitForTimeout(1200);
  body = await page.textContent("#colorlab-root");
  check(/あなたは【.+】タイプです/.test(body), "④ 質問診断が結果まで到達 " + ((body.match(/あなたは【(.+?)】/) || [])[1] || ""));
  check(/2nd|2位/.test(body), "④ 12タイプ結果の 2nd 表示が残っている");
  const sav = await page.evaluate(() => {
    const i = document.querySelector("#colorlab-root img");
    return i ? { src: i.src, w: i.naturalWidth } : null;
  });
  check(sav && /avatar_(spring|summer|autumn|winter)_/.test(sav.src) && sav.w > 0,
    "④ シーズン代表アバターが表示 " + (sav ? sav.src.split("/").pop() + " " + sav.w + "px" : "なし"));
  check(sav && sav.src.includes(TAG), `④ アバターも ${TAG} から配信されている`);
  await page.screenshot({ path: `${OUT}/${site.key}_06_quiz_result.png`, fullPage: true });

  // ── ④ 既存: 写真診断 / 写真+質問 の入口
  await open();
  await page.getByRole("button", { name: /写真で診断/ }).first().click();
  await page.waitForTimeout(1500);
  check(/白い紙|撮影|カメラ|写真/.test(await page.textContent("body")), "④ 写真診断の画面が開く");
  await page.screenshot({ path: `${OUT}/${site.key}_07_photo.png`, fullPage: true });

  await open();
  await page.getByRole("button", { name: /写真＋質問で12タイプ診断/ }).first().click();
  await page.waitForTimeout(1500);
  check(/白い紙|撮影|カメラ|写真|質問/.test(await page.textContent("body")), "④ 写真+質問の画面が開く");
  await page.screenshot({ path: `${OUT}/${site.key}_08_combo.png`, fullPage: true });

  // ── ⑤ JSエラー
  check(errs.length === 0, "⑤ JSエラー0件" + (errs.length ? " → " + errs.slice(0, 3).join(" / ") : ""));
  check(failed.length === 0, "⑤ 読み込み失敗0件" + (failed.length ? " → " + failed.slice(0, 3).join(" / ") : ""));

  results.push({ site: site.key, ok, ng });
  await ctx.close();
}
await browser.close();

let bad = 0;
for (const r of results) {
  console.log(`\n===== ${r.site} : ${r.ok.length}/${r.ok.length + r.ng.length} =====`);
  for (const l of r.ok) console.log("  ok  " + l);
  for (const l of r.ng) { console.log("  NG  " + l); bad++; }
}
console.log(`\n出力: ${OUT}`);
process.exit(bad ? 1 : 0);
