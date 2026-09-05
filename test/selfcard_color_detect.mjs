// 生成された「自分の顔で作る」イラストに、カードの2色が本当に写っているかを実測する。
//
// 使い方:
//   node test/selfcard_color_detect.mjs --self-test
//     → 合成画像（既知の 75/25 配分）で検出器そのものを検証する。画像は要らない。
//   node test/selfcard_color_detect.mjs --first=winter --second=autumn a.png b.png
//     → 実際の生成PNGを測る。ΔE(CIE76) が近い画素を数え、2色目の面積比で判定する。
//
// 判定: 白背景を除いた画素のうち、2色目が SECOND_MIN_PCT 以上あれば「視認できる」。
// 画像デコードは playwright の chromium（既に devDependency）で行う。新規依存なし。
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, basename } from "path";
import { pathToFileURL } from "url";
import { FIRST_COLOR, SECOND_COLOR } from "../worker/selfcard-worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const DELTA_E_MAX = 28;      // これ以下なら「その色に見える」とみなす
const WHITE_L_MIN = 92;      // L* がこれ以上かつ彩度が低い画素は白背景として除外
const WHITE_C_MAX = 8;
const SECOND_MIN_PCT = 3.0;  // 2色目がこの割合以上なら合格

// ---- sRGB -> Lab -------------------------------------------------------
function hex2rgb(h) {
  const v = parseInt(h.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgb2lab(r, g, b) {
  const f = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = k(X), fy = k(Y), fz = k(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---- 画素を数える ------------------------------------------------------
// pixels は RGBA の Uint8 配列。step で間引いて数える（1024x1536 全画素は不要）。
export function measure(pixels, targets, step = 2) {
  const lab = targets.map((t) => rgb2lab(...hex2rgb(t.hex)));
  const hit = targets.map(() => 0);
  let total = 0, ink = 0;
  for (let i = 0; i < pixels.length; i += 4 * step) {
    if (pixels[i + 3] < 128) continue;             // 透明は数えない
    total++;
    const px = rgb2lab(pixels[i], pixels[i + 1], pixels[i + 2]);
    const chroma = Math.hypot(px[1], px[2]);
    if (px[0] >= WHITE_L_MIN && chroma <= WHITE_C_MAX) continue;  // 白背景
    ink++;
    let best = -1, bestD = DELTA_E_MAX;
    for (let t = 0; t < lab.length; t++) {
      const d = dE(px, lab[t]);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best >= 0) hit[best]++;
  }
  return {
    total, ink,
    pct: hit.map((h) => (ink ? (h * 100) / ink : 0)),   // 白背景を除いた比
    pctAll: hit.map((h) => (total ? (h * 100) / total : 0)),
  };
}

// ---- PNG を RGBA に開く（chromium の canvas を使う）--------------------
async function decode(page, file) {
  const b64 = readFileSync(file).toString("base64");
  return await page.evaluate(async (d) => {
    const img = new Image();
    await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = "data:image/png;base64," + d; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    const px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, px: Array.from(px) };
  }, b64);
}

// ---- 検出器そのものの自己検証 ------------------------------------------
// 「合格」を返すだけの形骸ゲートにしないため、既知の配分を作って測り直す。
function selfTest() {
  const cases = [
    { first: "winter", second: "autumn", ratio: 0.25, label: "ネイビー75% / キャメル25%" },
    { first: "spring", second: "summer", ratio: 0.25, label: "ピーチ75% / ローズ25%" },
    { first: "winter", second: "autumn", ratio: 0.00, label: "ネイビーのみ（2色目なし＝不合格になるべき）" },
    { first: "summer", second: "spring", ratio: 0.10, label: "ラベンダー90% / イエロー10%" },
  ];
  let ng = 0;
  const W = 200, H = 200;
  for (const c of cases) {
    const a = hex2rgb(FIRST_COLOR[c.first].hex), b = hex2rgb(SECOND_COLOR[c.second].hex);
    const px = new Uint8Array(W * H * 4);
    // 上半分を白背景、下半分を服に見立てて 1色目/2色目で塗り分ける
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let col = [255, 255, 255];
      if (y >= H / 2) col = (x < W * c.ratio) ? b : a;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
    }
    const r = measure(px, [FIRST_COLOR[c.first], SECOND_COLOR[c.second]], 1);
    const want2 = c.ratio * 100;
    const near = Math.abs(r.pct[1] - want2) <= 3;
    const verdict = r.pct[1] >= SECOND_MIN_PCT;
    const shouldPass = c.ratio > 0;
    const good = near && verdict === shouldPass;
    if (!good) ng++;
    console.log(`  ${good ? "ok" : "NG"}  ${c.label}: 1色目 ${r.pct[0].toFixed(1)}% / 2色目 ${r.pct[1].toFixed(1)}% ` +
                `(期待 ${want2.toFixed(0)}% ±3 / 判定 ${verdict ? "視認できる" : "視認できない"})`);
  }
  return ng;
}

// ---- 実行 --------------------------------------------------------------
// 直接叩かれたときだけ CLI として動く。measure() を import しても走らないようにする。
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const argv = process.argv.slice(2);
  const opt = {};
  const files = [];
  for (const a of argv) {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (m) opt[m[1]] = m[2] === undefined ? true : m[2];
    else files.push(a);
  }

  console.log("[0] 検出器の自己検証（合成画像・API不要）");
  const selfNg = selfTest();
  if (selfNg) { console.log(`\n検出器が壊れています (${selfNg}件)。判定は信用できません。`); process.exit(2); }

  if (opt["self-test"] || files.length === 0) {
    console.log("\n自己検証のみ完了。実画像を測るには:");
    console.log("  node test/selfcard_color_detect.mjs --first=winter --second=autumn <生成PNG...>");
    process.exit(0);
  }

  const first = String(opt.first || "");
  const second = String(opt.second || "");
  if (!FIRST_COLOR[first] || !SECOND_COLOR[second]) {
    console.log("--first / --second に spring|summer|autumn|winter を指定してください");
    process.exit(2);
  }
  const targets = [FIRST_COLOR[first], SECOND_COLOR[second]];
  console.log(`\n[1] 実画像の測定  1色目=${targets[0].en}${targets[0].hex} / 2色目=${targets[1].en}${targets[1].hex}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<html><body></body></html>");
  let ng = 0;
  for (const f of files) {
    const p = resolve(ROOT, f);
    if (!existsSync(p)) { console.log(`  NG  ${f}: ファイルが無い`); ng++; continue; }
    const img = await decode(page, p);
    const r = measure(Uint8Array.from(img.px), targets, 2);
    const pass = r.pct[1] >= SECOND_MIN_PCT;
    if (!pass) ng++;
    console.log(`  ${pass ? "ok" : "NG"}  ${basename(f)} (${img.w}x${img.h})  ` +
      `1色目 ${r.pct[0].toFixed(1)}% / 2色目 ${r.pct[1].toFixed(1)}%  ` +
      `[白背景を除く画素 ${r.ink}]  しきい値 2色目>=${SECOND_MIN_PCT}%`);
  }
  await browser.close();
  console.log(`\n=== ${files.length - ng}/${files.length} 合格 ===`);
  process.exit(ng ? 1 : 0);
}
