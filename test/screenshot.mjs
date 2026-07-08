// §5 検証: Playwright で local_article.html を開き、両アプリの表示・画面遷移・
// localStorage再訪(おかえり)・375px レイアウトを確認し、test/screenshots/ にSSを出力。
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [page error]", m.text()); });

async function shot(name) { await page.screenshot({ path: join(SHOTS, name), fullPage: true }); log("  SS: " + name); }

try {
  // ── 1. 初期表示 ──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.waitForSelector("#ngpolice-root button", { timeout: 15000 });
  log("両アプリがマウントされ表示された");
  // 文字化けチェック（日本語が正しく描画されているか）
  const hasJp = await page.locator("#colorlab-root").innerText();
  log("colorlab 日本語表示OK: " + /診断/.test(hasJp));
  await shot("01_article_both_apps.png");

  // ── 2. AI機能=近日公開モーダル（Liteモード確認） ──
  await page.getByRole("button", { name: /顔写真で診断/ }).click();
  await page.waitForSelector("text=AI機能は近日公開", { timeout: 5000 });
  log("AI機能タップ→「近日公開」モーダルが表示された");
  await shot("02_colorlab_ai_soon_modal.png");

  // ── 3. モーダルから12タイプ診断へ誘導 ──
  await page.getByRole("button", { name: /12タイプ診断をはじめる/ }).click();
  await page.waitForSelector("text=12タイプ カラー診断", { timeout: 5000 });
  log("モーダル→12タイプ診断へ遷移した");
  await shot("03_colorlab_quiz.png");

  // ── 3b. 診断1問目の SVG 比較イラスト（QuizIllust）が表示されていること ──
  await page.waitForSelector("#colorlab-root svg", { timeout: 5000 });
  const svgCount = await page.locator("#colorlab-root svg").count();
  log("診断Q1のSVG比較イラスト数(A/B等): " + svgCount + " → " + (svgCount >= 2 ? "左右比較の図を確認" : "NG"));
  // 質問見出し＋イラストを含む領域を狙って撮影（外部CDN画像に依存しないSVG描画の証跡）
  const quizBox = page.locator("#colorlab-root h2").first();
  await quizBox.scrollIntoViewIfNeeded().catch(() => {});
  await shot("03b_colorlab_quiz_svg_illust.png");

  // ── 4. 診断を最後まで進める（A/先頭の選択肢を押し続ける） ──
  // 停止条件: localStorage に myType が保存されたら診断完了とみなす。
  for (let i = 0; i < 30; i++) {
    const savedType = await page.evaluate(() => {
      try { const p = JSON.parse(localStorage.getItem("colorlab-profile") || "{}"); return p.myType || null; } catch (e) { return null; }
    });
    if (savedType) break;
    const btns = page.locator("#colorlab-root button");
    const n = await btns.count();
    let clicked = false;
    for (let b = 0; b < n; b++) {
      const t = (await btns.nth(b).innerText().catch(() => "")).trim();
      if (t === "A" || /^A\b/.test(t) || (t.length <= 3 && /[A-DＡ-Ｄ]/.test(t))) { await btns.nth(b).click().catch(() => {}); clicked = true; break; }
    }
    if (!clicked && n > 0) { await btns.first().click().catch(() => {}); }
    await page.waitForTimeout(220);
  }
  await shot("04_colorlab_result.png");
  const saved = await page.evaluate(() => localStorage.getItem("colorlab-profile"));
  log("localStorage colorlab-profile 保存確認: " + (saved ? saved : "(未保存)"));

  // ── 5. リロード→「おかえり」表示（再訪） ──
  await page.goto(ART, { waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root", { timeout: 10000 });
  await page.waitForTimeout(500);
  const okaeri = await page.locator("#colorlab-root >> text=おかえりなさい").count();
  log("リロード後の『おかえりなさい』表示: " + (okaeri > 0 ? "OK" : "NG"));
  await shot("05_colorlab_revisit_okaeri.png");

  // ── 6. NG色警察: 出頭→タイプ選択→写真提出→判決（ルールベース判定） ──
  await page.getByRole("button", { name: /出頭する/ }).click();
  await page.waitForSelector("text=あなたのパーソナルカラーは", { timeout: 5000 });
  await shot("06_ngpolice_type.png");
  await page.locator("#ngpolice-root button", { hasText: "イエベ春" }).click();
  await page.waitForSelector("text=本日のコーデ写真を提出せよ", { timeout: 5000 });
  // 黒っぽい画像 → イエベ春のNG(黒)で「検挙」になるはず
  const png = solidPng(48, 20, 20, 22);
  await page.locator("#ngpolice-root input[type=file]").setInputFiles({ name: "coord.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(400);
  await shot("07_ngpolice_upload_preview.png");
  await page.getByRole("button", { name: /取り調べを受ける/ }).click();
  await page.waitForSelector("text=/違 反 切 符|無罪放免証/", { timeout: 8000 });
  const verdict = await page.locator("#ngpolice-root").innerText();
  log("NG警察 判定完了。検挙=" + /違 反 切 符/.test(verdict) + " / 無罪=" + /無罪放免証/.test(verdict));
  await shot("08_ngpolice_result.png");

  log("=== 検証完了: すべての主要画面遷移を確認 ===");
} catch (e) {
  log("!! 検証中にエラー: " + e.message);
  await shot("99_error_state.png");
} finally {
  writeFileSync(join(SHOTS, "verify_log.txt"), results.join("\n") + "\n", "utf8");
  await browser.close();
}
