// selfcard_color_check.mjs（2色検出）そのものを検証する。
//
// 実画像を1枚も生成せず、canvas で「2色目が入っていない絵」と「入っている絵」を
// 作って、検出器がその2つを取り違えないことを見る。12通りの配色すべてで回す。
// ※ これはあくまで**検出器の検証**であって、モデルがプロンプトに従うかの検証ではない。
//    実物の確認は node test/selfcard_live.mjs（実接続・課金あり）で行う。
// 実行: node test/selfcard_color_check_test.mjs
import { chromium } from "playwright";
import { FIRST_COLOR, SECOND_COLOR } from "../worker/selfcard-worker.js";
import { measureColors, bothVisible, MIN_BG_RATIO } from "./selfcard_color_check.mjs";

// 生成イラストを模した絵を canvas で描く。
//   withSecond=false … v1 の症状（服も背景のストロークも1色目だけ）
//   withSecond=true  … v2 で狙う形（襟・袖口・背景ストロークに2色目）
// どちらにも肌色の顔を置く。キャメルやピーチは肌に近いので、
// 「肌を2色目と数えていないか」もここで一緒に見る。
const draw = (h1, h2, withSecond) => `(() => {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 384;
  const x = cv.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, 256, 384);
  // 背景のラフなストローク（左右のマージンにかかる）
  x.fillStyle = "${h1}";
  x.fillRect(4, 40, 22, 200); x.fillRect(230, 70, 22, 180);
  ${withSecond ? `x.fillStyle = "${h2}"; x.fillRect(30, 250, 18, 90); x.fillRect(210, 260, 18, 80);` : ""}
  // 顔（肌色）と髪
  x.fillStyle = "#1a1a1a"; x.beginPath(); x.ellipse(128, 110, 58, 70, 0, 0, 7); x.fill();
  x.fillStyle = "#F2C9A8"; x.beginPath(); x.ellipse(128, 118, 44, 56, 0, 0, 7); x.fill();
  // 服（1色目）
  x.fillStyle = "${h1}"; x.fillRect(56, 185, 144, 199);
  ${withSecond ? `
  // 襟・袖口（2色目）
  x.fillStyle = "${h2}";
  x.fillRect(104, 185, 48, 30);
  x.fillRect(56, 330, 26, 54); x.fillRect(174, 330, 26, 54);` : ""}
  return cv.toDataURL("image/png");
})()`;

const ok = [], ng = [];
const check = (c, l) => { (c ? ok : ng).push(l); return c; };

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");

const PAIRS = [];
for (const f of ["spring", "summer", "autumn", "winter"]) {
  for (const s of ["spring", "summer", "autumn", "winter"]) if (f !== s) PAIRS.push([f, s]);
}

for (const [first, second] of PAIRS) {
  const c1 = FIRST_COLOR[first], c2 = SECOND_COLOR[second];
  const label = `${c1.en}×${c2.en}`;

  const without = await page.evaluate(draw(c1.hex, c2.hex, false));
  const mw = await measureColors(page, without, c1, c2);
  check(!bothVisible(mw), `${label}: 2色目なしの絵を「見えていない」と判定 (背景 ${(mw.bg.c2 * 100).toFixed(2)}%)`);
  check(mw.bg.c1 >= MIN_BG_RATIO, `${label}: 2色目なしでも1色目は検出できる (背景 ${(mw.bg.c1 * 100).toFixed(2)}%)`);

  const withIt = await page.evaluate(draw(c1.hex, c2.hex, true));
  const mi = await measureColors(page, withIt, c1, c2);
  check(bothVisible(mi), `${label}: 2色目ありの絵を「2色とも見えている」と判定 (背景 ${(mi.bg.c2 * 100).toFixed(2)}%)`);
  check(mi.all.c2 > mw.all.c2, `${label}: 2色目を足したぶん被覆率が増える (${(mw.all.c2 * 100).toFixed(2)}% → ${(mi.all.c2 * 100).toFixed(2)}%)`);
}

await browser.close();
console.log("OK");
ok.forEach((l) => console.log("  ✓ " + l));
if (ng.length) { console.log("NG"); ng.forEach((l) => console.log("  ✗ " + l)); process.exit(1); }
console.log(`\nすべて通過 (${ok.length} 項目)`);
