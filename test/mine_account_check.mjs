// MINE 会員画面（ログイン・EC購入者申請）と承認画面（/admin）の検収。
//   node test/mine_account_check.mjs [バンドルのパス]   （省略時は dist/colorlab.iife.js）
// アプリと承認画面から Worker への通信は page.route で横取りし、本物の worker コードに
// node:sqlite の D1 をつないで返す。メールは送らず、送るはずだった本文からリンクを拾う。外部通信ゼロ。
import { chromium } from "playwright";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join, resolve } from "path";
import { tmpdir } from "os";
import zlib from "zlib";
import worker from "../worker/selfcard-worker.js";
import { MAIL_SENDERS } from "../worker/mine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "screenshots", "mine");
mkdirSync(SHOTS, { recursive: true });
const BUNDLE = resolve(process.argv[2] || join(HERE, "../dist/colorlab.iife.js"));
const ENDPOINT = "https://colorlab-selfcard.the-company-20220901.workers.dev";
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log((ok ? "  OK  " : "  NG  ") + n); };

// ── 購入完了メールのスクショ代わりの PNG（1170x2532 = iPhone の画面サイズ）──
function crc32(buf) { let c, t = crc32.t || (crc32.t = (() => { const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })()); let crc = 0xffffffff; for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function stripesPng(W, H) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(H * (W * 3 + 1)); let o = 0;
  for (let y = 0; y < H; y++) { raw[o++] = 0; const line = (y % 120) < 40 && y > 200; for (let x = 0; x < W; x++) { const v = y < 200 ? [125, 46, 70] : line && x > 80 && x < W - 80 ? [200, 200, 205] : [255, 255, 255]; raw[o++] = v[0]; raw[o++] = v[1]; raw[o++] = v[2]; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const SHOT_PNG = stripesPng(1170, 2532);

// ── 本物の worker を D1 代用でつなぐ ──
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(HERE, "../worker/schema.sql"), "utf8"));
const conv = (a) => a.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v));
const stmt = (sql, a = []) => ({ bind: (...b) => stmt(sql, conv(b)), first: async () => db.prepare(sql).get(...a) ?? null, all: async () => ({ results: db.prepare(sql).all(...a) }), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...a).changes) } }) });
const kvm = new Map();
const outbox = [];
MAIL_SENDERS.test = async (e, msg) => { outbox.push(msg); };
const ADMIN_TOKEN = "admin-test-token-" + "x".repeat(24);
const env = { DB: { prepare: (s) => stmt(s) }, SELFCARD_KV: { get: async (k) => kvm.get(k) ?? null, put: async (k, v) => { kvm.set(k, v); } }, MAIL_PROVIDER: "test", ADMIN_TOKEN };

async function routeWorker(route) {
  const r = route.request();
  const h = new Headers();
  for (const [k, v] of Object.entries(await r.allHeaders())) if (!/^(origin|host|content-length)$/i.test(k)) h.set(k, v);
  h.set("Origin", "https://www.blubel.jp");   // file:// の検証ページは Origin が null になるため本番の値に置き換える
  h.set("CF-Connecting-IP", "203.0.113.9");
  const body = ["GET", "HEAD"].includes(r.method()) ? undefined : r.postDataBuffer();
  const res = await worker.fetch(new Request(r.url(), { method: r.method(), headers: h, body }), env);
  const headers = Object.fromEntries(res.headers.entries());
  headers["Access-Control-Allow-Origin"] = "*";
  await route.fulfill({ status: res.status, headers, body: Buffer.from(await res.arrayBuffer()) });
}

