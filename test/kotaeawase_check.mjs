// 答え合わせキャンペーン（MINE v1）の検収。
//   node test/kotaeawase_check.mjs [バンドルのパス]   （省略時は dist/colorlab.iife.js）
// アプリから workers.dev への通信は page.route で横取りし、本物の worker コード
// （worker/selfcard-worker.js → mine.js）に node:sqlite の D1 をつないで返す。外部通信ゼロ。
import { chromium } from "playwright";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import zlib from "zlib";
import worker from "../worker/selfcard-worker.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "screenshots", "mine");
mkdirSync(SHOTS, { recursive: true });
const BUNDLE = resolve(process.argv[2] || join(HERE, "../dist/colorlab.iife.js"));
const ENDPOINT = "https://colorlab-selfcard.the-company-20220901.workers.dev";
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? "  OK  " : "  NG  ") + n); };

// ── test/screenshot.mjs と同じ合成写真（イエベ春・2nd ブルベ夏・信頼度high）──
function crc32(buf) { let c, t = crc32.t || (crc32.t = (() => { const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })()); let crc = 0xffffffff; for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function regionPng(W, H, base, rects) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const box = rects.map(([x0, y0, x1, y1, c]) => [Math.floor(x0 * W), Math.floor(y0 * H), Math.floor(x1 * W), Math.floor(y1 * H), c]);
  const raw = Buffer.alloc(H * (W * 3 + 1)); let o = 0;
  for (let y = 0; y < H; y++) { raw[o++] = 0; for (let x = 0; x < W; x++) { let c = base; for (const [x0, y0, x1, y1, col] of box) if (x >= x0 && x < x1 && y >= y0 && y < y1) c = col; raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PHOTO_OK = regionPng(600, 800, [190, 190, 195], [
  [0.40, 0.06, 0.60, 0.16, [62, 46, 38]], [0.24, 0.46, 0.36, 0.58, [233, 194, 168]],
  [0.64, 0.46, 0.76, 0.58, [233, 194, 168]], [0.34, 0.76, 0.66, 0.92, [235, 232, 228]],
]);

// ── 本物の worker を D1 代用でつなぐ ──
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(HERE, "../worker/schema.sql"), "utf8"));
const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, b), first: async () => db.prepare(sql).get(...a) ?? null, all: async () => ({ results: db.prepare(sql).all(...a) }), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...a).changes) } }) });
const kvm = new Map();
const env = { DB: { prepare: (s) => stmt(s) }, SELFCARD_KV: { get: async (k) => kvm.get(k) ?? null, put: async (k, v) => { kvm.set(k, v); } }, KOTAE_CAMPAIGN: "kotae2026" };
const posted = [];
async function routeWorker(route) {
  const r = route.request();
  const u = new URL(r.url());
  if (u.pathname.startsWith("/campaign/answer")) posted.push(JSON.parse(r.postData() || "{}"));
  const h = new Headers({ Origin: "https://www.blubel.jp", "CF-Connecting-IP": "203.0.113.7" });
  if (r.method() === "POST") h.set("Content-Type", "application/json");
  const res = await worker.fetch(new Request(u.toString(), { method: r.method(), headers: h, body: r.method() === "POST" ? r.postData() : undefined }), env);
  await route.fulfill({ status: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: await res.text() });
}

// ── ハーネス（本番と同じく、先にスクリプト → 本文の div を自動マウント）──
const lpBody = readFileSync(join(HERE, "../lp/kotaeawase_lp.html"), "utf8");
const harness = (name, body) => {
  const p = join(tmpdir(), `_kotae_${name}.html`);
  writeFileSync(p, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="${pathToFileURL(BUNDLE).href}" defer></script></head><body style="margin:0;background:#fff">${body}</body></html>`);
  return pathToFileURL(p).href;
};
const LP = harness("lp", lpBody);
const PLAIN = harness("plain", `<div id="colorlab-root">アプリを読み込み中…</div>`);

console.log("■ 名前・色が本体の TYPES と一致");
{
  const src = readFileSync(join(HERE, "../src/color_lab_stylist_v23.jsx"), "utf8");
  const ksrc = readFileSync(join(HERE, "../src/kotaeawase.jsx"), "utf8");
  const SEASON = Object.fromEntries([...ksrc.matchAll(/\n  (spring|summer|autumn|winter): \{ name: "([^"]+)", accent: "(#[0-9A-Fa-f]+)" \}/g)].map((m) => [m[1], { name: m[2], accent: m[3] }]));
  check("kotaeawase.jsx の SEASON が4つ読める", Object.keys(SEASON).length === 4);
  for (const k of Object.keys(SEASON)) {
    const m = src.match(new RegExp(`\\n  ${k}: \\{ key: "${k}", num: \\d, name: "([^"]+)"[^\\n]*?accent: "(#[0-9A-Fa-f]+)"`));
    check(`${k}: 名前 ${SEASON[k].name} / accent ${SEASON[k].accent} が TYPES と同じ`, !!m && m[1] === SEASON[k].name && m[2] === SEASON[k].accent);
  }
}

