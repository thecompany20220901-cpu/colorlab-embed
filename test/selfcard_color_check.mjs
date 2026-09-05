// 生成イラストに「カードの2色」が実際に入っているかを測る。
//
//   node test/selfcard_color_check.mjs <画像> <1位> <2位>
//   例: node test/selfcard_color_check.mjs out.png winter autumn   # ネイビー×キャメル
//
// 見方:
//   ・画素を CIELab に直し、a/b 平面（色みだけ。明度は色鉛筆の陰影で大きく振れるので使わない）で
//     カードの2色に近いほうへ振り分ける。彩度が低い画素（白背景・黒い線・淡い影）は数えない。
//   ・全体の被覆率に加えて「背景マージン（左右それぞれ外側12%）」を別に出す。
//     肌の色はキャメルやピーチに近く、全体の数字だけだと1色目/2色目を取り違えるため、
//     肌が入らない背景マージンのほうを主たる判定に使う。
//   ・判定はあくまで目安。最終確認は必ず画像を目で見ること。
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { FIRST_COLOR, SECOND_COLOR } from "../worker/selfcard-worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// 色み（a/b）の許容距離。ピーチ(a32,b22)とキャメル(a21,b32)の距離が約15なので、
// 取り違えないよう 12 に置き、さらに「近いほうだけ数える」で二重計上を防ぐ。
export const AB_TOLERANCE = 12;
// これ未満の彩度は白背景・黒線・淡い影とみなして数えない。
export const MIN_CHROMA = 8;
// 背景マージンでこの割合を超えていれば「その色が見えている」とみなす目安。
export const MIN_BG_RATIO = 0.005;

const srgbToLab = (r, g, b) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = g2(X), fy = g2(Y), fz = g2(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const hexLab = (hex) => srgbToLab(parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));

/* 画像(dataURL または Buffer)を測る。page は既に開いている Playwright の Page。 */
export async function measureColors(page, image, c1, c2) {
  const dataUrl = Buffer.isBuffer(image)
    ? "data:image/png;base64," + image.toString("base64") : image;
  const px = await page.evaluate(async (u) => {
    const im = new Image();
    await new Promise((ok, err) => { im.onload = ok; im.onerror = err; im.src = u; });
    // 実寸のままだと100万画素を超えて往復が重い。長辺256に落として測る（比率は変わらない）。
    const sc = 256 / Math.max(im.naturalWidth, im.naturalHeight);
    const w = Math.max(1, Math.round(im.naturalWidth * sc));
    const h = Math.max(1, Math.round(im.naturalHeight * sc));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const x = cv.getContext("2d");
    x.drawImage(im, 0, 0, w, h);
    return { w: w, h: h, data: [...x.getImageData(0, 0, w, h).data] };
  }, dataUrl);

  const t1 = hexLab(c1.hex), t2 = hexLab(c2.hex);
  const zero = () => ({ total: 0, c1: 0, c2: 0 });
  const all = zero(), bg = zero();
  const margin = Math.round(px.w * 0.12);
  for (let y = 0; y < px.h; y++) {
    for (let xx = 0; xx < px.w; xx++) {
      const i = (y * px.w + xx) * 4;
      const [, a, b] = srgbToLab(px.data[i], px.data[i + 1], px.data[i + 2]);
      const inBg = xx < margin || xx >= px.w - margin;
      all.total++; if (inBg) bg.total++;
      if (Math.sqrt(a * a + b * b) < MIN_CHROMA) continue;   // 白背景・黒線・淡い影
      const d1 = Math.hypot(a - t1[1], b - t1[2]);
      const d2 = Math.hypot(a - t2[1], b - t2[2]);
      if (Math.min(d1, d2) > AB_TOLERANCE) continue;
      const hit = d1 <= d2 ? "c1" : "c2";                    // 近いほうだけ数える
      all[hit]++; if (inBg) bg[hit]++;
    }
  }
  const r = (n, d) => (d ? n / d : 0);
  return {
    size: px.w + "x" + px.h,
    all: { c1: r(all.c1, all.total), c2: r(all.c2, all.total) },
    bg: { c1: r(bg.c1, bg.total), c2: r(bg.c2, bg.total) },
  };
}

/* 2色とも見えているか（目安）。背景マージンを主、全体を従で見る。 */
export const bothVisible = (m) =>
  m.bg.c1 >= MIN_BG_RATIO && m.bg.c2 >= MIN_BG_RATIO;

export function report(label, first, second, m) {
  const c1 = FIRST_COLOR[first], c2 = SECOND_COLOR[second];
  const pc = (v) => (v * 100).toFixed(2) + "%";
  console.log(`  ${label} [${m.size}]`);
  console.log(`    1色目 ${c1.en} ${c1.hex} : 全体 ${pc(m.all.c1)} / 背景 ${pc(m.bg.c1)}`);
  console.log(`    2色目 ${c2.en} ${c2.hex} : 全体 ${pc(m.all.c2)} / 背景 ${pc(m.bg.c2)}`);
  console.log(`    判定: ${bothVisible(m) ? "2色とも見えている" : "2色目が見えていない（要目視）"}`);
  return bothVisible(m);
}

// ── 単体起動: 画像ファイルを1枚測る ──
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [file, first, second] = process.argv.slice(2);
  if (!file || !existsSync(file) || !FIRST_COLOR[first] || !SECOND_COLOR[second]) {
    console.error("使い方: node test/selfcard_color_check.mjs <画像> <1位> <2位>");
    console.error("  1位/2位: spring | summer | autumn | winter");
    console.error("  例: node test/selfcard_color_check.mjs out.png winter autumn  # ネイビー×キャメル");
    process.exit(2);
  }
  const b = await chromium.launch();
  const page = await b.newPage();
  const m = await measureColors(page, readFileSync(file), FIRST_COLOR[first], SECOND_COLOR[second]);
  const okv = report(file, first, second, m);
  await b.close();
  process.exit(okv ? 0 : 1);
}
