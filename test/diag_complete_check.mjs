// v1.22.8 の実測（2026-10-11）。
//   (1) 診断結果の表示で dataLayer に diag_complete が1結果1回だけ積まれる（再描画・メニューへ戻るで増えない）
//   (2) パラメータは method / app_first / app_second / site / app_version だけ（写真・計測値を入れない）
//   (3) 結果画面に「プロ診断でタイプが分かっている方は…」の1行と、ブルベ・イエベ両方のリンクがある
//       （href は既存の SITE_URL + utm_content=self_select・既存 utm を維持）
// 経路は 質問 / 写真（合成写真）/ 写真＋質問 の3つ。
// 実行: npm run build:colorlab && node test/diag_complete_check.mjs
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import zlib from "zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const HARNESS = "_card_harness.html";   // .gitignore 済み（types12_check と同じ中身）
writeFileSync(resolve(HERE, HARNESS), `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/dist/colorlab.iife.js"></script></body></html>`, "utf-8");

const VERSION = (readFileSync(resolve(ROOT, "src", "kotaeawase.jsx"), "utf-8").match(/appVersion: "([\d.]+)"/) || [])[1];
const UTM = "utm_source=colorlab&utm_medium=app&utm_campaign=ai_stylist";
const SEASONS = ["spring", "summer", "autumn", "winter"];
const KEYS = ["app_first", "app_second", "app_version", "event", "method", "site"];

// ── 合成写真（test/types12_check.mjs と同じ作り方）──
function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = 0.95047 * inv(fx), Y = inv(fy), Z = 1.08883 * inv(fz);
  const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  return lin.map((c) => Math.max(0, Math.min(255, Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))));
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
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const facePhoto = (skinLab, hairL) => {
  const skin = labToRgb(...skinLab), hair = labToRgb(hairL, 0, 0);
  return regionPng(600, 800, [190, 190, 195], [
    [0.40, 0.06, 0.60, 0.16, hair],
    [0.24, 0.46, 0.36, 0.58, skin],
    [0.64, 0.46, 0.76, 0.58, skin],
    [0.34, 0.76, 0.66, 0.92, [235, 235, 235]],
  ]);
};
const PHOTO = facePhoto([64, 14, 17.3], 6);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  const f = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://127.0.0.1:" + server.address().port;

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on("pageerror", (e) => ng.push("pageerror: " + e.message));

const diagEvents = () => page.evaluate(() => JSON.parse(JSON.stringify((window.dataLayer || []).filter((e) => e && e.event === "diag_complete"))));
const waitResult = () => page.waitForFunction(() => /タイプです/.test(document.querySelector("#colorlab-root").textContent), null, { timeout: 15000 });

async function fresh(site) {
  await page.goto(base + "/test/" + HARNESS);
  await page.evaluate((s) => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} }, site);
  await page.addInitScript((s) => { window.COLORLAB_SITE = s; }, site);
  await page.reload();
  await page.waitForSelector("#colorlab-root button", { timeout: 15000 });
}
async function answer13() {
  for (let i = 0; i < 13; i++) {
    await page.locator("#colorlab-root button").nth(1).click();   // 先頭は戻る。A を選ぶ
    await page.waitForTimeout(80);
  }
  // 1位同点なら同点解消の設問が出る（その時は先頭の選択肢）
  await page.waitForTimeout(200);
  if (!/タイプです/.test(await page.locator("#colorlab-root").textContent())) await page.locator("#colorlab-root button").nth(1).click();
}
async function photoUpload() {
  await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  const boxes = page.locator("#colorlab-root input[type=checkbox]");
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: /^地毛に近い$/ }).click();
  await page.getByRole("button", { name: /撮影にすすむ/ }).click();
  await page.getByRole("button", { name: /カメラを起動する/ }).click();
  await page.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: "face.png", mimeType: "image/png", buffer: PHOTO });
}

function checkEvent(label, ev, method, site) {
  check(!!ev, `${label}: diag_complete がある`);
  if (!ev) return;
  check(JSON.stringify(Object.keys(ev).sort()) === JSON.stringify(KEYS), `${label}: キーは ${KEYS.join("/")} だけ (${Object.keys(ev).sort().join("/")})`);
  check(ev.method === method, `${label}: method=${method} (${ev.method})`);
  check(SEASONS.includes(ev.app_first) && SEASONS.includes(ev.app_second) && ev.app_first !== ev.app_second, `${label}: app_first/app_second が4シーズン名 (${ev.app_first}/${ev.app_second})`);
  check(ev.site === site, `${label}: site=${site} (${ev.site})`);
  check(ev.app_version === VERSION && VERSION === "1.22.10", `${label}: app_version=${VERSION} (${ev.app_version})`);
  const s = JSON.stringify(ev);
  check(s.length < 200 && !/data:|base64|measure|metrics|wb|dist|axes|note|url/i.test(s), `${label}: 写真・計測値・URL を含まない (${s})`);
}

