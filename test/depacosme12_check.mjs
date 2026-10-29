// 診断結果のデパコス枠（v1.22.16・2026-10-29・12タイプ別・HERA/ルナソル・楽天公式ショップ）を検査する。
//   1. データ（src を読む）: ①12タイプ名が TYPE12_NAME と一致 ②各タイプの hera/luna が下の表と完全一致（key・色番・色名・HEX・de）
//      ③hera/luna があるものは de≦10（TYPE12_PALETTE から CIE76 で計算し直した値とも一致） ④URL は4本だけで下の文字列と完全一致
//      ⑤ディープウィンター・クールウィンターは両方 null ⑥ルナソルを持つのは4タイプだけ
//   2. 表示（バンドルを動かす）: 12タイプの結果画面で、「仕上げのコスメはコレ！」3枠の直後に見出し「デパコスで探すなら」と
//      カード（0/1/2枚・HERA→ルナソル）。各カードのブランド・商品名・種別・色番 色名・価格・色チップ・PR・ボタン文言・
//      href（短縮URLそのまま）・target=_blank・rel="nofollow sponsored noopener"。0枚のタイプは見出しも無い
//   3. 計測: 新しいボタンを押すと cosme_click がちょうど1回積まれ、8キーすべて文字列・値が期待どおり
//   12タイプのスクリーンショット（3枠〜デパコス枠）を out/release/tests_1029_v12216/screens/ に保存する。
// 期待値はこのファイルに直接書く（src から読まない）。外部（楽天ほか）への通信はすべて止める。
// 実行: npm run build:colorlab && node test/depacosme12_check.mjs [バンドル] [--src 検査するsrc] [--shots 保存先|--no-shots]
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
const SHOTS = args.includes("--no-shots") ? null : resolve(opt("--shots") || join(ROOT, "out", "release", "tests_1029_v12216", "screens"));
const BUNDLE_SRC = readFileSync(BUNDLE);
const src = readFileSync(SRC_PATH, "utf-8");
const VERSION = "1.22.16";
const KEYS = ["app_version", "brand", "event", "item", "merchant", "screen", "slot", "type12"];

// ── 期待値 ──
const URL = {
  blush: "https://a.r10.to/h8iRNI",
  gloss: "https://a.r10.to/hPIzA2",
  pml: "https://a.r10.to/h5bzwM",
  luna: "https://a.r10.to/hgkIsR",
};
const ITEM = {
  blush: { brand: "HERA", product: "リフレクション リキッドブラッシュ", kind: "チーク", price: 4840 },
  gloss: { brand: "HERA", product: "センシュアル ヌードグロス", kind: "リップ", price: 4400 },
  pml: { brand: "HERA", product: "センシュアル パウダーマットリキッド EX", kind: "リップ", price: 4400 },
  luna: { brand: "LUNASOL", product: "フュージングカラーリップス", kind: "リップ", price: 4950 },
};
const LABEL = { HERA: "HERA", LUNASOL: "ルナソル" };
const EXPECT = {
  "ブライトサマー": { hera: { key: "blush", no: "203", name: "ベベ", hex: "#F7C6C1", de: 8.6 }, luna: null },
  "ソフトサマー": { hera: { key: "blush", no: "183", name: "ロージー", hex: "#E79EAF", de: 8.8 }, luna: null },
  "クールサマー": { hera: { key: "blush", no: "203", name: "ベベ", hex: "#F7C6C1", de: 7.8 }, luna: null },
  "ディープウィンター": { hera: null, luna: null },
  "クールウィンター": { hera: null, luna: null },
  "ブライトウィンター": { hera: { key: "gloss", no: "18", name: "イノセント", hex: "#ECD4E2", de: 9.0 }, luna: null },
  "ライトスプリング": { hera: { key: "blush", no: "422", name: "ランジェリー", hex: "#D68378", de: 3.2 }, luna: null },
  "ブライトスプリング": { hera: { key: "pml", no: "426", name: "アールグレイ", hex: "#D06F66", de: 7.7 }, luna: { no: "11", name: "April Kiss", hex: "#D46A5C", de: 5.2 } },
  "ウォームスプリング": { hera: { key: "pml", no: "426", name: "アールグレイ", hex: "#D06F66", de: 4.1 }, luna: { no: "09", name: "Warm Cuddle", hex: "#D4684E", de: 7.1 } },
  "ウォームオータム": { hera: { key: "gloss", no: "422", name: "ランジェリー", hex: "#E4968C", de: 3.6 }, luna: { no: "05", name: "Terra Maroon", hex: "#AF4C37", de: 4.4 } },
  "ソフトオータム": { hera: { key: "gloss", no: "401", name: "ヌーディスト", hex: "#D19C9A", de: 4.5 }, luna: null },
  "ディープオータム": { hera: { key: "pml", no: "499", name: "ロージースウェード", hex: "#8A3C39", de: 9.3 }, luna: { no: "04", name: "Modern Oak", hex: "#A05C48", de: 5.0 } },
};
// 画面に出るはずのカード（HERA→ルナソル）
const cardsOf = (name12) => {
  const d = EXPECT[name12];
  const out = [];
  if (d.hera) out.push({ ...ITEM[d.hera.key], ...d.hera, url: URL[d.hera.key], slot: "depacosme_hera" });
  if (d.luna) out.push({ ...ITEM.luna, ...d.luna, url: URL.luna, slot: "depacosme_luna" });
  return out;
};

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

