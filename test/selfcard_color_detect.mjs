// 生成された「自分の顔で作る」イラストに、カードの2色が本当に写っているかを実測する。
//
// 使い方:
//   node test/selfcard_color_detect.mjs --self-test
//     → 合成画像（既知の配分）で検出器そのものを検証する。画像は要らない。
//   node test/selfcard_color_detect.mjs --first=winter --second=autumn a.png b.png
//     → 実際の生成PNGを測る。
//
// 2つの指標を出す。片方だけでは誤判定するため、両方を見る。
//
//   [絶対] 各画素を Lab で色見本に最近傍マッチさせた面積比。
//          色見本どおりの色が出ているかは分かるが、**2色が近いペアでは効かない**。
//          実測 ΔE: ピーチ×キャメル 22.1 / ピーチ×ローズ 24.2 と、
//          色鉛筆調の彩度落ちより小さい。取り違えが起きる。
//   [相対] Lab 上で「1色目→2色目」を結ぶ線に各画素を射影した位置 t。
//          t>=0.35 の画素を「2色目側に寄っている」と数える。
//          色見本ぴったりでなくても、1色目から2色目の方向へ振れていれば拾える。
//
// 合格は「どちらかが基準を満たす」。近いペアで [絶対] が効かないことへの手当てで、
// しきい値を緩めたのではない。判定の根拠になった指標を必ず表示する。
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve, basename } from "path";
import { FIRST_COLOR, SECOND_COLOR } from "../worker/selfcard-worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const DELTA_E_MAX = 28;      // [絶対] これ以下なら「その色見本に見える」
const WHITE_L_MIN = 92;      // L* がこれ以上かつ低彩度の画素は白背景として除外
const WHITE_C_MAX = 8;
const LINE_PERP_MAX = 22;    // [相対] 1色目-2色目の線からこれ以上離れた色（髪・黒線）は無関係
const LINE_T_MIN = -0.3;     // [相対] 線上とみなす t の範囲
const LINE_T_MAX = 1.3;
const LEAN_T = 0.35;         // [相対] これ以上なら2色目側
const ABS_MIN_PCT = 3.0;     // [絶対] 合格ライン
const LEAN_MIN_PCT = 6.0;    // [相対] 合格ライン

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
export const pairDeltaE = (t1, t2) => dE(rgb2lab(...hex2rgb(t1.hex)), rgb2lab(...hex2rgb(t2.hex)));

// ---- 画素を数える ------------------------------------------------------
// pixels は RGBA の Uint8 配列。step で間引く（1024x1536 の全画素は要らない）。
export function measure(pixels, targets, step = 2) {
  const L1 = rgb2lab(...hex2rgb(targets[0].hex));
  const L2 = rgb2lab(...hex2rgb(targets[1].hex));
  const d = [L2[0] - L1[0], L2[1] - L1[1], L2[2] - L1[2]];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];

  const hit = [0, 0];
  let total = 0, ink = 0, onLine = 0, lean = 0;
  for (let i = 0; i < pixels.length; i += 4 * step) {
    if (pixels[i + 3] < 128) continue;                              // 透明
    total++;
    const p = rgb2lab(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (p[0] >= WHITE_L_MIN && Math.hypot(p[1], p[2]) <= WHITE_C_MAX) continue;  // 白背景
    ink++;

    // [絶対] 色見本への最近傍
    const d1 = dE(p, L1), d2 = dE(p, L2);
    if (Math.min(d1, d2) <= DELTA_E_MAX) hit[d1 <= d2 ? 0 : 1]++;

    // [相対] 1色目→2色目の線への射影
    const v = [p[0] - L1[0], p[1] - L1[1], p[2] - L1[2]];
    const t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / dd;
    const perp = Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]);
    if (perp <= LINE_PERP_MAX && t >= LINE_T_MIN && t <= LINE_T_MAX) {
      onLine++;
      if (t >= LEAN_T) lean++;
    }
  }
  return {
    total, ink, onLine,
    pct: hit.map((h) => (ink ? (h * 100) / ink : 0)),          // [絶対] 白背景を除いた比
    leanPct: onLine ? (lean * 100) / onLine : 0,               // [相対] 線上画素のうち2色目側
    deltaE: dE(L1, L2),
  };
}

export function verdict(m) {
  const byAbs = m.pct[1] >= ABS_MIN_PCT;
  const byLean = m.leanPct >= LEAN_MIN_PCT;
  return { pass: byAbs || byLean, byAbs, byLean };
}

export function line(m) {
  const v = verdict(m);
  return `[絶対] 1色目 ${m.pct[0].toFixed(1)}% / 2色目 ${m.pct[1].toFixed(1)}%` +
    `  [相対] 2色目側 ${m.leanPct.toFixed(1)}%` +
    `  (色見本間 ΔE ${m.deltaE.toFixed(1)}${m.deltaE < 30 ? " ←近い。絶対は当てにならない" : ""})` +
    `  根拠: ${v.byAbs && v.byLean ? "両方" : v.byAbs ? "絶対" : v.byLean ? "相対のみ" : "なし"}`;
}

// ---- PNG を RGBA に開く（chromium の canvas を使う）--------------------
export async function decodeB64(page, b64) {
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
// 2色目ゼロの面は必ず不合格になること（＝落とすべきものを落とせること）まで見る。
function selfTest() {
  const cases = [
    { first: "winter", second: "autumn", ratio: 0.25, label: "ネイビー75% / キャメル25%" },
    { first: "spring", second: "summer", ratio: 0.25, label: "ピーチ75% / ローズ25%（近いペア）" },
    { first: "winter", second: "autumn", ratio: 0.00, label: "ネイビーのみ（2色目なし＝不合格になるべき）" },
    { first: "spring", second: "summer", ratio: 0.00, label: "ピーチのみ（2色目なし＝不合格になるべき）" },
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
    const m = measure(px, [FIRST_COLOR[c.first], SECOND_COLOR[c.second]], 1);
    const v = verdict(m);
    const want2 = c.ratio * 100;
    const shouldPass = c.ratio > 0;
    // 面積比が期待どおりで、かつ合否が期待どおりであること
    const good = Math.abs(m.pct[1] - want2) <= 3 && Math.abs(m.leanPct - want2) <= 3 && v.pass === shouldPass;
    if (!good) ng++;
    console.log(`  ${good ? "ok" : "NG"}  ${c.label}\n        ${line(m)}  期待 ${want2.toFixed(0)}% / ${shouldPass ? "合格" : "不合格"}`);
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
    const img = await decodeB64(page, readFileSync(p).toString("base64"));
    const m = measure(Uint8Array.from(img.px), targets, 2);
    const v = verdict(m);
    if (!v.pass) ng++;
    console.log(`  ${v.pass ? "ok" : "NG"}  ${basename(f)} (${img.w}x${img.h})\n        ${line(m)}`);
  }
  await browser.close();
  console.log(`\n=== ${files.length - ng}/${files.length} 合格 ===`);
  process.exit(ng ? 1 : 0);
}