async function checkLinks(label) {
  const info = await page.evaluate(() => {
    const root = document.querySelector("#colorlab-root");
    const p = [...root.querySelectorAll("p")].find((x) => x.textContent.includes("プロ診断でタイプが分かっている方は、こちらから選べます"));
    const as = p ? [...p.querySelectorAll("a")].map((a) => ({ t: a.textContent.trim(), href: a.getAttribute("href"), target: a.target })) : [];
    return { text: p ? p.textContent.replace(/\s+/g, " ").trim() : "", as };
  });
  check(info.text === "プロ診断でタイプが分かっている方は、こちらから選べます: ブルベの商品を見る イエベの商品を見る", `${label}: 1行の文言 (${info.text})`);
  const want = [
    { t: "ブルベの商品を見る", href: `https://blubel.jp?${UTM}&utm_content=self_select` },
    { t: "イエベの商品を見る", href: `https://iebel.jp?${UTM}&utm_content=self_select` },
  ];
  check(info.as.length === 2, `${label}: リンクは2本 (${info.as.length})`);
  for (const w of want) {
    const a = info.as.find((x) => x.t === w.t);
    check(a && a.href === w.href, `${label}: ${w.t} → ${w.href} (${a && a.href})`);
    if (a) {
      const u = new URL(a.href);
      check(u.searchParams.get("utm_source") === "colorlab" && u.searchParams.get("utm_medium") === "app" && u.searchParams.get("utm_campaign") === "ai_stylist" && u.searchParams.get("utm_content") === "self_select", `${label}: ${w.t} の utm 4つ`);
    }
  }
  // おすすめ商品（SkuCard）より下・コスメ見出しより上にある
  const order = await page.evaluate(() => {
    const root = document.querySelector("#colorlab-root");
    const html = root.innerHTML;
    return { self: html.indexOf("プロ診断でタイプが分かっている方は"), sku: html.lastIndexOf("/items/", html.indexOf("仕上げのコスメはコレ")), cosme: html.indexOf("仕上げのコスメはコレ") };
  });
  check(order.sku >= 0 && order.sku < order.self && order.self < order.cosme, `${label}: 商品リンクの下・コスメの上 (${JSON.stringify(order)})`);
}

// ── 1) 質問で診断（BLUBEL）──
await fresh("blubel");
await page.getByRole("button", { name: /質問で診断/ }).first().click();
await answer13();
await waitResult(); await page.waitForTimeout(400);
let evs = await diagEvents();
check(evs.length === 1, `質問: 結果表示で1回 (${evs.length})`);
checkEvent("質問", evs[0], "quiz", "blubel");
await checkLinks("質問");
// v1.22.10: 再描画に使っていた「TOP6の色だけ」が結果画面から無くなったので、
// 再描画の確認は下の2回目の診断のあと（「今日なに着る？」へ移る）に移した
// メニューへ戻る → 増えない
await page.getByRole("button", { name: /メニューへ戻る/ }).first().click(); await page.waitForTimeout(300);
check((await diagEvents()).length === 1, `質問: メニューへ戻るで増えない (${(await diagEvents()).length})`);
// 結果から「今日なに着る？」へ行って戻る経路は無い（戻る=メニュー）。ブラウザの戻るでも増えないこと
await page.goBack().catch(() => {}); await page.waitForTimeout(300);
check((await diagEvents()).length <= 1, `質問: ブラウザの戻るで増えない`);
// 2回目の診断は別の結果なので +1
await fresh("blubel");
await page.getByRole("button", { name: /質問で診断/ }).first().click();
await answer13(); await waitResult(); await page.waitForTimeout(300);
await page.getByRole("button", { name: /メニューへ戻る/ }).first().click(); await page.waitForTimeout(200);
await page.getByRole("button", { name: /質問で診断/ }).first().click();
await answer13(); await waitResult(); await page.waitForTimeout(400);
check((await diagEvents()).length === 2, `質問: 同じページで2回診断すると2回 (${(await diagEvents()).length})`);
// 再描画（結果画面から「今日なに着る？」へ移る）→ 増えない
await page.getByRole("button", { name: /このタイプで「今日なに着る？」/ }).first().click(); await page.waitForTimeout(300);
check((await diagEvents()).length === 2, `質問: 再描画で増えない (${(await diagEvents()).length})`);

// ── 2) 写真で診断（IEBEL）──
await fresh("iebel");
await page.getByRole("button", { name: /^写真で診断/ }).click();
await photoUpload();
await waitResult(); await page.waitForTimeout(400);
evs = await diagEvents();
check(evs.length === 1, `写真: 結果表示で1回 (${evs.length})`);
checkEvent("写真", evs[0], "photo", "iebel");
await checkLinks("写真");

// ── 3) 写真＋質問（IEBEL）──
await fresh("iebel");
await page.getByRole("button", { name: /写真＋質問で12タイプ診断/ }).click();
await photoUpload();
await page.waitForFunction(() => !/撮影|写真を選ぶ/.test(document.querySelector("#colorlab-root h1, #colorlab-root header")?.textContent || "") , null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(800);
check((await diagEvents()).length === 0, `写真＋質問: 写真の段階では送らない (${(await diagEvents()).length})`);
await answer13();
await waitResult(); await page.waitForTimeout(400);
evs = await diagEvents();
check(evs.length === 1, `写真＋質問: 結果表示で1回 (${evs.length})`);
checkEvent("写真＋質問", evs[0], "combo", "iebel");

await page.screenshot({ path: resolve(ROOT, "out", "release", "v1.22.8_self_select.png"), fullPage: false,
  clip: await (async () => { const el = page.locator("#colorlab-root p", { hasText: "プロ診断でタイプが分かっている方は" }).first(); await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox(); return { x: 0, y: Math.max(0, b.y - 300), width: 420, height: 420 }; })() });

await browser.close();
server.close();
for (const l of ok) console.log("OK  " + l);
for (const l of ng) console.log("NG  " + l);
console.log(`\n${ok.length} OK / ${ng.length} NG`);
process.exit(ng.length ? 1 : 0);
