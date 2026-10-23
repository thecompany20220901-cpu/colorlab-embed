// 顔映り24色の ◎○△✕ を12タイプ別にした（v1.22.13）ことを実測する（2026-10-23）。
//   (1) src の COLOR_CHECK_12 が 24色×12タイプ=288件で、下の EXPECT（指示書 CC_v1_22_13 の表）と一致する。値は ◎○△✕ のどれか。
//       色名は COLOR_CHECK の24色と一致する
//   (2) src に 4タイプの判定の参照（cc.r[ など）が残っていない
//   (3) 結果画面（12通り）の「色別 顔映りチェック（24色）」の各行の ◎○△✕ が EXPECT のそのタイプと一致し、◎→✕ の順に並ぶ
//   (4) 「この色、似合う？チェッカー」を12タイプのボタンから選び、24色それぞれの判定が EXPECT と一致する
//   (5) ウォームオータムの BEST COLOR 10 の8〜10番目が #244564 / #6BB2AC / #E8B49C
// 期待値はこのファイルに直接書く（src から読まない）。
// 実行: npm run build:colorlab && node test/colorcheck12_check.mjs [バンドル] [--src ファイル] [--static-only]
//   バンドル省略時は dist/colorlab.iife.js。スクリーンショットはバンドル省略時だけ out/colorcheck12/ に撮る。
// ネガティブテスト: v1.22.12 の src / バンドル、または COLOR_CHECK_12 から1件消した src を渡すと FAIL（exit 1）になること。
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import zlib from "zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
const SRC = resolve(opt("--src") || join(ROOT, "src", "color_lab_stylist_v23.jsx"));
const STATIC_ONLY = args.includes("--static-only");
const pos = args.filter((a) => !a.startsWith("--"));
const BUNDLE = resolve(pos[0] || join(ROOT, "dist", "colorlab.iife.js"));
const SHOOT = !pos[0] && !STATIC_ONLY;
const OUT = resolve(ROOT, "out", "colorcheck12");
if (SHOOT) mkdirSync(OUT, { recursive: true });

const KEYS = [
  ["2-1", "ブライトサマー"], ["2-3", "ソフトサマー"], ["2-4", "クールサマー"],
  ["4-3", "ディープウィンター"], ["4-2", "クールウィンター"], ["4-1", "ブライトウィンター"],
  ["1-2", "ライトスプリング"], ["1-4", "ブライトスプリング"], ["1-3", "ウォームスプリング"],
  ["3-1", "ウォームオータム"], ["3-2", "ソフトオータム"], ["3-4", "ディープオータム"],
];
// COLOR_CHECK の24色（この順）
const NAMES24 = ["コーラルピンク", "青みピンク", "ビビッドピンク", "サーモンピンク", "レッド", "ワインレッド", "オレンジ", "テラコッタ", "イエロー", "マスタード",
  "ベージュ", "キャメル", "ブラウン", "カーキ", "ミントグリーン", "エメラルド", "水色", "ロイヤルブルー", "ネイビー", "ラベンダー", "パープル", "グレー", "ホワイト", "ブラック"];