console.log("■ LP（Fulmo 貼り付け用 HTML）の機械ゲート");
{
  check("LP に script タグが無い", !/<script/i.test(lpBody));
  check("LP に外部 URL（http/https）の読み込みが無い", !/(src|href)\s*=\s*"https?:/i.test(lpBody) && !/@import|url\(\s*["']?https?:/i.test(lpBody));
  const css = lpBody.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const sels = [...css.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(",").map((s) => s.trim())).filter(Boolean);
  check(`CSS のセレクタ ${sels.length} 個がすべて .kt 配下`, sels.every((s) => s.startsWith(".kt")));
  check("サイト内リンクは相対パス・target なし", /<a href="\/pages\/personalcolor">/.test(lpBody) && !/target=/.test(lpBody));
  check("アプリと集計のマウント先がある", lpBody.includes('id="colorlab-root" data-mode="kotaeawase"') && lpBody.includes('id="colorlab-kotae-stats"'));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
await ctx.route(ENDPOINT + "/**", routeWorker);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

console.log("■ 通常ページは今までどおり（キャンペーン画面を出さない）");
{
  await page.goto(PLAIN, { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=写真で診断", { timeout: 15000 });
  const t = await page.locator("#colorlab-root").innerText();
  check("ホーム画面（写真で診断タイル）が出る", /写真＋質問で12タイプ診断/.test(t));
  check("答え合わせの入力画面は出ない", !/答え合わせ/.test(t));
}

async function runPhoto() {
  const boxes = page.locator("#colorlab-root input[type=checkbox]");
  await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: /^地毛に近い$/ }).click();
  await page.getByRole("button", { name: /撮影にすすむ/ }).click();
  await page.waitForSelector("#colorlab-root >> text=カメラを起動する", { timeout: 5000 });
  await page.getByRole("button", { name: /カメラを起動する/ }).click();
  await page.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  await page.locator("#colorlab-root input[type=file]").setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: PHOTO_OK });
}

console.log("■ LP：入力 → 写真で診断 → 一致");
{
  await page.goto(LP, { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 15000 });
  await page.waitForSelector("#colorlab-kotae-stats >> text=まだ回答がありません", { timeout: 10000 });
  check("LP の集計欄が単独でマウントされる（0件表示）", true);
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check("390px 幅で横スクロールが出ない", noScroll);
  await page.screenshot({ path: join(SHOTS, "k01_lp_top.png"), fullPage: true });

  const start = page.getByRole("button", { name: /結果の選択と確認をしてください/ });
  check("未入力のうちは開始ボタンが無効", await start.isDisabled());
  await page.locator("#colorlab-root").getByRole("button", { name: "イエベ春", exact: true }).first().click();
  check("1st だけ選んでも確認チェック前は無効", await page.getByRole("button", { name: /結果の選択と確認をしてください/ }).isDisabled());
  // 2nd の並びは「言われていない / 1st 以外の3つ」。ブルベ夏は 2nd 側の1つ目
  const secondBtns = page.locator("#colorlab-root button[aria-pressed]");
  const labels = await secondBtns.allInnerTexts();
  check("2nd の選択肢から 1st（イエベ春）が外れる", labels.filter((l) => l === "イエベ春").length === 1 && labels.includes("言われていない"));
  await secondBtns.nth(5).click(); // 1st の4つ + 言われていない の次 = ブルベ夏
  await page.locator("#colorlab-root input[type=checkbox]").check();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, "k02_input_filled.png"), fullPage: true });
  await page.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();

  await runPhoto();
  await page.waitForSelector("#colorlab-root >> text=一致！", { timeout: 15000 });
  await page.waitForSelector("#colorlab-root >> text=みんなの答え合わせ", { timeout: 10000 });
  const t = await page.locator("#colorlab-root").innerText();
  check("アプリの結果は既存エンジンの判定（イエベ春 / 2nd ブルベ夏）", /アプリ（写真で診断）\s*イエベ春\s*2nd：ブルベ夏/.test(t));
  check("2nd まで一致と表示", /2nd まで一致です/.test(t));
  check("通常の結果ページ（タイプです！）には行かない", !/タイプです！/.test(t));
  check("送信内容はタイプ名だけ（写真なし）", posted.length === 1 && Object.keys(posted[0]).sort().join() === "app_first,app_second,campaign,device_id,pro_first,pro_second,site" && posted[0].pro_first === "spring" && posted[0].pro_second === "summer" && posted[0].app_first === "spring");
  check("集計は 1件・1st 一致率 100%", /100%/.test(t) && /1 \/ 1 人/.test(t));
  const cells = await page.locator("#colorlab-root table tbody td").count();
  check("集計表は 4行 x (見出し+4列) = 20セル", cells === 20);
  await page.waitForSelector("#colorlab-kotae-stats >> text=1 / 1 人", { timeout: 3000 }).catch(() => {});
  check("LP の集計欄も回答直後に 1件へ更新（30秒待たない）", /1 \/ 1 人/.test(await page.locator("#colorlab-kotae-stats").innerText()));
  await page.waitForTimeout(800); // fade-up（0.5秒）が終わってから撮る
  await page.screenshot({ path: join(SHOTS, "k03_result_match.png"), fullPage: true });

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /ストーリー用の画像を保存/ }).click()]);
  const png = join(SHOTS, "k04_story_match.png");
  await dl.saveAs(png);
  const buf = readFileSync(png);
  check("ストーリー画像は 1080x1920 の PNG", buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1920);
}