// ── 1. データ ──
const objAfter = (head) => {
  const i = src.indexOf(head);
  if (i < 0) return null;
  const j = src.indexOf("\n};", i);
  try { return Function("return " + src.slice(i + head.length, j + 2))(); } catch (e) { return null; }
};
const TYPE12_NAME = objAfter("const TYPE12_NAME = ");
const D12 = objAfter("export const DEPACOSME_12 = ");
const DURL = objAfter("const DEPACOSME_URL = ");
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

check(!!TYPE12_NAME && !!D12 && !!DURL, `データ: TYPE12_NAME / DEPACOSME_12 / DEPACOSME_URL が src から読める (${SRC_PATH})`);
if (TYPE12_NAME && D12 && DURL) {
  const names = Object.values(TYPE12_NAME).sort();
  check(JSON.stringify(Object.keys(D12).sort()) === JSON.stringify(names) && JSON.stringify(Object.keys(EXPECT).sort()) === JSON.stringify(names),
    `データ①: 12タイプ名が TYPE12_NAME と一致 (${Object.keys(D12).length}件)`);
  for (const n of Object.keys(EXPECT)) {
    check(JSON.stringify(D12[n]) === JSON.stringify(EXPECT[n]), `データ②: ${n} が表どおり ${JSON.stringify(D12[n])}`);
    for (const side of ["hera", "luna"]) {
      const c = D12[n] && D12[n][side];
      if (!c) continue;
      const re = Math.min(...(PAL[n] || []).map((p) => dE(c.hex, p)));
      check(c.de <= 10 && Math.abs(re - c.de) < 0.05, `データ③: ${n} ${side} ${c.no} de=${c.de}≦10・計算し直し ${re.toFixed(2)}`);
    }
  }
  check(JSON.stringify(DURL) === JSON.stringify(URL) && Object.values(DURL).every((u) => !/[?#&]/.test(u)),
    `データ④: URL は4本だけで完全一致・クエリなし ${JSON.stringify(DURL)}`);
  const allR10 = [...new Set([...src.matchAll(/https?:\/\/a\.r10\.to\/[A-Za-z0-9]+[^"\s]*/g)].map((m) => m[0]))].sort();
  check(JSON.stringify(allR10) === JSON.stringify(Object.values(URL).sort()), `データ④: src にある短縮URLは4本だけ (${allR10.join(" ")})`);
  check(["ディープウィンター", "クールウィンター"].every((n) => D12[n] && D12[n].hera === null && D12[n].luna === null), "データ⑤: ディープウィンター・クールウィンターは hera/luna とも null");
  const lunaTypes = Object.keys(D12).filter((n) => D12[n] && D12[n].luna).sort();
  check(JSON.stringify(lunaTypes) === JSON.stringify(["ウォームオータム", "ウォームスプリング", "ディープオータム", "ブライトスプリング"].sort()), `データ⑥: ルナソルは4タイプだけ (${lunaTypes.join("・")})`);
}

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

// 3枠の後ろの並び: 3枠の最後の div の次が h3「デパコスで探すなら」→ p → カード…（カードは連続する div.rounded-2xl.p-4.mb-3）
const readSection = () => page.evaluate(() => {
  const h3s = [...document.querySelectorAll("#colorlab-root h3")];
  const top = h3s.find((h) => h.textContent.trim() === "仕上げのコスメはコレ！");
  const dep = h3s.filter((h) => h.textContent.trim() === "デパコスで探すなら");
  if (!top) return { error: "仕上げのコスメの見出しが無い" };
  let el = top.nextElementSibling.nextElementSibling;   // p の次 = 3枠の1つ目
  for (let i = 0; i < 3 && el; i++) el = el.nextElementSibling;
  const afterSlots = el;
  const info = { depCount: dep.length, nextIsDep: !!afterSlots && afterSlots.tagName === "H3" && afterSlots.textContent.trim() === "デパコスで探すなら", cards: [] };
  if (dep.length) {
    const note = dep[0].nextElementSibling;
    info.note = note && note.tagName === "P" ? note.textContent.trim() : null;
    let c = note && note.nextElementSibling;
    while (c && c.matches("div.rounded-2xl.p-4.mb-3")) {
      const a = c.querySelector("a");
      const spans = c.querySelectorAll(":scope > div:first-child > span");
      const chip = c.querySelector("span.w-4.h-4.rounded-full");
      info.cards.push({
        pr: spans[0] ? spans[0].textContent.trim() : null,
        kind: spans[1] ? spans[1].textContent.trim() : null,
        title: (c.querySelector(".text-sm.font-medium") || {}).textContent,
        line: chip ? chip.parentElement.textContent.trim() : null,
        chip: chip ? getComputedStyle(chip).backgroundColor : null,
        links: c.querySelectorAll("a").length,
        href: a && a.getAttribute("href"), target: a && a.getAttribute("target"), rel: a && a.getAttribute("rel"), btn: a && a.textContent.trim(),
      });
      c = c.nextElementSibling;
    }
  }
  return info;
});
const rgbOf = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const cosmeEvents = () => page.evaluate(() => JSON.parse(JSON.stringify((window.dataLayer || []).filter((e) => e && e.event === "cosme_click"))));

if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shots = [];
for (const [key, name12] of TYPES12) {
  await toResult(key);
  const exp = cardsOf(name12);
  const s = await readSection();
  if (s.error) { check(false, `${name12}: ${s.error}`); continue; }
  check(s.cards.length === exp.length, `${name12} 表示: カード ${exp.length}枚 (実測 ${s.cards.length})`);
  if (exp.length === 0) {
    check(s.depCount === 0, `${name12} 表示: 見出し「デパコスで探すなら」が無い (実測 ${s.depCount})`);
  } else {
    check(s.depCount === 1 && s.nextIsDep, `${name12} 表示: 3枠の直後に見出し「デパコスで探すなら」`);
    check(s.note === `${name12}の似合う色に近い色を、色の近さで選びました。`, `${name12} 表示: 注記「${s.note}」`);
  }
  for (let i = 0; i < Math.min(exp.length, s.cards.length); i++) {
    const e = exp[i], g = s.cards[i];
    const want = { pr: "PR", kind: e.kind, title: `${LABEL[e.brand]} ${e.product}`, line: `${e.no} ${e.name}・¥${e.price.toLocaleString("en-US")}(税込)`,
      chip: rgbOf(e.hex), links: 1, href: e.url, target: "_blank", rel: "nofollow sponsored noopener", btn: "楽天の公式ショップで見る" };
    const diff = Object.keys(want).filter((k) => g[k] !== want[k]);
    check(diff.length === 0, `${name12} 表示: ${i + 1}枚目 ${want.title} ${want.line} ${e.url}` + (diff.length ? ` (違い: ${diff.map((k) => k + "=" + g[k] + "≠" + want[k]).join(", ")})` : ""));
  }
  // 計測
  const btns = page.locator("xpath=//h3[normalize-space()='デパコスで探すなら']/following-sibling::div[contains(@class,'p-4') and contains(@class,'mb-3')]//a");
  for (let i = 0; i < Math.min(exp.length, await btns.count()); i++) {
    const e = exp[i];
    const before = (await cosmeEvents()).length;
    await btns.nth(i).scrollIntoViewIfNeeded();
    await btns.nth(i).click();
    const added = (await cosmeEvents()).slice(before);
    if (added.length !== 1) { check(false, `${name12} 計測: ${e.slot} cosme_click が1回 (実測 ${added.length}回)`); continue; }
    const ev = added[0];
    const w = { event: "cosme_click", type12: name12, screen: "result", slot: e.slot, brand: e.brand, item: `${e.product}_${e.no}`, merchant: "rakuten", app_version: VERSION };
    const keysOk = JSON.stringify(Object.keys(ev).sort()) === JSON.stringify(KEYS);
    const strOk = Object.values(ev).every((v) => typeof v === "string");
    const diff = Object.keys(w).filter((k) => ev[k] !== w[k]);
    check(keysOk && strOk && diff.length === 0, `${name12} 計測: ${JSON.stringify(ev)}` + (diff.length ? ` (違い: ${diff.map((k) => k + "=" + ev[k] + "≠" + w[k]).join(", ")})` : "") + (keysOk ? "" : " (キーが違う)") + (strOk ? "" : " (文字列でない値がある)"));
  }
  // スクリーンショット: 「仕上げのコスメはコレ！」から 2nd Type の枠の上まで
  if (SHOTS) {
    const box = await page.evaluate(() => {
      const top = [...document.querySelectorAll("#colorlab-root h3")].find((h) => h.textContent.trim() === "仕上げのコスメはコレ！");
      const end = [...document.querySelectorAll("#colorlab-root div")].find((d) => d.textContent.trim().startsWith("2nd Type Styling"));
      const a = top.getBoundingClientRect(), b = end.getBoundingClientRect();
      return { y: a.top + window.scrollY - 8, h: b.top - a.top + 24 };
    });
    const f = join(SHOTS, `depacosme12_${key}_${name12}.png`);
    await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y: box.y, width: 390, height: box.h } });
    shots.push(f);
  }
  console.log(`${name12}: カード ${s.cards.length}枚`);
}

await browser.close();
server.close();

console.log("\nbundle: " + BUNDLE + "\nsrc: " + SRC_PATH);
for (const f of shots) console.log("shot: " + f);
if (process.env.DEPA_VERBOSE) for (const l of ok) console.log("  [PASS] " + l);
for (const l of ng) console.log("  [FAIL] " + l);
console.log(`\nOK ${ok.length} / NG ${ng.length}`);
console.log(ng.length === 0 ? "ALL PASS" : ng.length + " 件 FAIL");
process.exit(ng.length === 0 ? 0 : 1);
