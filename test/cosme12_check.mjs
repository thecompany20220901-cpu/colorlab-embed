// 診断結果「仕上げのコスメはコレ！」の12タイプ別（v1.22.17・2026-10-30・COSME12・実測ΔE確定表）を検査する。
//   ① データ（src を読む）: COSME12 が12タイプ全てにあり（TYPE12_NAME と一致）、各項目の kind/name/kw/hex/price の型が正しく、
//      下の表と完全一致。dE は TYPE12_PALETTE から CIE76 で計算し直した値と一致、ref は dE>12、dE≦20
//   ② 表示（バンドルを動かす）: 12タイプの結果画面で、カード数 = COSME12[type12].length・並び（リップ→アイシャドウ→チーク）・
//      商品名・種別・一言（「{kind}｜近い色: ●」・ref の時だけ「(色の近さは目安)」）・色チップ・価格・
//      楽天 href（RK(kw)・KATE 02/03/06/17 だけ https://a.r10.to/h5fdes）・Amazon href（AMZ(kw)）
//   ③ 枠なし: ブライトサマー・ソフトサマーにリップ、ディープウィンター・ブライトスプリング・ディープオータムにチークのカードが無い
//   ④ 計測: 各ボタンを押すと cosme_click がちょうど1回積まれ、8キーすべて文字列・値が期待どおり（slot はリップ=1・アイシャドウ=2・チーク=3）
//   ⑤ rom&nd の Amazon URL が k=rom%26nd（二重エンコード rom%2526nd が無い）。src に AMZ("rom%26nd が残っていない
//   12タイプのスクリーンショット（「仕上げのコスメはコレ！」の枠）を out/release/tests_1030_v12217/screens/ に保存する。
// 期待値はこのファイルに直接書く（src から読まない）。外部（楽天ほか）への通信はすべて止める。
// 実行: npm run build:colorlab && node test/cosme12_check.mjs [バンドル] [--src 検査するsrc] [--shots 保存先|--no-shots]
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import zlib from "zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const flagIdx = new Set();
["--src", "--shots"].forEach((n) => { const i = args.indexOf(n); if (i >= 0) { flagIdx.add(i); flagIdx.add(i + 1); } });
const positional = args.filter((a, i) => !flagIdx.has(i) && !a.startsWith("--"));
const BUNDLE = resolve(positional[0] || join(ROOT, "dist", "colorlab.iife.js"));
const SRC_PATH = resolve(opt("--src") || join(ROOT, "src", "color_lab_stylist_v23.jsx"));
const SHOTS = args.includes("--no-shots") ? null : resolve(opt("--shots") || join(ROOT, "out", "release", "tests_1030_v12217", "screens"));
const BUNDLE_SRC = readFileSync(BUNDLE);
const src = readFileSync(SRC_PATH, "utf-8");
const VERSION = "1.22.17";
const KEYS = ["app_version", "brand", "event", "item", "merchant", "screen", "slot", "type12"];

