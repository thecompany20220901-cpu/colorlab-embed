// コスメ・AFF ボタンのクリック計測（v1.22.15・2026-10-29）を実測する。
// 12タイプ全部で、次のボタンを1つずつ押し、dataLayer に cosme_click がちょうど1回積まれることを見る。
//   ・診断結果「仕上げのコスメはコレ！」の3枠の「楽天で見る」「Amazonで見る」 … screen=result / slot=1〜3
//   ・おすすめコスメ（「すべて」と「一式セット」）の「楽天で見る」「Amazonで見る」と DEPACOS の「Qoo10で見る」
//                                                             … screen=cosme / slot=一覧内の順番
//   ・おすすめ髪色のセルフカラー商品（HAIR の affs）の「楽天で見る」「Amazonで見る」 … screen=hair / slot=一覧内の順番
//   ・今日なに着る？（コーデ提案）の結果「仕上げのコスメ」の「楽天で見る」「Amazonで見る」 … screen=today / slot=一覧内の順番
//   ・リップ・髪色 試し塗りの商品（リップ・髪色の両方のタブ）の「楽天で見る」「Amazonで見る」 … screen=tryon / slot=一覧内の順番
// パラメータは type12 / screen / slot / brand / item / merchant / app_version の7つ（event を除く）で、すべて文字列。
// あわせて
//   (a) ボタンの DOM（href・target・rel・class・style・文言）が v1.22.14 のバンドルと1文字も違わない
//       （結果画面は3枠、コスメ・髪色は画面全体の outerHTML を比べる）
//   (b) 本当に押した時（遷移を止めない）も別タブで開き、開いた先が href と同じ。イベントは1回
//   (c) 「リップ」で絞り込んだ時の slot は、絞り込んだ一覧の中の順番
//   (d) brand は先頭の語を下の BRAND_ALIAS で英字の大文字表記に寄せた値（キャンメイク→CANMAKE など）。
//       寄せる前の表記（キャンメイク・セザンヌ・エクセル・excel・ケイト）が brand に1件も出ず、5つとも実際に押して確かめる
// 外部（楽天・Amazon・A8・Qoo10）への通信はすべて止める。A8 に偽の表示・クリックを記録させないため。
// 期待値（結果画面の3枠・版）はこのファイルに直接書く（src から読まない）。
// 実行: npm run build:colorlab && node test/cosme_click_check.mjs [バンドルのパス] [--baseline 比較元バンドル]
//   バンドル省略時は dist/colorlab.iife.js。比較元の省略時は v1.22.14 の dist（git show 348fbf2:dist/colorlab.iife.js）。
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join, extname } from "path";
import zlib from "zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const args = process.argv.slice(2);
const bi = args.indexOf("--baseline");
const BASELINE_PATH = bi >= 0 ? args[bi + 1] : null;
const BUNDLE = resolve(args.filter((a, i) => a !== "--baseline" && i !== bi + 1)[0] || join(ROOT, "dist", "colorlab.iife.js"));
const BUNDLE_SRC = readFileSync(BUNDLE);
const BASELINE_SRC = BASELINE_PATH ? readFileSync(resolve(BASELINE_PATH))
  : execFileSync("git", ["show", "348fbf2:dist/colorlab.iife.js"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

const VERSION = "1.22.15";
const KEYS = ["app_version", "brand", "event", "item", "merchant", "screen", "slot", "type12"];
const MERCHANT = { "楽天で見る": "rakuten", "Amazonで見る": "amazon", "Qoo10で見る": "qoo10" };

// [1位-2位, 12タイプ名]
const TYPES12 = [
  ["1-2", "ライトスプリング"], ["1-3", "ウォームスプリング"], ["1-4", "ブライトスプリング"],
  ["2-1", "ブライトサマー"], ["2-3", "ソフトサマー"], ["2-4", "クールサマー"],
  ["3-1", "ウォームオータム"], ["3-2", "ソフトオータム"], ["3-4", "ディープオータム"],
  ["4-1", "ブライトウィンター"], ["4-2", "クールウィンター"], ["4-3", "ディープウィンター"],
];
// 結果画面の3枠（1位のシーズンで決まる）: [商品名, ブランド]
const RESULT3 = {
  1: [["KATE リップモンスター 02 Pink banana", "KATE"], ["rom&nd ベターザンパレット 04 アンビエントライトデイ", "rom&nd"], ["CEZANNE ナチュラルチークN 04 シャインベージュ", "CEZANNE"]],
  2: [["KATE リップモンスター 13 3:00AMの微酔", "KATE"], ["ETUDE プレイカラーアイズ ジューシーペブル", "ETUDE"], ["CEZANNE ナチュラルチークN 02 ピンク", "CEZANNE"]],
  3: [["KATE リップモンスター 04 パンプキンワイン", "KATE"], ["CANMAKE パーフェクトスタイリストアイズ 14 アンティークテラコッタ", "CANMAKE"], ["CEZANNE ナチュラルチークN 04 シャインベージュ", "CEZANNE"]],
  4: [["KATE リップモンスター 06 2:00AM", "KATE"], ["CANMAKE シルキースフレアイズ 06 スモーキーモーヴ", "CANMAKE"], ["キャンメイク グロウフルールチークス（ロージー系）", "CANMAKE"]],
};
// (d) 同じブランドの別表記 → 英字の大文字表記（送る値だけ。画面の表示は変えない）
const BRAND_ALIAS = { "キャンメイク": "CANMAKE", "セザンヌ": "CEZANNE", "エクセル": "EXCEL", "excel": "EXCEL", "ケイト": "KATE" };
const firstWord = (name) => name.split(" ")[0];
const brandOf = (name) => BRAND_ALIAS[firstWord(name)] || firstWord(name);
const seenAlias = {};   // 寄せる前の表記 → 実際に送られた brand

// ── 回答パターンの探索（test/result12_check.mjs と同じ）──
const src = readFileSync(resolve(ROOT, "src", "color_lab_stylist_v23.jsx"), "utf-8");
const q12 = src.slice(src.indexOf("const Q12 = ["), src.indexOf("const TIE_Q"));
const GAINS = [...q12.matchAll(/A: \[(\d), (\d)\], B: \[(\d), (\d)\]/g)]
  .map((m) => ({ A: [+m[1], +m[2]], B: [+m[3], +m[4]] }));
if (GAINS.length !== 13) throw new Error("Q12 の配点が13問分取れない: " + GAINS.length);
const TIE = { A: 1, B: 2, C: 3, D: 4 };
const sortTypes = (s) => [1, 2, 3, 4].map((t) => ({ t, s: s[t] }))
  .sort((a, b) => (b.s !== a.s ? b.s - a.s : a.t - b.t));
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
    const tries = tied ? Object.keys(TIE) : [null];
    for (const tc of tries) {
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
const PHOTO = {
  "4-1": facePhoto([64, 14, 17.3], 6),
  "1-4": facePhoto([68, 12, 19], 10),
  "3-2": facePhoto([64, 6, 15.7], 54),
};

// ハーネスはファイルに書かずサーバから返す（他のテストの _card_harness.html と取り合わない）
const harness = (bundle) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0"><div id="colorlab-root"></div>
<script>window.dataLayer=[];</script>
<script src="/${bundle}"></script></body></html>`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/__harness.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(harness("__bundle.js")); return; }
  if (p === "/__baseline.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(harness("__baseline.js")); return; }
  if (p === "/__bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(BUNDLE_SRC); return; }
  if (p === "/__baseline.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(BASELINE_SRC); return; }
  const f = join(ROOT, p);
  if (!existsSync(f)) { res.writeHead(404); res.end("nf"); return; }
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream", "Access-Control-Allow-Origin": "*" });
  res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://127.0.0.1:" + server.address().port;

const ok = [], ng = [];
const check = (c, l) => (c ? ok : ng).push(l);
let clicks = 0;

// 外部への通信は止める（楽天・Amazon・A8・Qoo10）
const EXTERNAL = /(^|\.)(rakuten\.co\.jp|amazon\.co\.jp|a8\.net|qoo10\.jp|image-qoo10\.jp)$/;
const blockExternal = async (ctx, hits) => {
  await ctx.route((url) => EXTERNAL.test(url.hostname), (r) => { if (hits && r.request().isNavigationRequest()) hits.push(r.request().url()); r.abort(); });
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
await blockExternal(ctx);
// 計測を見る間は遷移（別タブ）を止める。React の onClick は止めない（preventDefault だけ）
await ctx.addInitScript(() => {
  window.addEventListener("click", (e) => {
    const a = e.target && e.target.closest && e.target.closest("a");
    if (a) e.preventDefault();
  }, true);
});
const page = await ctx.newPage();
page.on("pageerror", (e) => ng.push("pageerror: " + e.message));
const basePage = await ctx.newPage();
basePage.on("pageerror", (e) => ng.push("pageerror(baseline): " + e.message));

const CARD = "div.rounded-2xl.p-4.mb-3";
const cosmeEvents = (p) => p.evaluate(() => JSON.parse(JSON.stringify((window.dataLayer || []).filter((e) => e && e.event === "cosme_click"))));

async function fresh(p, harnessPath) {
  await p.goto(base + harnessPath);
  await p.waitForSelector("#colorlab-root button", { timeout: 15000 });
  await p.evaluate(() => { try { localStorage.removeItem("colorlab-profile"); } catch (e) {} });
  await p.reload();
  await p.waitForSelector("#colorlab-root button", { timeout: 15000 });
}

async function toResult(p, key) {
  const pat = findPattern(key);
  if (pat) {
    await p.getByRole("button", { name: /質問で診断/ }).first().click();
    for (let i = 0; i < 13; i++) {
      await p.locator("#colorlab-root button").nth(pat.picks[i] === "A" ? 1 : 2).click();
      await p.waitForTimeout(90);
    }
    if (pat.tie) await p.locator("#colorlab-root button").nth(1 + "ABCD".indexOf(pat.tie)).click();
  } else {
    await p.getByRole("button", { name: /^写真で診断/ }).click();
    await p.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
    const boxes = p.locator("#colorlab-root input[type=checkbox]");
    for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
    await p.getByRole("button", { name: /^地毛に近い$/ }).click();
    await p.getByRole("button", { name: /撮影にすすむ/ }).click();
    await p.getByRole("button", { name: /カメラを起動する/ }).click();
    await p.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
    await p.locator("#colorlab-root input[type=file]").setInputFiles({ name: key + ".png", mimeType: "image/png", buffer: PHOTO[key] });
  }
  await p.waitForFunction(() => /タイプです/.test(document.querySelector("#colorlab-root").textContent), null, { timeout: 15000 });
  await p.waitForTimeout(400);
}

// ホームのタイル → 12タイプの入口で name12 を選ぶ
async function toTile(p, tile, name12) {
  await p.getByRole("button", { name: new RegExp(tile) }).first().click();
  await p.locator("#colorlab-root button").filter({ hasText: new RegExp("^" + name12 + "$") }).first().click();
  await p.waitForTimeout(300);
}
// DEPACOS は A8 を止めているのでフォールバック表示になる。切り替わるまで待つ（DOM 比較のため）
async function settleDepacos(p) {
  if (await p.locator(CARD).filter({ hasText: "DEPACOS" }).count() === 0) return;
  await p.waitForFunction((sel) => {
    const c = [...document.querySelectorAll("#colorlab-root " + sel)].find((x) => /DEPACOS/.test(x.innerText));
    return c && !c.querySelector(".a8ad-slot");
  }, CARD, { timeout: 10000 });
}

// 1つのボタンを押して、cosme_click がちょうど1回・中身が期待どおりかを見る
async function clickOne(label, btn, want) {
  trace("click " + label);
  const before = (await cosmeEvents(page)).length;
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  clicks++;
  const evs = await cosmeEvents(page);
  const added = evs.slice(before);
  if (added.length !== 1) { check(false, `${label}: cosme_click が1回 (実測 ${added.length}回)`); return; }
  const ev = added[0];
  if (want.item && BRAND_ALIAS[firstWord(want.item)]) (seenAlias[firstWord(want.item)] = seenAlias[firstWord(want.item)] || new Set()).add(ev.brand);
  const keysOk = JSON.stringify(Object.keys(ev).sort()) === JSON.stringify(KEYS);
  const strOk = Object.values(ev).every((v) => typeof v === "string");
  const exp = { event: "cosme_click", app_version: VERSION, ...want };
  const diff = Object.keys(exp).filter((k) => ev[k] !== exp[k]);
  check(keysOk && strOk && diff.length === 0,
    `${label}: cosme_click 1回・${JSON.stringify(ev)}` + (diff.length ? ` (違い: ${diff.map((k) => k + "=" + ev[k] + "≠" + exp[k]).join(", ")})` : "")
    + (keysOk ? "" : " (キーが違う)") + (strOk ? "" : " (文字列でない値がある)"));
}

// カード群の各ボタンを押す。cards は Locator（CosmeCard / DepacosCard のルート）
async function clickCards(prefix, cards, want, slotOf) {
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const name = (await card.locator(".text-sm.font-medium").first().textContent()).trim();
    const links = card.locator("a").filter({ hasText: /^(楽天で見る|Amazonで見る|Qoo10で見る)$/ });
    const m = await links.count();
    if (m === 0) check(false, `${prefix} #${i + 1} ${name}: ボタンが無い`);
    for (let j = 0; j < m; j++) {
      const text = (await links.nth(j).textContent()).trim();
      const w = { ...want(i, name), merchant: MERCHANT[text], slot: String(slotOf(i)) };
      await clickOne(`${prefix} #${i + 1} ${name} 「${text}」`, links.nth(j), w);
    }
  }
  return n;
}

const resultCards = (p) => p.locator("xpath=//h3[normalize-space()='仕上げのコスメはコレ！']/following-sibling::p[1]/following-sibling::div[position()<=3]");
// 今日なに着る？の「仕上げのコスメ」と、試し塗りの「この色味を買うならコレ」「この髪色にするならコレ」の直後のカード
const todayCards = (p) => p.locator("xpath=//div[normalize-space()='仕上げのコスメ']/following-sibling::div[contains(@class,'rounded-2xl') and contains(@class,'p-4') and contains(@class,'mb-3')]");
const tryonCards = (p, head) => p.locator(`xpath=//div[normalize-space()='${head}']/following-sibling::div[contains(@class,'rounded-2xl') and contains(@class,'p-4') and contains(@class,'mb-3')]`);
const domOf = (loc) => loc.evaluateAll((els) => els.map((e) => e.outerHTML).join("\n"));
const screenDom = (p) => p.evaluate(() => document.querySelector("#colorlab-root").innerHTML);

// 分割実行・切り分け用: COSME_ONLY=タイプ名[,タイプ名…] でそのタイプだけ / COSME_TRACE=1 で各段階を出す / COSME_VERBOSE=1 で PASS も出す
//   COSME_ONLY を付けた時の (d) は「押した分の brand が寄せた値か」だけを見て、5表記を押したかは見ない（押した表記を出す）
const ONLY = process.env.COSME_ONLY || "";
const ONLY_SET = new Set(ONLY.split(",").filter(Boolean));
const trace = (m) => { if (process.env.COSME_TRACE) console.log(new Date().toISOString().slice(11, 19) + " " + m); };
const counts = {};
for (const [key, name12] of TYPES12.filter(([, n]) => !ONLY || ONLY_SET.has(n))) {
  trace(name12 + " start");
  const season = +key[0];
  counts[name12] = { result: 0, cosme: 0, set: 0, hair: 0, today: 0, lip: 0, tryhair: 0 };

  // ── 結果画面 ──
  trace("result: fresh");
  await fresh(page, "/__harness.html");
  await toResult(page, key);
  await fresh(basePage, "/__baseline.html");
  await toResult(basePage, key);
  trace("result: compare");
  const rc = resultCards(page);
  check(await rc.count() === 3, `${name12} result: 3枠ある (${await rc.count()})`);
  check(await domOf(rc) === await domOf(resultCards(basePage)), `${name12} result: 3枠の DOM が v1.22.14 と同じ`);
  const names = await rc.evaluateAll((els) => els.map((e) => e.querySelector(".text-sm.font-medium")?.textContent.trim()));
  check(JSON.stringify(names) === JSON.stringify(RESULT3[season].map((x) => x[0])), `${name12} result: 3枠の商品名 ${names.join(" / ")}`);
  counts[name12].result = await clickCards(`${name12} result`, rc.locator(CARD),
    (i, name) => ({ type12: name12, screen: "result", item: RESULT3[season][i][0], brand: RESULT3[season][i][1] }), (i) => i + 1);

  // ── おすすめコスメ（すべて・一式セット）──
  trace("cosme: open");
  await fresh(page, "/__harness.html");
  await toTile(page, "おすすめコスメ", name12);
  await settleDepacos(page);
  await fresh(basePage, "/__baseline.html");
  await toTile(basePage, "おすすめコスメ", name12);
  await settleDepacos(basePage);
  check(await screenDom(page) === await screenDom(basePage), `${name12} cosme(すべて): 画面の DOM が v1.22.14 と同じ`);
  counts[name12].cosme = await clickCards(`${name12} cosme`, page.locator("#colorlab-root " + CARD),
    (i, name) => ({ type12: name12, screen: "cosme", item: name, brand: brandOf(name) }), (i) => i + 1);
  for (const p of [page, basePage]) { await p.getByRole("button", { name: /^一式セット$/ }).click(); await p.waitForTimeout(200); }
  check(await screenDom(page) === await screenDom(basePage), `${name12} cosme(一式セット): 画面の DOM が v1.22.14 と同じ`);
  counts[name12].set = await clickCards(`${name12} cosme(一式セット)`, page.locator("#colorlab-root " + CARD),
    (i, name) => ({ type12: name12, screen: "cosme", item: name, brand: brandOf(name) }), (i) => i + 1);

  // ── おすすめ髪色 ──
  trace("hair: open");
  await fresh(page, "/__harness.html");
  await toTile(page, "おすすめ髪色", name12);
  await fresh(basePage, "/__baseline.html");
  await toTile(basePage, "おすすめ髪色", name12);
  check(await screenDom(page) === await screenDom(basePage), `${name12} hair: 画面の DOM が v1.22.14 と同じ`);
  counts[name12].hair = await clickCards(`${name12} hair`, page.locator("#colorlab-root " + CARD),
    (i, name) => ({ type12: name12, screen: "hair", item: name, brand: brandOf(name) }), (i) => i + 1);
  check(counts[name12].hair > 0, `${name12} hair: 商品がある (${counts[name12].hair})`);

  // ── 今日なに着る？（コーデ提案）の結果「仕上げのコスメ」──
  trace("today: open");
  for (const p of [page, basePage]) {
    await fresh(p, p === page ? "/__harness.html" : "/__baseline.html");
    await toTile(p, "パーソナルカラー別コーデ提案", name12);
    await p.getByRole("button", { name: /コーデを提案してもらう/ }).click();
    await p.waitForSelector("#colorlab-root >> text=仕上げのコスメ", { timeout: 10000 });
  }
  const tc = todayCards(page);
  check(await tc.count() > 0, `${name12} today: 商品がある (${await tc.count()})`);
  check(await domOf(tc) === await domOf(todayCards(basePage)), `${name12} today: 仕上げのコスメの DOM が v1.22.14 と同じ`);
  counts[name12].today = await clickCards(`${name12} today`, tc,
    (i, name) => ({ type12: name12, screen: "today", item: name, brand: brandOf(name) }), (i) => i + 1);

  // ── リップ・髪色 試し塗り（リップ・髪色の両タブ）──
  trace("tryon: open");
  for (const p of [page, basePage]) {
    await fresh(p, p === page ? "/__harness.html" : "/__baseline.html");
    await toTile(p, "リップ・髪色 試し塗り", name12);
  }
  for (const [tab, head, k] of [["リップ", "この色味を買うならコレ", "lip"], ["髪色", "この髪色にするならコレ", "tryhair"]]) {
    for (const p of [page, basePage]) { await p.getByRole("button", { name: new RegExp("^" + tab + "$") }).first().click(); await p.waitForTimeout(200); }
    const yc = tryonCards(page, head);
    check(await yc.count() > 0, `${name12} tryon(${tab}): 商品がある (${await yc.count()})`);
    check(await domOf(yc) === await domOf(tryonCards(basePage, head)), `${name12} tryon(${tab}): 商品の DOM が v1.22.14 と同じ`);
    counts[name12][k] = await clickCards(`${name12} tryon(${tab})`, yc,
      (i, name) => ({ type12: name12, screen: "tryon", item: name, brand: brandOf(name) }), (i) => i + 1);
  }
  const c = counts[name12];
  console.log(`${name12}: result ${c.result} / cosme ${c.cosme} / 一式 ${c.set} / hair ${c.hair} / today ${c.today} / tryon リップ ${c.lip}・髪色 ${c.tryhair} 枚`);
}

// ── (d) brand の表記ゆれ ──
for (const [raw, to] of Object.entries(BRAND_ALIAS)) {
  const got = seenAlias[raw] ? [...seenAlias[raw]] : [];
  if (ONLY && got.length === 0) { console.log(`(d) 「${raw} …」: この回では押していない`); continue; }
  check(got.length === 1 && got[0] === to, `(d) 「${raw} …」の brand は ${to} だけ (実測 ${got.join(",") || "押していない"})`);
  if (ONLY) console.log(`(d) 「${raw} …」: 押した・brand=${got.join(",")}`);
}

// ── (c) 「リップ」で絞り込んだ時の slot ──
{
  const name12 = "クールサマー";
  await fresh(page, "/__harness.html");
  await toTile(page, "おすすめコスメ", name12);
  await page.getByRole("button", { name: /^リップ$/ }).click();
  await page.waitForTimeout(200);
  await settleDepacos(page);
  const n = await clickCards(`${name12} cosme(リップ)`, page.locator("#colorlab-root " + CARD),
    (i, name) => ({ type12: name12, screen: "cosme", item: name, brand: brandOf(name) }), (i) => i + 1);
  const last = (await cosmeEvents(page)).slice(-1)[0] || {};
  check(n >= 2 && last.slot === String(n) && last.merchant === "qoo10", `${name12} cosme(リップ): 末尾の DEPACOS は slot=${n} (${last.slot}/${last.merchant})`);
}

// ── (b) 遷移を止めずに押す: 別タブで開き、開いた先が href と同じ・イベント1回 ──
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const hits = [];
  await blockExternal(ctx2, hits);
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => ng.push("pageerror(遷移): " + e.message));
  const real = async (label, btn) => {
    const href = await btn.getAttribute("href");
    const target = await btn.getAttribute("target");
    const before = (await cosmeEvents(p2)).length;
    hits.length = 0;
    await btn.scrollIntoViewIfNeeded();
    let popup;
    try {
      [popup] = await Promise.all([p2.waitForEvent("popup", { timeout: 15000 }), btn.click()]);
    } catch (e) {
      // 別タブが開かなかった（落ちずに FAIL として残す）
      const n = (await cosmeEvents(p2)).length - before;
      check(false, `(b) ${label}: 別タブが開かない・イベント ${n}回 (${e.message.split("\n")[0]})`);
      return;
    }
    await p2.waitForTimeout(800);
    const opened = hits[0] || popup.url();
    const n = (await cosmeEvents(p2)).length - before;
    check(target === "_blank" && opened === href && n === 1, `(b) ${label}: 別タブ(${target})で href どおりに開く・イベント ${n}回 (${(opened || "").slice(0, 80)})`);
    await popup.close();
  };
  await fresh(p2, "/__harness.html");
  await toResult(p2, "2-4");
  const rc = resultCards(p2).locator(CARD);
  await real("result 1枠目 楽天", rc.nth(0).getByRole("link", { name: "楽天で見る" }));
  await real("result 3枠目 Amazon", rc.nth(2).getByRole("link", { name: "Amazonで見る" }));
  await fresh(p2, "/__harness.html");
  await toTile(p2, "おすすめコスメ", "クールサマー");
  await settleDepacos(p2);
  const cards = p2.locator("#colorlab-root " + CARD);
  await real("cosme 1枚目 楽天", cards.first().getByRole("link", { name: "楽天で見る" }));
  await real("cosme 1枚目 Amazon", cards.first().getByRole("link", { name: "Amazonで見る" }));
  await real("cosme DEPACOS Qoo10", cards.filter({ hasText: "DEPACOS" }).getByRole("link", { name: "Qoo10で見る" }));
  await fresh(p2, "/__harness.html");
  await toTile(p2, "おすすめ髪色", "クールサマー");
  await real("hair 1枚目 楽天", p2.locator("#colorlab-root " + CARD).first().getByRole("link", { name: "楽天で見る" }));
  await ctx2.close();
}

await browser.close();
server.close();

console.log("\nbundle: " + BUNDLE);
console.log("押したボタン: " + clicks + " 回");
if (process.env.COSME_VERBOSE) for (const l of ok) console.log("  [PASS] " + l);
for (const l of ng) console.log("  [FAIL] " + l);
console.log(`\nOK ${ok.length} / NG ${ng.length}`);
console.log(ng.length === 0 ? "ALL PASS" : ng.length + " 件 FAIL");
process.exit(ng.length === 0 ? 0 : 1);
