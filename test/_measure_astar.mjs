/* ════════════════════════════════════════════
   実機スクショの映像を「フェイクカメラ」としてアプリに流し込み、
   アプリ自身が実測する肌の Lab（とくに a*）と判定結果を取り出す。

   用途: 肌の生理的範囲ゲート（L*40-88 / a*2-26 / b*4-32）の上限・下限を、
         1枚の写真に過剰適合させずに決めるための実測ツール。
         撮影距離・光の条件が違う複数枚を並べて、全部で通る値を探す。

   使い方:
     npm run build                                  ← dist を最新にしてから
     node test/_measure_astar.mjs <撮影画面のスクショ.png> [...]
     node test/_measure_astar.mjs foo.png=0,736,1206,1640   ← 映像の切り出しを手で指定

   ★数値はアプリ本体（dist/colorlab.iife.js）が出したものをそのまま読む。
     このファイルには photoGeometry や Lab 変換を写経しない。写経すると
     「ツールだけ古い定数のまま」という食い違いが起きるため。
     ここがやるのは「スクショから映像の帯を切り出して y4m にする」ところまで。

   ★注意: 表示中の映像は CSS で scaleX(-1)（鏡像）されており、スクショも鏡像のまま。
     それをそのまま流し込むので、アプリから見た左右は実物と逆になる。
     頬の測定範囲は中心対称なので左右が入れ替わるだけで、
     左右平均・ΔE・肌ゲートの判定は変わらない。左右のラベルだけ読み替えること。
   ════════════════════════════════════════════ */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "screenshots");
const ART = "file://" + join(__dirname, "local_article.html").replace(/\\/g, "/");
const DIST = join(__dirname, "..", "dist", "colorlab.iife.js");

const args = process.argv.slice(2);
if (!args.length) {
  console.error("使い方: node test/_measure_astar.mjs <スクショ.png>[=x0,y0,x1,y1] ...");
  process.exit(1);
}
if (!existsSync(DIST)) { console.error("dist が無い。先に npm run build を実行すること。"); process.exit(1); }
if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });

/* スクショから「映像の帯」を切り出し、指定サイズの RGB 配列にして返す。
   デコードとリサイズは Chromium の canvas に任せる（追加依存を増やさない）。 */
async function frameFromScreenshot(page, file, rect, OUT_W) {
  const dataUrl = "data:image/png;base64," + readFileSync(file).toString("base64");
  return page.evaluate(async ({ dataUrl, rect, OUT_W }) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const full = document.createElement("canvas");
    full.width = img.naturalWidth; full.height = img.naturalHeight;
    const fx = full.getContext("2d", { willReadFrequently: true });
    fx.drawImage(img, 0, 0);
    const FW = full.width, FH = full.height;
    const fd = fx.getImageData(0, 0, FW, FH).data;

    // ── 映像の帯を自動検出: 「行の平均が明るい行」が最も長く続く区間。
    //    撮影オーバーレイは映像の上下が真っ黒（#000）なので、映像だけが長く明るく続く。
    //    ★端の1px で判定してはいけない。映像の隅に暗いもの（黒いノートPC等）が写った行で
    //      帯が途中で切れ、映像を短く切り出してしまう（2026-09-03 に実際に発生し、
    //      縦横比が 1.5 になって頬の測定枠が鼻の脇へずれた）。
    let box = rect;
    if (!box) {
      const mean = new Float64Array(FH);
      for (let y = 0; y < FH; y++) {
        let s = 0, n = 0;
        for (let x = 0; x < FW; x += 8) { const i = (y * FW + x) * 4; s += (fd[i] + fd[i + 1] + fd[i + 2]) / 3; n++; }
        mean[y] = s / n;
      }
      let best = [0, 0], cur = -1;
      for (let y = 0; y <= FH; y++) {
        if (y < FH && mean[y] > 60) { if (cur < 0) cur = y; }
        else { if (cur >= 0 && y - cur > best[1] - best[0]) best = [cur, y]; cur = -1; }
      }
      box = [0, best[0], FW, best[1]];
    }
    const [x0, y0, x1, y1] = box;
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < 50 || ch < 50) return { error: `映像の領域を検出できない (${box.join(",")})` };

    // y4m は偶数サイズが必要（I420 の色差が 2x2 単位のため）
    const W = OUT_W, H = Math.max(2, Math.round((ch / cw) * OUT_W / 2) * 2);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c2 = cv.getContext("2d", { willReadFrequently: true });
    c2.drawImage(full, x0, y0, cw, ch, 0, 0, W, H);
    return { W, H, crop: [x0, y0, x1, y1], ar: +(cw / ch).toFixed(3), rgba: [...c2.getImageData(0, 0, W, H).data] };
  }, { dataUrl, rect, OUT_W });
}

