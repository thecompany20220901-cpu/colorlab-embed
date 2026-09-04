// 対象1〜3(設問イラスト / 結果画面 / コーデ提案・採点)の見た目を撮る検収用スクリプト。
// 出力: test/screenshots/4x_*.png
//   40_quiz_qNN … 13問 + 同点時の設問
//   41_result_*  … 結果画面(4タイプぶん)
//   42_stylist_* … コーデ提案(10シーン)
//   43_score_*   … コーデ採点の Before/After
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";
import zlib from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "screenshots");
mkdirSync(SHOTS, { recursive: true });
const ART = "file://" + join(__dirname, "local_article.html").replace(/\\/g, "/");

// 単色PNGを自作(採点の入力に使う。外部素材に依存させない)
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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngBands(W, H, bands) {
  const raw = [];
  for (let y = 0; y < H; y++) {
    const row = [0];
    const band = bands.find((b) => y >= b.y0 * H && y < b.y1 * H) || bands[bands.length - 1];
    for (let x = 0; x < W; x++) row.push(band.rgb[0], band.rgb[1], band.rgb[2]);
    raw.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(raw))), chunk("IEND", Buffer.alloc(0))]);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [page error]", m.text()); });
const cl = () => page.locator("#colorlab-root");
const setProfile = (v) => page.evaluate((val) => {
  try { val ? localStorage.setItem("colorlab-profile", val) : localStorage.removeItem("colorlab-profile"); } catch (e) {}
}, v);

// ── 対象1: 13問 + 同点時の設問 ──
await page.goto(ART, { waitUntil: "networkidle" });
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await setProfile(null);
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await cl().getByRole("button", { name: /^質問で診断/ }).click();
for (let i = 1; i <= 13; i++) {
  await page.waitForTimeout(180);
  const card = cl().locator("div.fade-up, div").filter({ hasText: /^Q\d+/ }).first();
  await cl().screenshot({ path: join(SHOTS, `40_quiz_q${String(i).padStart(2, "0")}.png`) });
  // A と B を交互に押して同点(=最後の設問)へ持ち込む
  const pick = i % 2 === 1 ? "A" : "B";
  const btns = cl().locator("button");
  const n = await btns.count();
  for (let b = 0; b < n; b++) {
    const t = (await btns.nth(b).innerText().catch(() => "")).trim();
    if (t.startsWith(pick)) { await btns.nth(b).click(); break; }
  }
}
await page.waitForTimeout(300);
const tieVisible = await cl().locator("text=最終質問").count();
if (tieVisible) {
  await cl().screenshot({ path: join(SHOTS, "40_quiz_tie.png") });
  const btns = cl().locator("button");
  const n = await btns.count();
  for (let b = 0; b < n; b++) {
    const t = (await btns.nth(b).innerText().catch(() => "")).trim();
    if (t.startsWith("B")) { await btns.nth(b).click(); break; }
  }
}
console.log("対象1: 設問イラスト13問" + (tieVisible ? " + 同点時" : "(同点にならず)") + " を撮影");

// ── 対象2: 4タイプの結果画面 ──
// Q12[].A / Q12[].B の配点表から、そのタイプが必ず1位になる回答列を作ってある
// (各問で目的のタイプが入っている側を選ぶだけ)。同点判定に頼らないので確実。
const ANSWERS = {
  spring: "AAAAAAAAAAAAA",
  summer: "BAABBBAAABBAA",
  autumn: "ABBAAABBBAABB",
  winter: "BBBBBBBBBBBBB",
};
for (const t of ["spring", "summer", "autumn", "winter"]) {
  await page.goto(ART, { waitUntil: "networkidle" });
  await setProfile(null);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await cl().getByRole("button", { name: /^質問で診断/ }).click();
  for (let i = 1; i <= 13; i++) {
    await page.waitForTimeout(120);
    const want = ANSWERS[t][i - 1];
    const btns = cl().locator("button");
    const n = await btns.count();
    for (let b = 0; b < n; b++) {
      const s2 = (await btns.nth(b).innerText().catch(() => "")).trim();
      if (s2.startsWith(want)) { await btns.nth(b).click(); break; }
    }
  }
  await page.waitForTimeout(500);
  const line1 = (await cl().innerText()).split(String.fromCharCode(10)).find((l) => l.includes("あなたは")) || "?";
  console.log("  " + t + ": " + line1);
  await cl().screenshot({ path: join(SHOTS, `41_result_${t}_full.png`) });
}
console.log("対象2: 結果画面を4タイプぶん撮影");