const harness = (name, body) => {
  const p = join(tmpdir(), `_mine_${name}.html`);
  writeFileSync(p, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="${pathToFileURL(BUNDLE).href}" defer></script></head><body style="margin:0;background:#fff">${body}</body></html>`);
  return pathToFileURL(p).href;
};
const PLAIN = harness("plain", `<div id="colorlab-root">アプリを読み込み中…</div>`);
const shotFile = join(tmpdir(), "_mine_order_mail.png");
writeFileSync(shotFile, SHOT_PNG);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route(ENDPOINT + "/**", routeWorker);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const root = () => page.locator("#colorlab-root").innerText();
const settle = () => page.waitForTimeout(700);

console.log("■ 通常ページは今までどおり");
{
  await page.goto(PLAIN, { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=写真で診断", { timeout: 15000 });
  check("?mine が無ければホーム画面（会員画面は出ない）", !/会員ページ/.test(await root()));
}

console.log("■ ログイン（マジックリンク）");
let link;
{
  await page.goto(PLAIN + "?mine=account", { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=ログイン用のメールを送る", { timeout: 15000 });
  check("?mine=account で会員ページ（ログイン）が開く", /会員ページ/.test(await root()));
  check("アドレス未入力では送信ボタンが無効", await page.getByRole("button", { name: /ログイン用のメールを送る/ }).isDisabled());
  await settle();
  await page.screenshot({ path: join(SHOTS, "m01_login.png"), fullPage: true });
  await page.getByLabel("メールアドレス").fill("hanako@example.com");
  await page.getByRole("button", { name: /ログイン用のメールを送る/ }).click();
  await page.waitForSelector("#colorlab-root >> text=ログイン用のメールを送りました", { timeout: 10000 });
  check("送信後に「メールを送りました」", outbox.length === 1 && outbox[0].to === "hanako@example.com");
  await page.screenshot({ path: join(SHOTS, "m02_mail_sent.png"), fullPage: true });
  link = outbox[0].text.match(/https:\/\/\S+/)[0];
  check("リンクは /pages/personalcolor?mine_token=…", /^https:\/\/www\.blubel\.jp\/pages\/personalcolor\?mine_token=[A-Za-z0-9_-]+$/.test(link));
}

console.log("■ リンクを開く → 会員画面・EC購入者の申請");
{
  const token = link.split("mine_token=")[1];
  await page.goto(PLAIN + "?mine_token=" + token, { waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=ログイン中", { timeout: 15000 });
  const t = await root();
  check("ログイン状態になり、アドレスと「未加入」が出る", /hanako@example\.com/.test(t) && /未加入/.test(t));
  check("URL から mine_token が消え、mine=account に置き換わる（再読み込みしても会員ページ）", !/mine_token/.test(page.url()) && /[?&]mine=account/.test(page.url()));
  check("申請フォームが出る（スクショ必須のため送信ボタンは無効）", /BLUBEL \/ IEBEL でお買い物いただいた方へ/.test(t) && await page.getByRole("button", { name: /^申請する$/ }).isDisabled());
  await settle();
  await page.screenshot({ path: join(SHOTS, "m03_account_form.png"), fullPage: true });

  await page.getByLabel("IEBEL").check();
  await page.locator("#mine-shot").setInputFiles(shotFile);
  await page.getByLabel("注文番号（わかれば）").fill("IB-20260915-0042");
  await page.getByLabel("注文時のメールアドレス（ログイン用と違う場合だけ）").fill("hanako.shop@example.com");
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, "m04_account_form_filled.png"), fullPage: true });
  await page.getByRole("button", { name: /^申請する$/ }).click();
  await page.waitForSelector("#colorlab-root >> text=無料会員の申請：確認中です", { timeout: 15000 });
  check("申請後は「確認中」表示", true);
  const row = db.prepare("SELECT site, order_email, order_number, image, image_type FROM ec_applications").get();
  const img = row.image;
  // JPEG の SOF0/SOF2 から縦横を読む
  let w = 0, hgt = 0;
  for (let i = 2; i < img.length - 9; i++) if (img[i] === 0xff && (img[i + 1] === 0xc0 || img[i + 1] === 0xc2)) { hgt = img[i + 5] * 256 + img[i + 6]; w = img[i + 7] * 256 + img[i + 8]; break; }
  check(`送られた画像は長辺1600pxの JPEG（${w}x${hgt}・${img.length} bytes）`, row.image_type === "image/jpeg" && Math.max(w, hgt) === 1600 && img.length <= 1_400_000);
  check("申請内容（IEBEL・注文番号・注文時メール）が保存される", row.site === "iebel" && row.order_number === "IB-20260915-0042" && row.order_email === "hanako.shop@example.com");
  await settle();
  await page.screenshot({ path: join(SHOTS, "m05_account_pending.png"), fullPage: true });
}

console.log("■ 承認画面（/admin）で却下 → 再申請 → 承認");
{
  const ctxA = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctxA.route(ENDPOINT + "/**", routeWorker);
  const admin = await ctxA.newPage();
  admin.on("pageerror", (e) => errors.push("admin: " + String(e)));
  admin.on("dialog", (d) => d.accept());
  await admin.goto(ENDPOINT + "/admin", { waitUntil: "load" });
  await admin.getByLabel("管理用トークン").fill("wrong-token");
  await admin.getByRole("button", { name: "開く" }).click();
  await admin.waitForSelector("text=トークンが違います", { timeout: 10000 });
  check("トークン違いは入れない", true);
  await admin.getByLabel("管理用トークン").fill(ADMIN_TOKEN);
  await admin.getByRole("button", { name: "開く" }).click();
  await admin.waitForSelector("text=申請 #1（IEBEL）", { timeout: 10000 });
  await admin.waitForFunction(() => { const i = document.querySelector("img.shot"); return i && i.naturalWidth > 0; }, null, { timeout: 10000 });
  const at = await admin.locator("main").innerText();
  check("確認待ちに申請が出る（ログイン用・注文時メール・注文番号・スクショ）", /hanako@example\.com/.test(at) && /hanako\.shop@example\.com/.test(at) && /IB-20260915-0042/.test(at));
  await admin.screenshot({ path: join(SHOTS, "a01_admin_pending.png"), fullPage: true });

  await admin.getByRole("button", { name: "却下する" }).click();
  await admin.waitForSelector("text=却下の理由を入力してください", { timeout: 5000 });
  check("理由なしでは却下できない", true);
  await admin.getByLabel("却下の理由").fill("スクリーンショットから注文番号が読み取れませんでした。注文番号が写るように撮り直してください。");
  await admin.getByRole("button", { name: "却下する" }).click();
  await admin.waitForSelector("text=該当する申請はありません", { timeout: 10000 });
  check("却下すると確認待ちから消える", true);
  await admin.getByRole("tab", { name: "却下" }).click();
  await admin.waitForSelector("text=スクショは判断後に削除済み", { timeout: 10000 });
  check("却下タブに移り、スクショは削除済み", db.prepare("SELECT image FROM ec_applications WHERE id = 1").get().image === null);
  await admin.screenshot({ path: join(SHOTS, "a02_admin_rejected_tab.png"), fullPage: true });

  // 申請者側: 却下理由が見え、申請し直せる
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=前回の申請は確認できませんでした", { timeout: 15000 });
  check("申請者に却下理由が見える", /注文番号が読み取れませんでした/.test(await root()));
  await settle();
  await page.screenshot({ path: join(SHOTS, "m06_account_rejected.png"), fullPage: true });
  await page.locator("#mine-shot").setInputFiles(shotFile);
  await page.getByLabel("注文番号（わかれば）").fill("IB-20260915-0042");
  await page.getByRole("button", { name: /^申請する$/ }).click();
  await page.waitForSelector("#colorlab-root >> text=無料会員の申請：確認中です", { timeout: 15000 });

  await admin.getByRole("tab", { name: "確認待ち" }).click();
  await admin.waitForSelector("text=申請 #2（BLUBEL）", { timeout: 10000 }).catch(async () => { await admin.waitForSelector("text=申請 #2", { timeout: 5000 }); });
  await admin.getByRole("button", { name: "承認する" }).click();
  await admin.waitForSelector("text=該当する申請はありません", { timeout: 10000 });
  await admin.getByRole("tab", { name: "承認済み" }).click();
  await admin.waitForSelector("text=申請 #2", { timeout: 10000 });
  check("承認済みタブに出る", true);
  await admin.screenshot({ path: join(SHOTS, "a03_admin_approved_tab.png"), fullPage: true });
  await ctxA.close();

  await page.reload({ waitUntil: "load" });
  await page.waitForSelector("#colorlab-root >> text=ログイン中", { timeout: 15000 });
  const t = await root();
  check("承認後は「無料会員（EC購入者）」になり申請フォームが消える", /無料会員（BLUBEL \/ IEBEL でお買い物いただいた方）/.test(t) && !/申請する/.test(t));
  await settle();
  await page.screenshot({ path: join(SHOTS, "m07_account_ec_free.png"), fullPage: true });
}

console.log("■ ログアウト");
{
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.waitForSelector("#colorlab-root >> text=ログイン用のメールを送る", { timeout: 10000 });
  check("ログアウトでログイン画面に戻り、保存したセッションも消える", (await page.evaluate(() => localStorage.getItem("colorlab-mine-session"))) === null);
  check("サーバ側のセッションも消える", db.prepare("SELECT COUNT(*) n FROM sessions").get().n === 0);
}

check("ページ内の JS エラー 0件", errors.length === 0);
if (errors.length) console.log(errors.join("\n"));
await browser.close();
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
