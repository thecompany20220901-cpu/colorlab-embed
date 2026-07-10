// §5 検証: Playwright で local_article.html を開き、両アプリの表示・画面遷移・
// localStorage再訪(おかえり)・375px レイアウトを確認し、test/screenshots/ にSSを出力。
//
// v1.3.0 (colorlab v21 / ngpolice v2) で確認する要点:
//   - ホームの「近日公開」グレーバッジ + モーダル（「AI」の文字が無いこと）
//   - 12タイプ診断の結果ページ（似合う色10色グリッド / 苦手色チップ / コスメ）
//   - 12タイプ結果ページの「今日なに着る？」CTA → 近日公開モーダル（AIゲート）
//   - 骨格診断の結果ページ（DesignIcon付きの得意/注意カード）
//   - 骨格結果ページの「カラー×骨格で今日なに着る？」CTA → 近日公開モーダル（AIゲート）
//   - NG警察の結果ページ（修正済みボタン2つ）
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import zlib from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const ART = "file://" + join(__dirname, "local_article.html").replace(/\\/g, "/");

// ── 単色RGBのPNGバッファを自作（外部ライブラリ不要・判定を決定論的にするため） ──
function crc32(buf) {
  let c, table = crc32.t || (crc32.t = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function solidPng(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit, truecolor RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) { raw[o++] = 0; for (let x = 0; x < size; x++) { raw[o++] = r; raw[o++] = g; raw[o++] = b; } }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const results = [];
const log = (m) => { console.log(m); results.push(m); };
let failures = 0;
const check = (label, ok) => { log(`  [${ok ? "OK" : "NG"}] ${label}`); if (!ok) failures++; };

// AI機能が誤ってネットワークを叩いていないかを実測する（Liteモードの本丸）
const aiCalls = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [page error]", m.text()); });
page.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });

async function shot(name) { await page.screenshot({ path: join(SHOTS, name), fullPage: true }); log("  SS: " + name); }
// アプリ枠だけを切り出す（記事全体の縦長SSだと結果ページが読めないため）
async function shotEl(sel, name) { await page.locator(sel).screenshot({ path: join(SHOTS, name) }); log("  SS: " + name); }
// モーダルはfixed配置なのでビューポートで撮る
async function shotView(name) { await page.screenshot({ path: join(SHOTS, name) }); log("  SS: " + name); }
const modal = () => page.locator("#colorlab-root >> text=新機能は、近日公開").first();

// 12タイプ診断を最後まで進める（A/先頭の選択肢を押し続ける）
async function runQuiz() {
  for (let i = 0; i < 30; i++) {
    const savedType = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem("colorlab-profile") || "{}").myType || null; } catch (e) { return null; }
    });
    if (savedType) return savedType;
    const btns = page.locator("#colorlab-root button");
    const n = await btns.count();
    let clicked = false;
    for (let b = 0; b < n; b++) {
      const t = (await btns.nth(b).innerText().catch(() => "")).trim();
      if (t === "A" || /^A\b/.test(t) || (t.length <= 3 && /[A-DＡ-Ｄ]/.test(t))) { await btns.nth(b).click().catch(() => {}); clicked = true; break; }
    }
    if (!clicked && n > 0) await btns.first().click().catch(() => {});
    await page.waitForTimeout(200);
  }
  return null;
}