/* RGBA 配列を y4m(I420) にする。Chromium の --use-file-for-fake-video-capture に渡せる形式。 */
function toY4m(W, H, rgba, frames = 3) {
  const at = (x, y) => { const i = (y * W + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; };
  const Y = Buffer.alloc(W * H), U = Buffer.alloc((W / 2) * (H / 2)), V = Buffer.alloc((W / 2) * (H / 2));
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = at(x, y);
    Y[y * W + x] = cl(0.299 * r + 0.587 * g + 0.114 * b);
  }
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    let r = 0, g = 0, b = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const c = at(Math.min(W - 1, x + dx), Math.min(H - 1, y + dy)); r += c[0]; g += c[1]; b += c[2];
    }
    r /= 4; g /= 4; b /= 4;
    const i = (y / 2) * (W / 2) + x / 2;
    U[i] = cl(-0.169 * r - 0.331 * g + 0.5 * b + 128);
    V[i] = cl(0.5 * r - 0.419 * g - 0.081 * b + 128);
  }
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420mpeg2\n`, "ascii")];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from("FRAME\n", "ascii"), Y, U, V);
  return Buffer.concat(parts);
}

const openPhotoGuide = async (pg) => {
  await pg.goto(ART, { waitUntil: "networkidle" });
  await pg.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await pg.locator("#colorlab-root").getByRole("button", { name: /^写真で診断/ }).click();
  await pg.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  const cb = pg.locator("#colorlab-root input[type=checkbox]");
  for (let i = 0; i < (await cb.count()); i++) await cb.nth(i).check();
  await pg.locator("#colorlab-root").getByRole("button", { name: /^地毛に近い$/ }).click();
  await pg.locator("#colorlab-root").getByRole("button", { name: /撮影にすすむ/ }).click();
  await pg.locator("#colorlab-root").getByRole("button", { name: /カメラを起動する/ }).click();
  await pg.waitForSelector("video", { state: "visible", timeout: 15000 });
  await pg.waitForTimeout(1400);  // 400ms間隔のライブ判定が数回まわるのを待つ
};

// 1) スクショ → 映像フレーム（デコード用の素のブラウザ）
const decoder = await chromium.launch();
const dpage = await (await decoder.newContext()).newPage();
const frames = [];
for (const arg of args) {
  const [file, rectStr] = arg.split("=");
  if (!existsSync(file)) { console.error(`見つからない: ${file}`); process.exitCode = 1; continue; }
  const rect = rectStr ? rectStr.split(",").map(Number) : null;
  const f = await frameFromScreenshot(dpage, file, rect, 640);
  if (f.error) { console.error(`${basename(file)}: ${f.error}`); process.exitCode = 1; continue; }
  frames.push({ file, ...f });
}
await decoder.close();

// 2) 1枚ずつフェイクカメラに流して、アプリ自身の判定を読む
const rows = [];
for (const f of frames) {
  const name = basename(f.file);
  const y4m = join(tmpdir(), `astar_${basename(f.file, extname(f.file))}.y4m`);
  writeFileSync(y4m, toY4m(f.W, f.H, f.rgba));
  const b = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=" + y4m],
  });
  const row = { name, crop: f.crop, ar: f.ar, size: `${f.W}x${f.H}` };
  try {
    const c = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["camera"] });
    const pg = await c.newPage();
    await openPhotoGuide(pg);
    row.live = (await pg.locator("body").innerText()).replace(/\s+/g, " ");
    const shot = join(SHOTS, `astar_${basename(f.file, extname(f.file))}_live.png`);
    await pg.screenshot({ path: shot });
    row.shot = basename(shot);
    await pg.locator('button[aria-label="撮影する"]').click();
    await pg.waitForTimeout(2500);
    row.after = (await pg.locator("#colorlab-root").innerText()).replace(/\s+/g, " ");
  } catch (e) {
    row.error = String(e).split("\n")[0];
  } finally { await b.close(); }
  rows.push(row);
}

// 3) 出力
const pick = (t, re) => { const m = re.exec(t || ""); return m ? m[1] : null; };
console.log("\n=== アプリ本体が出した実測値（本判定 = 撮影ボタン押下後）===");
const table = [];
for (const r of rows) {
  console.log(`\n■ ${r.name}  切り出し=[${r.crop.join(",")}] 縦横比=${r.ar} → 流し込み ${r.size}`);
  if (r.error) { console.log(`   実行エラー: ${r.error}`); continue; }
  const live = ["明るさ", "白い紙", "顔の位置", "左右"].map((k) => {
    const m = new RegExp(`${k}\\s*([✓○—][^\\s]*)`).exec(r.live);
    return `${k}${m ? m[1] : "?"}`;
  }).join(" / ");
  console.log(`   ライブ判定: ${live}`);
  const a = pick(r.after, /a\*(-?[\d.]+)（赤み）/);
  const bb = pick(r.after, /b\*(-?[\d.]+)（黄み）/);
  const L = pick(r.after, /明度L\*(-?[\d.]+)/);
  const C = pick(r.after, /彩度C\*(-?[\d.]+)/);
  if (a) {
    const over = Number(a) > 26 ? "  ← a*上限26超" : `  （上限26まで余裕 ${(26 - Number(a)).toFixed(1)}）`;
    console.log(`   本判定: 通過  L*${L} a*${a} b*${bb} C*${C}${over}`);
    table.push({ name: r.name, a: Number(a), L: Number(L), b: Number(bb), verdict: "通過" });
  } else {
    const title = pick(r.after, /顔写真で診断\s*(.+?)\s*(?:顔の位置|頬の位置|直射日光|室内照明|正しく測れない|窓の近く)/) ||
      (r.after || "").slice(0, 60);
    console.log(`   本判定: 却下  「${title}」`);
    table.push({ name: r.name, a: null, verdict: `却下: ${title}` });
  }
  console.log(`   撮影画面のスクショ: test/screenshots/${r.shot}`);
}

const ok = table.filter((t) => t.a !== null);
if (ok.length) {
  const mx = Math.max(...ok.map((t) => t.a)), mn = Math.min(...ok.map((t) => t.a));
  console.log(`\n=== a* の分布（通過した ${ok.length}/${table.length} 枚）===`);
  console.log(`   最小 ${mn.toFixed(1)} / 最大 ${mx.toFixed(1)} / 現行上限 26 / 余裕 ${(26 - mx).toFixed(1)}`);
  console.log(`   ※ここの値は実機より 3〜5 低い。RGB→I420→RGB の往復で赤みが落ちるため`);
  console.log(`     （2026-09-03 に test/_probe_calib.mjs で再測: −3.0〜−5.1・平均 −4.2）。`);
  console.log(`     補正後の実機相当 = 最大 ${(mx + 4.2).toFixed(1)}（最小 ${(mn + 4.2).toFixed(1)}）。`);
  console.log(`   ※さらに AWB の揺れで a* は ±1.8〜3.5 振れる（2026-08-31 実測）。`);
  console.log(`     上限は「補正後の最大値 + 揺れぶん」を下回らない値にすること。1枚に合わせない。`);
}
if (table.some((t) => t.a === null)) {
  console.log(`\n   却下された写真は a* 以外のゲート（左右差ΔE・白紙・露出）で先に落ちている可能性がある。`);
  console.log(`   却下理由を読んでから、a* 上限の議論に使えるデータか判断すること。`);
}
