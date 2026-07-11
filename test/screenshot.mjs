// §5 検証: Playwright で local_article.html を開き、両アプリの表示・画面遷移・
// localStorage再訪(おかえり)・375px レイアウトを確認し、test/screenshots/ にSSを出力。
//
// v1.4.0 (colorlab v23 / ngpolice v2) で確認する要点:
//   - ホームの AI3機能が「グレートーン」ボタン + 「近日公開」バッジ
//   - 近日公開モーダルがグローバル化（ホーム/結果ページの両方から開く）
//   - 12タイプ結果ページ: 苦手色ブロックが1箇所に統合 / 勝ち色10選 / コスメ
//   - コスメ一覧ページ: 上部の「似合うカラー」パレット
//   - 骨格結果ページ: 得意/注意が1行リスト（DesignIcon付き）
//   - シェア画像PNG（canvas → download）が生成される
//   - NG警察の結果ページ（ボタン2つ / 本家リンク）
//   - Liteモード実測: api.anthropic.com へのリクエストが0件
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
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [page error]", m.text()); });
page.on("request", (r) => { if (/anthropic\.com/.test(r.url())) aiCalls.push(r.url()); });

async function shotEl(sel, name) { await page.locator(sel).screenshot({ path: join(SHOTS, name) }); log("  SS: " + name); }
async function shotView(name) { await page.screenshot({ path: join(SHOTS, name) }); log("  SS: " + name); }
const modal = () => page.locator("#colorlab-root >> text=新機能は、近日公開").first();
const countOf = (hay, needle) => hay.split(needle).length - 1;

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
  // ── 1. ホーム: AI3機能がグレートーン + 近日公開バッジ ──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.waitForSelector("#ngpolice-root button", { timeout: 15000 });
  const homeText = await page.locator("#colorlab-root").innerText();
  check("両アプリがマウントされ日本語が表示された", /診断/.test(homeText));
  check("ホームの「近日公開」バッジが3個（AI3機能）", countOf(homeText, "近日公開") === 3);
  await shotEl("#colorlab-root", "01_home_gray_ai_buttons.png");

  // ── 2. 近日公開モーダル（グローバル化・「AI」の文字が無いこと） ──
  await page.getByRole("button", { name: /顔写真で診断/ }).click();
  await modal().waitFor({ timeout: 5000 });
  const modalText = await page.locator("#colorlab-root div.fixed").first().innerText();
  check("モーダルに「新機能は、近日公開！」がある", /新機能は、近日公開/.test(modalText));
  check("モーダル本文に「AI」の文字が無い", !/AI/i.test(modalText));
  await shotView("02_home_soon_modal.png");
  await page.getByRole("button", { name: /^閉じる$/ }).click();

  // ── 3. 12タイプ診断 → 結果ページ（苦手色1箇所 + 勝ち色10選 + コスメ） ──
  await page.getByRole("button", { name: /パーソナルカラー診断（12タイプ）/ }).click();
  const myType = await runQuiz();
  check("12タイプ診断が完了し localStorage に保存された", !!myType);
  await page.waitForTimeout(400);
  const resText = await page.locator("#colorlab-root").innerText();
  check("結果ページに「似合う色（勝ち色10選）」がある", /似合う色（勝ち色10選）/.test(resText));
  check("苦手色ブロックが1箇所に統合されている（出現1回）", countOf(resText, "苦手な色") === 1);
  check("苦手色の見出しが「苦手な色（顔まわりでは注意）」", /苦手な色（顔まわりでは注意）/.test(resText));
  check("結果ページに「仕上げのコスメはコレ！」がある", /仕上げのコスメはコレ/.test(resText));
  await shotEl("#colorlab-root", "03_quiz_result_ng1_and_cosme.png");

  // ── 3b. 結果ページCTA → 近日公開モーダル（原本のゲート・グローバルモーダル） ──
  await page.getByRole("button", { name: /このタイプで「今日なに着る？」/ }).click();
  await modal().waitFor({ timeout: 5000 });
  check("結果ページCTA → 近日公開モーダルが開く（グローバル化の確認）", await modal().isVisible());
  await page.getByRole("button", { name: /^閉じる$/ }).click();

  // ── 3c. シェア画像PNG（canvas → download） ──
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: /結果を画像で保存|保存・シェア|画像/ }).first().click(),
  ]);
  const sharePath = join(SHOTS, "06_share_image.png");
  await download.saveAs(sharePath);
  check("シェア画像のファイル名が my_personal_color.png", download.suggestedFilename() === "my_personal_color.png");
  const { statSync } = await import("fs");
  const shareSize = statSync(sharePath).size;
  check("シェア画像PNGが生成された (" + shareSize.toLocaleString() + " bytes)", shareSize > 10000);
  log("  SS: 06_share_image.png (ダウンロード実物)");

  // ── 4. コスメ一覧ページ: 上部の「似合うカラー」パレット ──
  await page.getByRole("button", { name: /メニューへ戻る/ }).first().click();
  await page.getByRole("button", { name: /おすすめコスメ/ }).click();
  await page.waitForSelector("#colorlab-root >> text=に似合うコスメはコレ", { timeout: 5000 });
  const cosmeText = await page.locator("#colorlab-root").innerText();
  check("コスメ一覧に上部パレットの説明文がある", /似合うカラー/.test(cosmeText));
  const swatches = await page.locator("#colorlab-root span.w-8.h-8.rounded-full").count();
  check("コスメ一覧 上部パレットの色丸が5個: " + swatches, swatches === 5);
  await shotEl("#colorlab-root", "04_cosme_list_full.png");
  // 一覧が縦に長く上部パレットが潰れるため、上部だけを別に撮る
  await page.locator("#colorlab-root").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shotView("04b_cosme_top_palette.png");

  // ── 5. 骨格診断 → 結果ページ（得意/注意が1行リスト） ──
  await page.getByRole("button", { name: /メニューへ戻る|ホーム/ }).first().click().catch(() => {});
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 10000 });
  await page.getByRole("button", { name: /骨格診断/ }).click();
  for (let i = 0; i < 12; i++) {
    if ((await page.locator("#colorlab-root >> text=あなたのタイプ").count()) > 0) break;
    const opts = page.locator("#colorlab-root button");
    if ((await opts.count()) >= 2) await opts.nth(1).click().catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.waitForSelector("#colorlab-root >> text=得意なデザイン", { timeout: 5000 });
  const frameText = await page.locator("#colorlab-root").innerText();
  check("骨格結果に「得意なデザイン」がある", /得意なデザイン/.test(frameText));
  check("骨格結果に「注意したいデザイン」がある", /注意したいデザイン/.test(frameText));
  // 1行リスト化: space-y-2 の直下に縦積みの行が並ぶ
  const rows = await page.locator("#colorlab-root div.space-y-2 > div").count();
  check("得意/注意が1行リストで縦積み (行数 " + rows + ")", rows >= 4);
  const icons = await page.locator("#colorlab-root div.space-y-2 > div svg").count();
  check("各行にデザインアイコン(SVG)がある (" + icons + "個)", icons === rows);
  await shotEl("#colorlab-root", "05_frame_result_single_column_list.png");

  // ── 6. NG色警察: 出頭→タイプ選択→写真提出→判決（ルールベース判定） ──
  await page.getByRole("button", { name: /出頭する/ }).click();
  await page.waitForSelector("text=あなたのパーソナルカラーは", { timeout: 5000 });
  await page.locator("#ngpolice-root button", { hasText: "イエベ春" }).click();
  await page.waitForSelector("text=本日のコーデ写真を提出せよ", { timeout: 5000 });
  await page.locator("#ngpolice-root input[type=file]").setInputFiles({ name: "coord.png", mimeType: "image/png", buffer: solidPng(48, 20, 20, 22) });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /取り調べを受ける/ }).click();
  await page.waitForSelector("text=/違 反 切 符|無罪放免証/", { timeout: 8000 });
  const verdict = await page.locator("#ngpolice-root").innerText();
  check("NG警察 ルールベース判定が完走(検挙=" + /違 反 切 符/.test(verdict) + ")", /違 反 切 符|無罪放免証/.test(verdict));
  check("結果ページ ボタン1: 本家診断アプリで本格診断する", /本家診断アプリで本格診断する/.test(verdict));
  check("結果ページ ボタン2: LINEで「…の勝ち色」を受け取る", /LINEで「.+の勝ち色」を受け取る/.test(verdict));
  const mainHref = await page.locator("#ngpolice-root a", { hasText: "本家診断アプリで本格診断する" }).getAttribute("href");
  check("本家リンクが blubel.jp/pages/personalcolor", mainHref === "https://www.blubel.jp/pages/personalcolor");
  await shotEl("#ngpolice-root", "07_ngpolice_result.png");

  // ── 7. Liteモードの実測 ──
  check("api.anthropic.com へのリクエストが0件 (実測 " + aiCalls.length + " 件)", aiCalls.length === 0);

  log(failures === 0 ? "=== 検証完了: 全チェック合格 ===" : `=== 検証完了: ${failures} 件のNG ===`);
} catch (e) {
  log("!! 検証中にエラー: " + e.message);
  failures++;
  await shotView("99_error_state.png");
} finally {
  writeFileSync(join(SHOTS, "verify_log.txt"), results.join("\n") + "\n", "utf8");
  await browser.close();
  if (failures > 0) process.exitCode = 1;
}
