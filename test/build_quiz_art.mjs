/**
 * 診断イラスト素材ビルダー
 *   src/assets/<元PNG>  (1408x768 の左右ペア)
 *     -> 中央の仕切りを避けて左右に分割
 *     -> 右下のウォーターマーク(✦)をパッチ合成で除去
 *     -> 白余白をトリミング
 *     -> 幅360pxへ縮小
 *     -> WebP出力  src/assets/mens_qNN_<slot>.webp
 *
 * 使い方: node test/build_quiz_art.mjs [キー...]   (無指定=全件)
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const DIR = "C:/Users/newfa/projects/colorlab-embed/src/assets";

// 中身で判別した対応表。ユーザー配置ファイルはリネームしない。
const PAIRS = [
  { key: "q01", src: "1.png", left: "mens_q01_skin_warm", right: "mens_q01_skin_cool" },
  { key: "q03", src: "2.png", left: "mens_q03_eye_light", right: "mens_q03_eye_deep" },
  { key: "q04", src: "3.png", left: "mens_q04_wrist_green", right: "mens_q04_wrist_blue" },
  { key: "q08", src: "4.png", left: "mens_q08_knit_light", right: "mens_q08_knit_deep" },
  { key: "q11", src: "5.png", left: "mens_q11_flush_tan", right: "mens_q11_flush_pink" },
  { key: "q13", src: "6.png", left: "mens_q13_hair_brown", right: "mens_q13_hair_black" },
  // q06(白T offwhite/white)は素材未着のため未定義。
];

const INSET = 12;        // 中央の仕切り線を避ける
const OUT_W = 300;       // 出力幅(表示120px x DPR2.5)
const QUALITY = 0.72;
// ウォーターマーク(全画像で共通位置)。少し広めに取る。
const WM = { x: 1266, y: 616, w: 50, h: 60 };

const want = process.argv.slice(2);
const targets = want.length ? PAIRS.filter((p) => want.includes(p.key)) : PAIRS;

const browser = await chromium.launch();
const page = await browser.newPage();
const report = [];

for (const pair of targets) {
  const file = path.join(DIR, pair.src);
  if (!fs.existsSync(file)) { console.log(`skip (無し): ${pair.src}`); continue; }
  const dataUrl = "data:image/png;base64," + fs.readFileSync(file).toString("base64");

  const out = await page.evaluate(async ({ dataUrl, INSET, OUT_W, QUALITY, WM }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });

    const full = document.createElement("canvas");
    full.width = img.width; full.height = img.height;
    const fx = full.getContext("2d");
    fx.drawImage(img, 0, 0);

    /* --- ウォーターマーク除去 -------------------------------------------
       ✦ は「白に近い半透明オーバーレイ」なので、周囲より明るい画素だけを
       マスクして Laplace 補間で埋める。輪郭線(周囲より暗い)は影響を受けない。
       矩形パッチの貼り替えだと白背景を持ってきて白い箱が残るため採用しない。 */
    // 判定は星の直近だけに限る。行全体で見ると人物右側の白背景を拾ってしまう
    // (2026-07-19 実測: 行中央値だと x1264-1408 が丸ごとマスクされた)。
    const B = { x: WM.x - 14, y: WM.y - 14, w: WM.w + 28, h: WM.h + 28 };
    const reg = fx.getImageData(B.x, B.y, B.w, B.h);
    const rd = reg.data;
    const lum = (i) => 0.299 * rd[i] + 0.587 * rd[i + 1] + 0.114 * rd[i + 2];

    // 基準は「この窓の下位25%の明るさ」= 地の生地。星はそこから大きく浮く。
    const all = [];
    for (let i = 0; i < B.w * B.h; i++) all.push(lum(i * 4));
    const sorted = all.slice().sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)];

    const mask = new Uint8Array(B.w * B.h);
    let nMask = 0;
    for (let i = 0; i < B.w * B.h; i++) {
      if (all[i] > p25 + 9) { mask[i] = 1; nMask++; }
    }
    // 生地が明るい素材(白シャツ等)では星が浮かない=マスクが窓の大半になる。
    // その場合は誤爆なので何もしない。
    if (nMask > B.w * B.h * 0.45) { mask.fill(0); nMask = 0; }

    const dil = new Uint8Array(mask);
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      if (!mask[y * B.w + x]) continue;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < B.w && ny < B.h) dil[ny * B.w + nx] = 1;
      }
    }
    // Laplace 補間(境界=非マスク画素を固定して内側を平均で緩和)
    for (let it = 0; it < 420; it++) {
      for (let y = 1; y < B.h - 1; y++) for (let x = 1; x < B.w - 1; x++) {
        if (!dil[y * B.w + x]) continue;
        const i = (y * B.w + x) * 4;
        for (let c = 0; c < 3; c++) {
          rd[i + c] = 0.25 * (rd[i - 4 + c] + rd[i + 4 + c] +
            rd[i - B.w * 4 + c] + rd[i + B.w * 4 + c]);
        }
      }
    }
    fx.putImageData(reg, B.x, B.y);
    const best = [nMask, B.w * B.h], bestScore = nMask;

    /* --- 左右分割 + 余白トリミング + 縮小 + WebP ------------------------ */
    const d = fx.getImageData(0, 0, full.width, full.height).data;
    const half = Math.floor(full.width / 2);

    // ウォーターマーク(✦)は全素材で y≈645 の固定位置に入る。半透明オーバーレイのため
    // 補間除去では生地の陰影と区別できず薄く残る(2026-07-19 実測)。確実に消すため
    // 下端を一律カットする。いずれも頭部〜肩のバストアップなので構図上の損失はない。
    const CROP_BOTTOM = 606;

    const bbox = (x0, x1) => {
      let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      for (let y = 0; y < CROP_BOTTOM; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * full.width + x) * 4;
          if (d[i + 3] < 16) continue;
          if (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244) continue;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      return { minX, minY, maxX, maxY };
    };

    const emit = (bb) => {
      const pad = 4;
      const sx = Math.max(0, bb.minX - pad), sy = Math.max(0, bb.minY - pad);
      const sw = Math.min(full.width - sx, bb.maxX - bb.minX + 1 + pad * 2);
      const sh = Math.min(CROP_BOTTOM - sy, bb.maxY - bb.minY + 1 + pad * 2);
      const scale = OUT_W / sw;
      const o = document.createElement("canvas");
      o.width = OUT_W; o.height = Math.round(sh * scale);
      const ox = o.getContext("2d");
      ox.imageSmoothingQuality = "high";
      ox.fillStyle = "#ffffff"; ox.fillRect(0, 0, o.width, o.height);
      ox.drawImage(full, sx, sy, sw, sh, 0, 0, o.width, o.height);
      return { url: o.toDataURL("image/webp", QUALITY), w: o.width, h: o.height, srcW: sw, srcH: sh };
    };

    return {
      wmPatch: best, wmScore: Math.round(bestScore * 10) / 10,
      left: emit(bbox(0, half - INSET)),
      right: emit(bbox(half + INSET, full.width)),
    };
  }, { dataUrl, INSET, OUT_W, QUALITY, WM });

  for (const [side, name] of [["left", pair.left], ["right", pair.right]]) {
    const b64 = out[side].url.split(",")[1];
    const buf = Buffer.from(b64, "base64");
    fs.writeFileSync(path.join(DIR, name + ".webp"), buf);
    report.push({ file: name + ".webp", px: `${out[side].w}x${out[side].h}`, bytes: buf.length });
  }
  console.log(`${pair.src} -> ${pair.left} / ${pair.right}  (WM補修元 ${JSON.stringify(out.wmPatch)} score=${out.wmScore})`);
}

console.log("\n--- 出力 ---");
let total = 0;
for (const r of report) { console.log(`  ${r.file.padEnd(28)} ${r.px.padEnd(10)} ${(r.bytes / 1024).toFixed(1)}KB`); total += r.bytes; }
console.log(`  合計 ${(total / 1024).toFixed(1)}KB`);
await browser.close();