const EXPECT = {
  "コーラルピンク": { "ブライトサマー": "△", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "○", "ソフトオータム": "○", "ディープオータム": "○" },
  "青みピンク": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "△", "クールウィンター": "○", "ブライトウィンター": "△", "ライトスプリング": "○", "ブライトスプリング": "✕", "ウォームスプリング": "△", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "ビビッドピンク": { "ブライトサマー": "○", "ソフトサマー": "✕", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "△", "ブライトスプリング": "○", "ウォームスプリング": "△", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "✕" },
  "サーモンピンク": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "レッド": { "ブライトサマー": "△", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "◎", "クールウィンター": "○", "ブライトウィンター": "◎", "ライトスプリング": "○", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "△", "ディープオータム": "○" },
  "ワインレッド": { "ブライトサマー": "△", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "○", "ソフトオータム": "○", "ディープオータム": "◎" },
  "オレンジ": { "ブライトサマー": "△", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "△", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "○", "ディープオータム": "◎" },
  "テラコッタ": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "イエロー": { "ブライトサマー": "△", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "○", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "△", "ディープオータム": "△" },
  "マスタード": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "ベージュ": { "ブライトサマー": "✕", "ソフトサマー": "○", "クールサマー": "△", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "○" },
  "キャメル": { "ブライトサマー": "✕", "ソフトサマー": "✕", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "◎", "ウォームスプリング": "◎", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "ブラウン": { "ブライトサマー": "✕", "ソフトサマー": "△", "クールサマー": "✕", "ディープウィンター": "○", "クールウィンター": "△", "ブライトウィンター": "△", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "○", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "カーキ": { "ブライトサマー": "✕", "ソフトサマー": "△", "クールサマー": "✕", "ディープウィンター": "✕", "クールウィンター": "✕", "ブライトウィンター": "✕", "ライトスプリング": "△", "ブライトスプリング": "✕", "ウォームスプリング": "△", "ウォームオータム": "◎", "ソフトオータム": "◎", "ディープオータム": "◎" },
  "ミントグリーン": { "ブライトサマー": "△", "ソフトサマー": "◎", "クールサマー": "○", "ディープウィンター": "✕", "クールウィンター": "△", "ブライトウィンター": "✕", "ライトスプリング": "◎", "ブライトスプリング": "○", "ウォームスプリング": "◎", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "エメラルド": { "ブライトサマー": "△", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "○", "ブライトスプリング": "○", "ウォームスプリング": "○", "ウォームオータム": "○", "ソフトオータム": "○", "ディープオータム": "○" },
  "水色": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "△", "クールウィンター": "◎", "ブライトウィンター": "△", "ライトスプリング": "◎", "ブライトスプリング": "△", "ウォームスプリング": "△", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "ロイヤルブルー": { "ブライトサマー": "○", "ソフトサマー": "○", "クールサマー": "◎", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "△", "ブライトスプリング": "△", "ウォームスプリング": "✕", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "✕" },
  "ネイビー": { "ブライトサマー": "△", "ソフトサマー": "○", "クールサマー": "◎", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "○", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "△", "ソフトオータム": "○", "ディープオータム": "◎" },
  "ラベンダー": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "△", "クールウィンター": "◎", "ブライトウィンター": "△", "ライトスプリング": "○", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "✕", "ソフトオータム": "△", "ディープオータム": "✕" },
  "パープル": { "ブライトサマー": "○", "ソフトサマー": "✕", "クールサマー": "○", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "◎", "ライトスプリング": "✕", "ブライトスプリング": "△", "ウォームスプリング": "✕", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "△" },
  "グレー": { "ブライトサマー": "○", "ソフトサマー": "◎", "クールサマー": "◎", "ディープウィンター": "○", "クールウィンター": "○", "ブライトウィンター": "△", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "△", "ソフトオータム": "○", "ディープオータム": "△" },
  "ホワイト": { "ブライトサマー": "△", "ソフトサマー": "○", "クールサマー": "○", "ディープウィンター": "○", "クールウィンター": "◎", "ブライトウィンター": "○", "ライトスプリング": "◎", "ブライトスプリング": "△", "ウォームスプリング": "○", "ウォームオータム": "✕", "ソフトオータム": "✕", "ディープオータム": "✕" },
  "ブラック": { "ブライトサマー": "✕", "ソフトサマー": "△", "クールサマー": "△", "ディープウィンター": "◎", "クールウィンター": "◎", "ブライトウィンター": "○", "ライトスプリング": "✕", "ブライトスプリング": "✕", "ウォームスプリング": "✕", "ウォームオータム": "△", "ソフトオータム": "△", "ディープオータム": "○" },
};
const RANK = ["◎", "○", "△", "✕"];
const WA_TAIL = ["#244564", "#6BB2AC", "#E8B49C"];

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

// ── (1)(2) src ──
const src = readFileSync(SRC, "utf-8");
const objAfter = (head) => {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const b = src.indexOf("{", i + head.length - 1), e = src.indexOf("\n};", b);
  try { return new Function("return " + src.slice(b, e + 2))(); } catch (err) { return null; }
};
const CC12 = objAfter("const COLOR_CHECK_12 = {");
console.log("src: " + SRC);
check(!!CC12, "(1) src に COLOR_CHECK_12 がある");
if (CC12) {
  const vals = Object.values(CC12).flatMap((v) => Object.values(v));
  check(Object.keys(CC12).length === 24 && vals.length === 288, `(1) 24色×12タイプ=288件 (${Object.keys(CC12).length}色 / ${vals.length}件)`);
  check(vals.every((v) => RANK.includes(v)), "(1) 値が全部 ◎○△✕ のどれか");
  check(JSON.stringify(Object.keys(CC12)) === JSON.stringify(NAMES24), "(1) 色名が COLOR_CHECK の24色と一致（同じ順）");
  for (const nm of NAMES24) {
    const lack = KEYS.filter(([, n]) => !(CC12[nm] && RANK.includes(CC12[nm][n]))).map(([, n]) => n);
    check(lack.length === 0, `(1) ${nm}: 12タイプ全部に判定がある${lack.length ? " (欠け: " + lack.join("・") + ")" : ""}`);
    check(JSON.stringify(CC12[nm]) === JSON.stringify(EXPECT[nm]), `(1) ${nm}: 指示書の表と一致`);
  }
}
const ccr = (src.match(/cc\.r\[/g) || []).length;
const anyR = (src.match(/\.r\[(myType|typeKey|key|RT\.key)\]/g) || []).length;
check(ccr === 0 && anyR === 0, `(2) 4タイプ判定の参照が0件 (cc.r[ ${ccr}件 / .r[myType|typeKey|key] ${anyR}件)`);

if (!STATIC_ONLY) {
  // 回答パターンの探索・合成写真は test/result12_check.mjs と同じ
  const q12 = src.slice(src.indexOf("const Q12 = ["), src.indexOf("const TIE_Q"));
  const GAINS = [...q12.matchAll(/A: \[(\d), (\d)\], B: \[(\d), (\d)\]/g)].map((m) => ({ A: [+m[1], +m[2]], B: [+m[3], +m[4]] }));
  if (GAINS.length !== 13) throw new Error("Q12 の配点が13問分取れない: " + GAINS.length);
  const TIE = { A: 1, B: 2, C: 3, D: 4 };
  const sortTypes = (s) => [1, 2, 3, 4].map((t) => ({ t, s: s[t] })).sort((a, b) => (b.s !== a.s ? b.s - a.s : a.t - b.t));
  const findPattern = (want) => {
    for (let bits = 0; bits < 1 << 13; bits++) {
      const s = { 1: 0, 2: 0, 3: 0, 4: 0 };
      const picks = [];
      for (let i = 0; i < 13; i++) {
        const c = bits & (1 << i) ? "B" : "A";
        picks.push(c);
        GAINS[i][c].forEach((t) => { s[t] += 1; });
      }
      const sorted = sortTypes(s);
      const tied = sorted.filter((x) => x.s === sorted[0].s).length > 1;
      for (const tc of tied ? Object.keys(TIE) : [null]) {
        const f = { ...s };
        if (tc) f[TIE[tc]] += 1;
        const r = sortTypes(f);
        if (`${r[0].t}-${r[1].t}` === want) return { picks, tie: tc };
      }
    }
    return null;
  };
  const labToRgb = (L, a, b) => {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz);
    const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
    return lin.map((c) => Math.max(0, Math.min(255, Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))));
  };
  const chunk = (type, data) => {
    const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const regionPng = (W, H, base, rects) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
    const box = rects.map(([x0, y0, x1, y1, c]) => [Math.floor(x0 * W), Math.floor(y0 * H), Math.floor(x1 * W), Math.floor(y1 * H), c]);
    const raw = Buffer.alloc(H * (W * 3 + 1));
    let o = 0;
    for (let y = 0; y < H; y++) {
      raw[o++] = 0;
      for (let x = 0; x < W; x++) {
        let c = base;
        for (const [x0, y0, x1, y1, col] of box) if (x >= x0 && x < x1 && y >= y0 && y < y1) c = col;
        raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
      }
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };
  const facePhoto = (skinLab, hairL) => {
    const skin = labToRgb(...skinLab), hair = labToRgb(hairL, 0, 0);
    return regionPng(600, 800, [190, 190, 195], [
      [0.40, 0.06, 0.60, 0.16, hair], [0.24, 0.46, 0.36, 0.58, skin], [0.64, 0.46, 0.76, 0.58, skin], [0.34, 0.76, 0.66, 0.92, [235, 235, 235]],
    ]);
  };
  const PHOTO = { "4-1": facePhoto([64, 14, 17.3], 6), "1-4": facePhoto([68, 12, 19], 10), "3-2": facePhoto([64, 6, 15.7], 54) };

  const HARNESS = `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/__bundle.js"></script></body></html>`;
  const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
  const server = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/__harness.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(HARNESS); return; }
    if (p === "/__bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(readFileSync(BUNDLE)); return; }
    const f = join(ROOT, p);
    // ディレクトリ等で readFileSync が投げると応答が返らず接続が詰まるので、ファイル以外は 404
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  page.on("pageerror", (e) => ng.push("pageerror: " + e.message));
  const shots = [];
  console.log("bundle: " + BUNDLE);

  // (3)(5) 結果画面
  for (const [key, name] of KEYS) {
    const pat = findPattern(key);
    if (!pat && !PHOTO[key]) { check(false, `${key}: 回答パターンも合成写真も無い`); continue; }
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    if (pat) {
      await page.getByRole("button", { name: /質問で診断/ }).first().click();
      for (let i = 0; i < 13; i++) {
        await page.locator("#colorlab-root button").nth(pat.picks[i] === "A" ? 1 : 2).click();
        await page.waitForTimeout(90);
      }
      if (pat.tie) await page.locator("#colorlab-root button").nth(1 + "ABCD".indexOf(pat.tie)).click();
    } else {
      await page.getByRole("button", { name: /^写真で診断/ }).click();
      await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
      const boxes = page.locator("#colorlab-root input[type=checkbox]");
      for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
      await page.getByRole("button", { name: /^地毛に近い$/ }).click();
      await page.getByRole("button", { name: /撮影にすすむ/ }).click();
      await page.getByRole("button", { name: /カメラを起動する/ }).click();
      await page.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
      await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: key + ".png", mimeType: "image/png", buffer: PHOTO[key] });
    }
    await page.waitForFunction(() => /タイプです/.test(document.querySelector("#colorlab-root").textContent), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => {
      const root = document.querySelector("#colorlab-root");
      const toHex = (rgb) => {
        const m = String(rgb).match(/\d+/g);
        return m ? "#" + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("").toUpperCase() : "";
      };
      const head = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && /^色別 顔映りチェック（\d+色）$/.test(d.textContent.trim()));
      const sec = head && head.parentElement;
      const rows = [];
      let cur = null;
      if (sec) for (const d of sec.querySelectorAll(":scope > div")) {
        const h = d.querySelector(".flex.items-baseline > span");
        if (h) cur = h.textContent.trim();
        const nm = d.querySelector(".text-\\[11px\\].font-medium.leading-tight");
        if (nm) rows.push([nm.textContent.trim(), cur]);
      }
      const bc = [...root.querySelectorAll("div")].find((d) => d.children.length === 0 && d.textContent.trim() === "まずはこの10色から");
      const grid = bc && bc.nextElementSibling;
      const sw = grid ? [...grid.children].map((c) => toHex(getComputedStyle(c.firstElementChild || c).backgroundColor)) : [];
      const r = sec ? sec.getBoundingClientRect() : null;
      const rb = grid ? grid.getBoundingClientRect() : null;
      return { rows, sw, top: r ? r.top + scrollY : null, bottom: r ? r.bottom + scrollY : null,
        bcTop: rb ? rb.top + scrollY - 40 : null, bcBottom: rb ? rb.bottom + scrollY : null };
    });
    check(info.rows.length === 24, `${key} ${name}: (3) 顔映りチェックが24行 (${info.rows.length})`);
    const bad = info.rows.filter(([n, r]) => !EXPECT[n] || EXPECT[n][name] !== r);
    check(info.rows.length === 24 && bad.length === 0, `${key} ${name}: (3) 24色の ◎○△✕ が表と一致${bad.length ? " (違う: " + bad.slice(0, 4).map(([n, r]) => `${n}=${r}/期待${EXPECT[n] && EXPECT[n][name]}`).join(" ") + ")" : ""}`);
    const order = info.rows.map(([, r]) => RANK.indexOf(r));
    check(order.every((v, i) => i === 0 || order[i - 1] <= v), `${key} ${name}: (3) ◎→○→△→✕ の順 (${info.rows.map(([, r]) => r).join("")})`);
    const wantOrder = NAMES24.map((n) => [n, EXPECT[n][name]]).sort((x, y) => RANK.indexOf(x[1]) - RANK.indexOf(y[1])).map(([n]) => n);
    check(JSON.stringify(info.rows.map(([n]) => n)) === JSON.stringify(wantOrder), `${key} ${name}: (3) 同じ評価の中は COLOR_CHECK の順`);
    if (name === "ウォームオータム") {
      check(JSON.stringify(info.sw.slice(7)) === JSON.stringify(WA_TAIL), `${key} ${name}: (5) BEST COLOR 10 の8〜10番目 (${info.sw.slice(7).join(" ")})`);
      if (SHOOT && info.bcTop != null) {
        const file = join(OUT, `bestcolor10_${key}_${name}.png`);
        await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, info.bcTop), width: 390, height: info.bcBottom - info.bcTop + 12 } });
        shots.push(file);
      }
    }
    if (SHOOT && info.top != null) {
      const file = join(OUT, `facecheck_${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y: Math.max(0, info.top - 12), width: 390, height: info.bottom - info.top + 24 } });
      shots.push(file);
    }
  }

  // (4) チェッカー（未診断 → 12タイプのボタン → 24色を1つずつタップ）
  for (const [key, name] of KEYS) {
    await page.goto(base + "/__harness.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
    const tile = page.locator("#colorlab-root button", { hasText: /この色、似合う？/ });
    if (!(await tile.count())) { check(false, `${key} ${name}: (4) チェッカーの入口が無い`); continue; }
    await tile.first().click();
    await page.waitForTimeout(300);
    const btn = page.locator("#colorlab-root button", { hasText: new RegExp("^" + name + "$") });
    if (!(await btn.count())) { check(false, `${key} ${name}: (4) チェッカーに「${name}」のボタンが無い`); continue; }
    await btn.first().click();
    await page.waitForTimeout(200);
    const miss = [];
    for (const nm of NAMES24) {
      await page.locator(`#colorlab-root button[title="${nm}"]`).first().click();
      const got = await page.evaluate(() => {
        const d = document.querySelector("#colorlab-root .text-lg.font-serif");
        return d ? d.textContent.trim().slice(0, 1) : "";
      });
      if (got !== EXPECT[nm][name]) miss.push(`${nm}=${got || "なし"}/期待${EXPECT[nm][name]}`);
    }
    check(miss.length === 0, `${key} ${name}: (4) チェッカーの24色の判定が表と一致${miss.length ? " (違う: " + miss.slice(0, 4).join(" ") + ")" : ""}`);
    const txt = await page.evaluate(() => document.querySelector("#colorlab-root").innerText);
    check(txt.includes(`${name}との相性を判定します`), `${key} ${name}: (4) チェッカーの説明が12タイプ名`);
    if (SHOOT && key === "4-3") {
      const file = join(OUT, `checker_${key}_${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
    }
  }
  await browser.close();
  server.close();
  if (shots.length) { console.log("\nスクリーンショット:"); shots.forEach((f) => console.log("  " + f)); }
}

console.log(`\nPASS ${ok.length} / FAIL ${ng.length}`);
ng.forEach((l) => console.log("  FAIL " + l));
if (process.env.VERBOSE) ok.forEach((l) => console.log("  ok   " + l));
process.exit(ng.length ? 1 : 0);