// ── 期待値（CC_v1_22_17_COSME12.md の表そのまま）──
const EXPECT = {
  "ブライトサマー": [
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 00 LIGHT and GLITTER GARDEN", kw:"rom&nd ベターザンパレット 00", hex:"#E3E6E9", price:1380, dE:5.6, ref:false, point:"ハイライト" },
    { kind:"チーク", name:"CANMAKE グロウフルールチークス 17 いちごミルクフルール", kw:"CANMAKE グロウフルールチークス 17", hex:"#EBBBBE", price:880, dE:8.1, ref:false, point:"メイン" }
  ],
  "ソフトサマー": [
    { kind:"アイシャドウ", name:"CANMAKE シルキースフレアイズ 10 スウィートラブレター", kw:"CANMAKE シルキースフレアイズ 10", hex:"#845652", price:825, dE:14.2, ref:true, point:"メイン" },
    { kind:"チーク", name:"CANMAKE グロウフルールチークス 19 さくらんぼソーダフルール", kw:"CANMAKE グロウフルールチークス 19", hex:"#E2A6B0", price:880, dE:11.3, ref:false, point:"メイン" }
  ],
  "クールサマー": [
    { kind:"リップ", name:"KATE リップモンスター 18 とろけ落ちる蜜桃", kw:"KATE リップモンスター 18", hex:"#EB4651", price:1650, dE:6.2, ref:false, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 11 CHEEKY CHEEKY GARDEN", kw:"rom&nd ベターザンパレット 11", hex:"#F5D9DB", price:2100, dE:6.9, ref:false, point:"ハイライト" },
    { kind:"チーク", name:"CANMAKE グロウフルールチークス 01 ピーチフルール", kw:"CANMAKE グロウフルールチークス 01", hex:"#F0CECB", price:880, dE:6.9, ref:false, point:"ハイライト" }
  ],
  "ディープウィンター": [
    { kind:"リップ", name:"KATE リップモンスター 13 3:00AMの微酔", kw:"KATE リップモンスター 13", hex:"#C04C73", price:1650, dE:17.2, ref:true, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 04 DUSTYFOG GARDEN", kw:"rom&nd ベターザンパレット 04", hex:"#403630", price:2100, dE:5.6, ref:false, point:"メイン" }
  ],
  "クールウィンター": [
    { kind:"リップ", name:"KATE リップモンスター 13 3:00AMの微酔", kw:"KATE リップモンスター 13", hex:"#C04C73", price:1650, dE:7.1, ref:false, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 07 BERRY FUCHSIA GARDEN", kw:"rom&nd ベターザンパレット 07", hex:"#EAE8ED", price:2100, dE:7.9, ref:false, point:"ハイライト" },
    { kind:"チーク", name:"CANMAKE グロウフルールチークス 02 アプリコットフルール", kw:"CANMAKE グロウフルールチークス 02", hex:"#ECB1BA", price:880, dE:8.9, ref:false, point:"メイン" }
  ],
  "ブライトウィンター": [
    { kind:"リップ", name:"KATE リップモンスター 01 欲望の塊", kw:"KATE リップモンスター 01", hex:"#DF0639", price:1650, dE:2.6, ref:false, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 07 BERRY FUCHSIA GARDEN", kw:"rom&nd ベターザンパレット 07", hex:"#EAE8ED", price:2100, dE:7.5, ref:false, point:"ハイライト" },
    { kind:"チーク", name:"CANMAKE グロウフルールチークス 20 バニラローズフルール", kw:"CANMAKE グロウフルールチークス 20", hex:"#F6E3DC", price:880, dE:11.0, ref:false, point:"ハイライト" }
  ],
  "ライトスプリング": [
    { kind:"リップ", name:"KATE リップモンスター 17 神秘のローズ園", kw:"KATE リップモンスター 17", hex:"#AE5655", price:1650, dE:17.8, ref:true, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 00 LIGHT and GLITTER GARDEN", kw:"rom&nd ベターザンパレット 00", hex:"#E3E6E9", price:1380, dE:6.6, ref:false, point:"ハイライト" },
    { kind:"チーク", name:"CANMAKE グロウフルールチークス 18 ももホイップフルール", kw:"CANMAKE グロウフルールチークス 18", hex:"#EAB9B8", price:880, dE:1.8, ref:false, point:"メイン" }
  ],
  "ブライトスプリング": [
    { kind:"リップ", name:"KATE リップモンスター 03 陽炎", kw:"KATE リップモンスター 03", hex:"#D15950", price:1650, dE:7.2, ref:false, point:"単色" },
    { kind:"アイシャドウ", name:"ETUDE プレイカラーアイシャドウ ベイクハウス", kw:"ETUDE プレイカラーアイシャドウ ベイクハウス", hex:"#98512E", price:2970, dE:18.0, ref:true, point:"メイン" }
  ],
  "ウォームスプリング": [
    { kind:"リップ", name:"KATE リップモンスター 15 綿雲33000ft", kw:"KATE リップモンスター 15", hex:"#C1575B", price:1650, dE:12.1, ref:true, point:"単色" },
    { kind:"アイシャドウ", name:"ETUDE プレイカラーアイシャドウ ロゼワイン", kw:"ETUDE プレイカラーアイシャドウ ロゼワイン", hex:"#7D4833", price:2970, dE:4.3, ref:false, point:"メイン" },
    { kind:"チーク", name:"CEZANNE ナチュラル チークN 18 ローズベージュ", kw:"CEZANNE ナチュラル チークN 18", hex:"#EBAA98", price:396, dE:15.7, ref:true, point:"単色" }
  ],
  "ウォームオータム": [
    { kind:"リップ", name:"KATE リップモンスター 04 パンプキンワイン", kw:"KATE リップモンスター 04", hex:"#AD3030", price:1650, dE:8.3, ref:false, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 03 ROSEBUD GARDEN", kw:"rom&nd ベターザンパレット 03", hex:"#59332B", price:2100, dE:5.3, ref:false, point:"メイン" },
    { kind:"チーク", name:"CEZANNE ナチュラル チークN 18 ローズベージュ", kw:"CEZANNE ナチュラル チークN 18", hex:"#EBAA98", price:396, dE:6.4, ref:false, point:"単色" }
  ],
  "ソフトオータム": [
    { kind:"リップ", name:"KATE リップモンスター 17 神秘のローズ園", kw:"KATE リップモンスター 17", hex:"#AE5655", price:1650, dE:9.8, ref:false, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 13 ODD BREEZE GARDEN", kw:"rom&nd ベターザンパレット 13", hex:"#F3D6D2", price:1380, dE:2.1, ref:false, point:"ハイライト" },
    { kind:"チーク", name:"CANMAKE グロウフルールチークス 02 アプリコットフルール", kw:"CANMAKE グロウフルールチークス 02", hex:"#F2D9D5", price:880, dE:3.0, ref:false, point:"ハイライト" }
  ],
  "ディープオータム": [
    { kind:"リップ", name:"KATE リップモンスター 16 100億haの砂海", kw:"KATE リップモンスター 16", hex:"#9D583E", price:1650, dE:1.9, ref:false, point:"単色" },
    { kind:"アイシャドウ", name:"rom&nd ベターザンパレット 03 ROSEBUD GARDEN", kw:"rom&nd ベターザンパレット 03", hex:"#59332B", price:2100, dE:4.5, ref:false, point:"メイン" }
  ],
};
const NO_FRAME = { "ブライトサマー": "リップ", "ソフトサマー": "リップ", "ディープウィンター": "チーク", "ブライトスプリング": "チーク", "ディープオータム": "チーク" };
const SLOT = { "リップ": 1, "アイシャドウ": 2, "チーク": 3 };
const H5 = "https://a.r10.to/h5fdes";
const RK = (q) => `https://hb.afl.rakuten.co.jp/hgc/359b13c2.b94cf15e.359b13c3.1f2a5b4f/?pc=${encodeURIComponent(`https://search.rakuten.co.jp/search/mall/${q}/`)}&link_type=text`;
const AMZ = (q) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}&tag=blubeiebe-22`;
const rakutenOf = (kw) => { const m = kw.match(/^KATE リップモンスター (\d\d)$/); return m && ["02", "03", "06", "17"].includes(m[1]) ? H5 : RK(kw); };

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

// ── ① データ ──
const objAfter = (head) => {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const j = src.indexOf("\n};", i);
  try { return Function("return " + src.slice(i + head.length, j + 2))(); } catch (e) { return null; }
};
const TYPE12_NAME = objAfter("const TYPE12_NAME = ");
const C12 = objAfter("const COSME12 = ");
const PAL = (() => {
  const i = src.indexOf("const TYPE12_PALETTE = {");
  const blk = src.slice(i, src.indexOf("\n};", i));
  return Object.fromEntries([...blk.matchAll(/"([^"]+)": (\[.*)/g)].map((m) => [m[1], [...m[2].matchAll(/#[0-9A-Fa-f]{6}/g)].map((x) => x[0])]));
})();
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lab = (h) => {
  const [r, g, b] = [1, 3, 5].map((k) => lin(parseInt(h.slice(k, k + 2), 16)));
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

check(!!TYPE12_NAME && !!C12, `データ: TYPE12_NAME / COSME12 が src から読める (${SRC_PATH})`);
if (TYPE12_NAME && C12) {
  const names = Object.values(TYPE12_NAME).sort();
  check(JSON.stringify(Object.keys(C12).sort()) === JSON.stringify(names), `データ①: COSME12 が12タイプ全てにある (${Object.keys(C12).length}件)`);
  for (const n of Object.keys(EXPECT)) {
    const list = C12[n] || [];
    const typesOk = list.length > 0 && list.every((c) => ["リップ", "アイシャドウ", "チーク"].includes(c.kind) && typeof c.name === "string" && c.name
      && typeof c.kw === "string" && c.kw && /^#[0-9A-F]{6}$/.test(c.hex) && Number.isInteger(c.price) && c.price > 0);
    check(typesOk, `データ①: ${n} の kind/name/kw/hex/price の型 (${list.length}件)`);
    check(JSON.stringify(list) === JSON.stringify(EXPECT[n]), `データ①: ${n} が表どおり`);
    for (const c of list) {
      const re = Math.min(...(PAL[n] || []).map((p) => dE(c.hex, p)));
      check(Math.abs(re - c.dE) < 0.05 && c.dE <= 20 && c.ref === c.dE > 12, `データ①: ${n} ${c.kind} ${c.hex} dE=${c.dE}・計算し直し ${re.toFixed(2)}・ref=${c.ref}`);
    }
  }
}
check(!/AMZ\("rom%26nd/.test(src) && !/rom%2526nd/.test(src), "データ⑤: src に AMZ(\"rom%26nd…\")（エンコード済みの文字列を渡す箇所）が無い");

// ── 回答パターンの探索（test/result12_check.mjs と同じ）──
const q12 = src.slice(src.indexOf("const Q12 = ["), src.indexOf("const TIE_Q"));
const GAINS = [...q12.matchAll(/A: \[(\d), (\d)\], B: \[(\d), (\d)\]/g)].map((m) => ({ A: [+m[1], +m[2]], B: [+m[3], +m[4]] }));
if (GAINS.length !== 13) throw new Error("Q12 の配点が13問分取れない: " + GAINS.length);
const TIE = { A: 1, B: 2, C: 3, D: 4 };
const sortTypes = (s) => [1, 2, 3, 4].map((t) => ({ t, s: s[t] })).sort((a, b) => (b.s !== a.s ? b.s - a.s : a.t - b.t));
function findPattern(want) {
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
}

// ── 合成写真（test/result12_check.mjs と同じ。質問式で出ない 4-1 / 1-4 / 3-2 用）──
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz);
  const l = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  return l.map((c) => Math.max(0, Math.min(255, Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))));
}
function chunk(type, data) {
  const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function regionPng(W, H, base, rects) {
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
}
const facePhoto = (skinLab, hairL) => {
  const skin = labToRgb(...skinLab), hair = labToRgb(hairL, 0, 0);
  return regionPng(600, 800, [190, 190, 195], [
    [0.40, 0.06, 0.60, 0.16, hair], [0.24, 0.46, 0.36, 0.58, skin], [0.64, 0.46, 0.76, 0.58, skin], [0.34, 0.76, 0.66, 0.92, [235, 235, 235]],
  ]);
};
const PHOTO = { "4-1": facePhoto([64, 14, 17.3], 6), "1-4": facePhoto([68, 12, 19], 10), "3-2": facePhoto([64, 6, 15.7], 54) };

const TYPES12 = [
  ["1-2", "ライトスプリング"], ["1-3", "ウォームスプリング"], ["1-4", "ブライトスプリング"],
  ["2-1", "ブライトサマー"], ["2-3", "ソフトサマー"], ["2-4", "クールサマー"],
  ["3-1", "ウォームオータム"], ["3-2", "ソフトオータム"], ["3-4", "ディープオータム"],
  ["4-1", "ブライトウィンター"], ["4-2", "クールウィンター"], ["4-3", "ディープウィンター"],
];

// ── 2. 表示・3. 計測 ──
const harness = `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div><script>window.dataLayer=[];</script><script src="/__bundle.js"></script></body></html>`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/__harness.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(harness); return; }
  if (p === "/__bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(BUNDLE_SRC); return; }
  const f = join(ROOT, p);
  if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const base = "http://127.0.0.1:" + server.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
await ctx.route((u) => /(^|\.)(rakuten\.co\.jp|r10\.to|amazon\.co\.jp|a8\.net|qoo10\.jp|image-qoo10\.jp)$/.test(u.hostname), (r) => r.abort());
await ctx.addInitScript(() => {
  window.addEventListener("click", (e) => { const a = e.target && e.target.closest && e.target.closest("a"); if (a) e.preventDefault(); }, true);
});
const page = await ctx.newPage();
page.on("pageerror", (e) => ng.push("pageerror: " + e.message));

async function toResult(key) {
  await page.goto(base + "/__harness.html");
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await page.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await page.reload();
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
  const pat = findPattern(key);
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
}

// 「仕上げのコスメはコレ！」の h3 → p → カード（div > div.rounded-2xl.p-4.mb-3）が続く間を読む
const readCards = () => page.evaluate(() => {
  const top = [...document.querySelectorAll("#colorlab-root h3")].find((h) => h.textContent.trim() === "仕上げのコスメはコレ！");
  if (!top) return { error: "仕上げのコスメの見出しが無い" };
  const cards = [];
  let w = top.nextElementSibling && top.nextElementSibling.nextElementSibling;
  while (w && w.tagName === "DIV" && w.firstElementChild && w.firstElementChild.matches("div.rounded-2xl.p-4.mb-3")) {
    const c = w.firstElementChild;
    const head = c.firstElementChild;
    const spans = head.querySelectorAll(":scope > span");
    const note = head.querySelector(".text-xs");
    const chip = note && note.querySelector("span.rounded-full");
    const links = [...c.querySelectorAll("a")];
    cards.push({
      pr: spans[0] ? spans[0].textContent.trim() : null,
      kind: spans[1] ? spans[1].textContent.trim() : null,
      name: (head.querySelector(".text-sm.font-medium") || {}).textContent,
      note: note ? note.textContent : null,
      chip: chip ? getComputedStyle(chip).backgroundColor : null,
      links: links.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href"), target: a.getAttribute("target") })),
    });
    w = w.nextElementSibling;
  }
  return { cards };
});
const rgbOf = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const cosmeEvents = () => page.evaluate(() => JSON.parse(JSON.stringify((window.dataLayer || []).filter((e) => e && e.event === "cosme_click"))));

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shots = [];
for (const [key, name12] of TYPES12) {
  await toResult(key);
  const exp = EXPECT[name12];
  const s = await readCards();
  if (s.error) { check(false, `${name12}: ${s.error}`); continue; }
  // ②
  check(s.cards.length === exp.length, `${name12} 表示②: カード ${exp.length}枚 (実測 ${s.cards.length})`);
  const order = s.cards.map((c) => c.kind);
  check(JSON.stringify(order) === JSON.stringify([...order].sort((a, b) => SLOT[a] - SLOT[b])), `${name12} 表示②: 並び ${order.join("→")}`);
  for (let i = 0; i < Math.min(exp.length, s.cards.length); i++) {
    const e = exp[i], g = s.cards[i];
    const want = {
      pr: "PR", kind: e.kind, name: e.name,
      note: `${e.kind}｜近い色: ${e.ref ? "(色の近さは目安)" : ""}・¥${e.price.toLocaleString("en-US")}`,
      chip: rgbOf(e.hex),
      links: JSON.stringify([{ text: "楽天で見る", href: rakutenOf(e.kw), target: "_blank" }, { text: "Amazonで見る", href: AMZ(e.kw), target: "_blank" }]),
    };
    const got = { ...g, links: JSON.stringify(g.links) };
    const diff = Object.keys(want).filter((k) => got[k] !== want[k]);
    check(diff.length === 0, `${name12} 表示②: ${i + 1}枚目 ${e.name}・${want.note}・楽天 ${rakutenOf(e.kw) === H5 ? "h5fdes" : "RK"}` + (diff.length ? ` (違い: ${diff.map((k) => k + "=" + got[k] + "≠" + want[k]).join(", ")})` : ""));
    // ⑤
    if (e.name.startsWith("rom&nd")) {
      const amz = (g.links.find((l) => l.text === "Amazonで見る") || {}).href || "";
      check(amz.includes("k=rom%26nd") && !amz.includes("%2526"), `${name12} ⑤: rom&nd の Amazon URL が k=rom%26nd (${amz})`);
    }
  }
  // ③
  if (NO_FRAME[name12]) check(!s.cards.some((c) => c.kind === NO_FRAME[name12]), `${name12} 枠なし③: ${NO_FRAME[name12]}のカードが無い (${order.join("・")})`);
  // ④
  const cardLoc = page.locator("xpath=//h3[normalize-space()='仕上げのコスメはコレ！']/following-sibling::div/div[contains(@class,'p-4') and contains(@class,'mb-3')]");
  const n = Math.min(exp.length, await cardLoc.count());
  for (let i = 0; i < n; i++) {
    const e = exp[i];
    for (const [text, merchant] of [["楽天で見る", "rakuten"], ["Amazonで見る", "amazon"]]) {
      const btn = cardLoc.nth(i).getByRole("link", { name: text });
      const before = (await cosmeEvents()).length;
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      const added = (await cosmeEvents()).slice(before);
      if (added.length !== 1) { check(false, `${name12} 計測④: ${e.name} ${text} cosme_click が1回 (実測 ${added.length}回)`); continue; }
      const ev = added[0];
      const w = { event: "cosme_click", type12: name12, screen: "result", slot: String(SLOT[e.kind]), brand: e.name.split(" ")[0], item: e.name, merchant, app_version: VERSION };
      const keysOk = JSON.stringify(Object.keys(ev).sort()) === JSON.stringify(KEYS);
      const strOk = Object.values(ev).every((v) => typeof v === "string");
      const diff = Object.keys(w).filter((k) => ev[k] !== w[k]);
      check(keysOk && strOk && diff.length === 0, `${name12} 計測④: ${JSON.stringify(ev)}` + (diff.length ? ` (違い: ${diff.map((k) => k + "=" + ev[k] + "≠" + w[k]).join(", ")})` : "") + (keysOk ? "" : " (キーが違う)") + (strOk ? "" : " (文字列でない値がある)"));
    }
  }
  // スクリーンショット: 「仕上げのコスメはコレ！」から次の h3（デパコス）か 2nd Type の枠の上まで
  if (SHOTS) {
    const box = await page.evaluate(() => {
      const top = [...document.querySelectorAll("#colorlab-root h3")].find((h) => h.textContent.trim() === "仕上げのコスメはコレ！");
      let el = top.nextElementSibling;
      while (el && el.tagName !== "H3" && !/^2nd Type Styling/.test(el.textContent.trim())) el = el.nextElementSibling;
      const a = top.getBoundingClientRect(), b = el.getBoundingClientRect();
      return { y: a.top + window.scrollY - 8, h: b.top - a.top + 12 };
    });
    const f = join(SHOTS, `cosme12_${key}_${name12}.png`);
    await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y: box.y, width: 390, height: box.h } });
    shots.push(f);
  }
  console.log(`${name12}: カード ${s.cards.length}枚 (${order.join("・")})`);
}

await browser.close();
server.close();

console.log("\nbundle: " + BUNDLE + "\nsrc: " + SRC_PATH);
for (const f of shots) console.log("shot: " + f);
if (process.env.COSME12_VERBOSE) for (const l of ok) console.log("  [PASS] " + l);
for (const l of ng) console.log("  [FAIL] " + l);
console.log(`\nOK ${ok.length} / NG ${ng.length}`);
console.log(ng.length === 0 ? "ALL PASS" : ng.length + " 件 FAIL");
process.exit(ng.length === 0 ? 0 : 1);