console.log("■ 同じ端末の2回目（不一致）は集計に入れない");
{
  await page.getByRole("button", { name: /プロ診断の入力に戻る/ }).click();
  await page.locator("#colorlab-root").getByRole("button", { name: "ブルベ冬", exact: true }).first().click();
  await page.locator("#colorlab-root input[type=checkbox]").check();
  await page.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  await runPhoto();
  await page.waitForSelector("#colorlab-root >> text=ちがった！", { timeout: 15000 });
  await page.waitForSelector("#colorlab-root >> text=記録済み", { timeout: 10000 });
  const t = await page.locator("#colorlab-root").innerText();
  check("不一致の表示（プロ ブルベ冬 / アプリ イエベ春）", /プロ診断\s*ブルベ冬/.test(t) && /1st（いちばん似合うシーズン）が違いました/.test(t));
  check("「記録済み」の注記が出て、集計は 1件のまま", /記録済み/.test(t) && /1 \/ 1 人/.test(t));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, "k05_result_mismatch_second_try.png"), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /ストーリー用の画像を保存/ }).click()]);
  await dl.saveAs(join(SHOTS, "k06_story_mismatch.png"));
}

console.log("■ 別の端末の不一致は集計に入り、外れも表に残る");
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx2.route(ENDPOINT + "/**", routeWorker);
  const p2 = await ctx2.newPage();
  await p2.goto(LP, { waitUntil: "load" });
  await p2.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 15000 });
  await p2.locator("#colorlab-root").getByRole("button", { name: "ブルベ夏", exact: true }).first().click();
  await p2.locator("#colorlab-root input[type=checkbox]").check();
  await p2.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  const boxes = p2.locator("#colorlab-root input[type=checkbox]");
  await p2.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
  await p2.getByRole("button", { name: /^地毛に近い$/ }).click();
  await p2.getByRole("button", { name: /撮影にすすむ/ }).click();
  await p2.getByRole("button", { name: /カメラを起動する/ }).click();
  await p2.waitForSelector("#colorlab-root >> text=写真を選ぶ", { timeout: 10000 });
  await p2.locator("#colorlab-root input[type=file]").setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: PHOTO_OK });
  await p2.waitForSelector("#colorlab-root >> text=ちがった！", { timeout: 15000 });
  await p2.waitForSelector("#colorlab-root >> text=1 / 2 人", { timeout: 10000 });
  const cell = await p2.locator("#colorlab-root table tbody tr").nth(1).locator("td").nth(1).innerText();
  check("2件目で 1st 一致率 50%（1/2）", /50%/.test(await p2.locator("#colorlab-root").innerText()));
  check("外れ（プロ ブルベ夏 → アプリ イエベ春）のセルが 1", cell.trim() === "1");
  // LP の集計欄（30秒ごと更新）を読み直して同じ数字になること
  await p2.reload({ waitUntil: "load" });
  await p2.waitForSelector("#colorlab-kotae-stats >> text=1 / 2 人", { timeout: 10000 });
  check("LP の集計欄にも反映（1 / 2 人）", true);
  await p2.locator("#colorlab-kotae-stats").screenshot({ path: join(SHOTS, "k07_lp_stats_after_2.png") });
  await ctx2.close();
}

console.log("■ GTM を変えない入口（/pages/personalcolor?campaign=kotaeawase 相当）");
{
  await page.goto(PLAIN + "?campaign=kotaeawase", { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 15000 });
  check("?campaign=kotaeawase で答え合わせの入力画面から始まる", true);
  await page.getByRole("button", { name: "イエベ秋", exact: true }).first().click();
  await page.locator("#colorlab-root input[type=checkbox]").check();
  await page.getByRole("button", { name: /写真で診断して答え合わせする/ }).click();
  await page.waitForSelector("#colorlab-root >> text=撮影条件（すべて必要です）", { timeout: 5000 });
  await page.locator("#colorlab-root button").first().click(); // ヘッダーの戻る
  await page.waitForSelector("#colorlab-root >> text=プロ診断の結果（1st）", { timeout: 5000 });
  check("写真画面の「戻る」はホームではなく答え合わせの入力へ戻る", true);
}

check("ページ内の JS エラー 0件", errors.length === 0);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