try {
  // ── 1. 初期表示 ──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.waitForSelector("#ngpolice-root button", { timeout: 15000 });
  const homeText = await page.locator("#colorlab-root").innerText();
  check("両アプリがマウントされ日本語が表示された", /診断/.test(homeText));
  check("ホームに「近日公開」バッジが出ている", /近日公開/.test(homeText));
  await shotEl("#colorlab-root", "01_home_soon_badges.png");

  // ── 2. 近日公開モーダル（「AI」の文字が無いこと） ──
  await page.getByRole("button", { name: /顔写真で診断/ }).click();
  await modal().waitFor({ timeout: 5000 });
  const modalBox = page.locator("#colorlab-root div.fixed").first();
  const modalText = await modalBox.innerText();
  check("モーダル本文に「新機能は、近日公開！」がある", /新機能は、近日公開/.test(modalText));
  check('モーダル本文に「AI」の文字が無い', !/AI/i.test(modalText));
  log("    modal text: " + JSON.stringify(modalText.replace(/\n/g, " / ")));
  await shotView("02_home_soon_modal.png");
  await page.getByRole("button", { name: /^閉じる$/ }).click();

  // ── 3. 12タイプ診断 → 結果ページ ──
  await page.getByRole("button", { name: /パーソナルカラー診断（12タイプ）/ }).click();
  const myType = await runQuiz();
  check("12タイプ診断が完了し localStorage に保存された", !!myType);
  await page.waitForTimeout(400);
  const resText = await page.locator("#colorlab-root").innerText();
  check("結果ページに「似合う色（勝ち色10選）」がある", /似合う色（勝ち色10選）/.test(resText));
  check("結果ページに「苦手な色」がある", /苦手な色/.test(resText));
  check("結果ページに「仕上げのコスメはコレ！」がある", /仕上げのコスメはコレ/.test(resText));
  await shotEl("#colorlab-root", "03_colorlab_quiz_result.png");

  // ── 3b. 結果ページの「今日なに着る？」CTA → 近日公開モーダル（AIゲート） ──
  await page.getByRole("button", { name: /このタイプで「今日なに着る？」/ }).click();
  await modal().waitFor({ timeout: 5000 });
  check("12タイプ結果ページのCTA → 近日公開モーダルが開く", await modal().isVisible());
  await shotView("03b_quiz_result_cta_modal.png");
  await page.getByRole("button", { name: /^閉じる$/ }).click();
  const stillResult = await page.locator("#colorlab-root").innerText();
  check("CTA押下でAI提案画面へ遷移していない", !/シーン|今日の気分/.test(stillResult) || /似合う色（勝ち色10選）/.test(stillResult));

  // ── 4. リロード→「おかえり」表示（再訪 / localStorage） ──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root", { timeout: 10000 });
  await page.waitForTimeout(500);
  check("リロード後に『おかえりなさい』が出る", (await page.locator("#colorlab-root >> text=おかえりなさい").count()) > 0);
  await shotEl("#colorlab-root", "04_colorlab_revisit_okaeri.png");

  // ── 5. 骨格診断 → 結果ページ（DesignIcon付き 得意/注意カード） ──
  await page.getByRole("button", { name: /骨格診断/ }).click();
  for (let i = 0; i < 12; i++) {
    const opts = page.locator("#colorlab-root button");
    const done = await page.locator("#colorlab-root >> text=あなたのタイプ").count();
    if (done > 0) break;
    // Headerの戻るボタンを避け、選択肢(下側)の先頭を押す
    const n = await opts.count();
    if (n >= 2) await opts.nth(1).click().catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.waitForSelector("#colorlab-root >> text=得意なデザイン", { timeout: 5000 });
  const frameText = await page.locator("#colorlab-root").innerText();
  check("骨格結果に「得意なデザイン」カードがある", /得意なデザイン/.test(frameText));
  check("骨格結果に「注意したいデザイン」カードがある", /注意したいデザイン/.test(frameText));
  const iconCount = await page.locator("#colorlab-root svg").count();
  check("骨格結果にデザインアイコン(SVG)が描画されている: " + iconCount + "個", iconCount >= 4);
  await shotEl("#colorlab-root", "05_colorlab_frame_result.png");

  // ── 5b. 骨格結果ページの「カラー×骨格で今日なに着る？」CTA → 近日公開モーダル ──
  await page.getByRole("button", { name: /カラー×骨格で「今日なに着る？」/ }).click();
  await modal().waitFor({ timeout: 5000 });
  check("骨格結果ページのCTA → 近日公開モーダルが開く", await modal().isVisible());
  await shotView("05b_frame_result_cta_modal.png");
  await page.getByRole("button", { name: /^閉じる$/ }).click();

  // ── 6. NG色警察: 出頭→タイプ選択→写真提出→判決（ルールベース判定） ──
  await page.getByRole("button", { name: /出頭する/ }).click();
  await page.waitForSelector("text=あなたのパーソナルカラーは", { timeout: 5000 });
  await page.locator("#ngpolice-root button", { hasText: "イエベ春" }).click();
  await page.waitForSelector("text=本日のコーデ写真を提出せよ", { timeout: 5000 });
  // 黒っぽい画像 → イエベ春のNG(黒)で「検挙」になるはず
  await page.locator("#ngpolice-root input[type=file]").setInputFiles({ name: "coord.png", mimeType: "image/png", buffer: solidPng(48, 20, 20, 22) });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /取り調べを受ける/ }).click();
  await page.waitForSelector("text=/違 反 切 符|無罪放免証/", { timeout: 8000 });
  const verdict = await page.locator("#ngpolice-root").innerText();
  check("NG警察 ルールベース判定が完走(検挙=" + /違 反 切 符/.test(verdict) + ")", /違 反 切 符|無罪放免証/.test(verdict));
  check("結果ページ ボタン1: 本家診断アプリで本格診断する", /本家診断アプリで本格診断する/.test(verdict));
  check("結果ページ ボタン2: LINEで「…の勝ち色」を受け取る", /LINEで「.+の勝ち色」を受け取る/.test(verdict));
  const mainHref = await page.locator("#ngpolice-root a", { hasText: "本家診断アプリで本格診断する" }).getAttribute("href");
  check("本家リンクが blubel.jp/pages/personalcolor: " + mainHref, mainHref === "https://www.blubel.jp/pages/personalcolor");
  await shotEl("#ngpolice-root", "06_ngpolice_result.png");

  // ── 7. Liteモードの実測: Anthropic APIへのリクエストがゼロであること ──
  check("api.anthropic.com へのリクエストが0件 (実測 " + aiCalls.length + " 件)", aiCalls.length === 0);

  log(failures === 0 ? "=== 検証完了: 全チェック合格 ===" : `=== 検証完了: ${failures} 件のNG ===`);
} catch (e) {
  log("!! 検証中にエラー: " + e.message);
  failures++;
  await shot("99_error_state.png");
} finally {
  writeFileSync(join(SHOTS, "verify_log.txt"), results.join("\n") + "\n", "utf8");
  await browser.close();
  if (failures > 0) process.exitCode = 1;
}