// ── 対象3: コーデ提案(シーンを変えて10通り) ──
// [ファイル名, 気分の自由入力, TPO, デート細分] の順。date だけは自由入力ではなく
// 「今日のシーン=デート」＋「どんなデート?=ディナー」で選ぶ（実際の使われ方に合わせる）。
const SCENES = [
  ["就活", "就活の面接", null, null],
  ["商談・仕事", "初回商談", null, null],
  ["婚活", "婚活パーティー", null, null],
  ["デート", "", "デート", "ディナー"],
  ["相手のタイプ別", "彼氏の好みに合わせたい", null, null],
  ["髪色", "髪色に合わせたい", null, null],
  ["天気", "雨の日", null, null],
  ["冠婚葬祭", "結婚式", null, null],
  ["勝負日", "プレゼン", null, null],
  ["年代別", "30代らしく", null, null],
];
for (const [label, mood, tpo, sub] of SCENES) {
  await page.goto(ART, { waitUntil: "networkidle" });
  await setProfile(JSON.stringify({ myType: "summer", mySecond: "spring", myFrame: null }));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await cl().getByRole("button", { name: /パーソナルカラー別コーデ提案/ }).first().click();
  await page.waitForTimeout(200);
  if (tpo) {
    await cl().getByRole("button", { name: new RegExp("^" + tpo + "$") }).first().click();
    await page.waitForTimeout(150);
  }
  if (sub) {
    await cl().getByRole("button", { name: new RegExp("^" + sub + "$") }).first().click();
    await page.waitForTimeout(150);
  }
  const input = cl().locator("input[placeholder^='例']");
  if (mood && await input.count()) await input.fill(mood);
  await cl().getByRole("button", { name: /コーデを提案してもらう/ }).click();
  await page.waitForTimeout(900);
  const title = (await cl().innerText()).split(String.fromCharCode(10)).find((l) => /の勝ち色$/.test(l.trim())) || "?";
  console.log("  " + label + " → " + title.trim());
  await cl().screenshot({ path: join(SHOTS, `42_stylist_${label}.png`) });
}
console.log("対象3: コーデ提案を10シーンぶん撮影");

// ── 対象3: コーデ採点の Before/After ──
await page.goto(ART, { waitUntil: "networkidle" });
await setProfile(JSON.stringify({ myType: "summer", mySecond: "spring", myFrame: null }));
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
await cl().getByRole("button", { name: /今日のコーデ採点/ }).first().click();
await page.waitForTimeout(200);
// 上=オレンジ(ブルベ夏の苦手色) / 下=ネイビー / 背景=白 の合成写真
const buf = pngBands(600, 900, [
  { y0: 0, y1: 0.28, rgb: [245, 245, 245] },
  { y0: 0.28, y1: 0.56, rgb: [232, 114, 42] },
  { y0: 0.56, y1: 1.01, rgb: [30, 42, 68] },
]);
await cl().getByRole("button", { name: /撮影済みの写真を選ぶ/ }).click().catch(() => {});
await page.setInputFiles("#colorlab-root input[type=file]", { name: "outfit.png", mimeType: "image/png", buffer: buf });
await page.waitForTimeout(1500);
await cl().screenshot({ path: join(SHOTS, "43_score_result.png") });
console.log("対象3: コーデ採点の Before/After を撮影");

await browser.close();
