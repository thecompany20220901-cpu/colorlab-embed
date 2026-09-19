// MINE v1（worker/mine.js）の検収。D1 は node:sqlite、Stripe は fetch の差し替えで代用し、
// 本物の Stripe / メール / Cloudflare には一切つながない（課金ゼロ・送信ゼロ）。
//   node test/mine_worker_check.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createHmac } from "crypto";
import worker from "../worker/selfcard-worker.js";
import { MAIL_SENDERS, verifyStripeSignature } from "../worker/mine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let fail = 0, pass = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? "  OK  " : "  NG  ") + name); };

// ── D1 の代用（prepare/bind/first/all/run だけ） ──
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(HERE, "../worker/schema.sql"), "utf8"));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}
function kv() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, _m: m };
}

const env = {
  DB: d1(), SELFCARD_KV: kv(),
  STRIPE_SECRET_KEY: "sk_test_dummy", STRIPE_WEBHOOK_SECRET: "whsec_dummy",
  STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_YEARLY: "price_year",
  MAIL_PROVIDER: "", KOTAE_CAMPAIGN: "kotae_test",
};

// ── Stripe の代用 ──
const stripeState = { prices: {
  price_month: { id: "price_month", active: true, currency: "jpy", unit_amount: 480, recurring: { interval: "month", interval_count: 1 } },
  price_year: { id: "price_year", active: true, currency: "jpy", unit_amount: 3980, recurring: { interval: "year", interval_count: 1 } },
}, subs: {}, calls: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api.stripe.com/")) throw new Error("外部通信は禁止: " + u);
  stripeState.calls.push((init.method || "GET") + " " + u.replace("https://api.stripe.com/v1/", ""));
  const res = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
  let m;
  if ((m = u.match(/\/v1\/prices\/(.+)$/))) return stripeState.prices[m[1]] ? res(stripeState.prices[m[1]]) : res({}, 404);
  if (u.endsWith("/v1/customers")) return res({ id: "cus_1" });
  if (u.endsWith("/v1/checkout/sessions")) { stripeState.lastCheckoutBody = init.body; return res({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" }); }
  if ((m = u.match(/\/v1\/subscriptions\/(.+)$/))) return stripeState.subs[m[1]] ? res(stripeState.subs[m[1]]) : res({}, 404);
  return res({}, 404);
};

const O = "https://www.blubel.jp";
const call = async (method, path, { body, headers = {}, origin = O, raw } = {}) => {
  const h = new Headers(headers);
  if (origin) h.set("Origin", origin);
  if (body !== undefined) h.set("Content-Type", "application/json");
  const r = await worker.fetch(new Request("https://w.example" + path, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined }), env);
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, j, headers: r.headers };
};

console.log("■ 既存経路は変わらない");
{
  const q = await call("GET", "/quota");
  check("GET /quota は従来どおり 200 + remaining", q.status === 200 && q.j.remaining === 50);
  const p = await call("POST", "/illustrate", { origin: "https://example.com", raw: "x" });
  check("POST /illustrate（許可外オリジン）は従来どおり 403 forbidden_origin", p.status === 403 && p.j.reason === "forbidden_origin");
}

console.log("■ マジックリンク");
{
  const r0 = await call("POST", "/auth/request", { body: { email: "a@example.com" } });
  check("送信サービス未設定なら 503 mail_not_configured（黙って成功にしない）", r0.status === 503 && r0.j.reason === "mail_not_configured");
  const r1 = await call("POST", "/auth/request", { body: { email: "a@example.com" }, origin: "https://evil.example" });
  check("許可外オリジンは 403", r1.status === 403);

  const outbox = [];
  MAIL_SENDERS.test = async (e, msg) => { outbox.push(msg); };
  env.MAIL_PROVIDER = "test";
  const r2 = await call("POST", "/auth/request", { body: { email: "  A@Example.com ", return_path: "/pages/kotaeawase" } });
  check("メール送信 → 200", r2.status === 200 && outbox.length === 1);
  const link = outbox[0].text.match(/https:\/\/\S+/)[0];
  check("リンクは依頼元オリジン + 指定ページ", link.startsWith("https://www.blubel.jp/pages/kotaeawase?mine_token="));
  const bad = await call("POST", "/auth/request", { body: { email: "b@example.com", return_path: "//evil.example/x" } });
  check("外部への戻り先は既定ページに差し替わる", bad.status === 200 && outbox[1].text.includes("https://www.blubel.jp/pages/personalcolor?mine_token="));
  const r3 = await call("POST", "/auth/request", { body: { email: "a@example.com" } });
  check("60秒以内の再送は 429 too_soon", r3.status === 429);
  const row = env.DB.raw.prepare("SELECT * FROM users WHERE email = ?").get("a@example.com");
  const token = link.split("mine_token=")[1];
  check("メールは正規化して1行で保存", !!row && env.DB.raw.prepare("SELECT COUNT(*) n FROM users WHERE email LIKE '%xample.com'").get().n === 2);
  check("DB にはトークンの生値を保存しない（SHA-256 のみ）", row.magic_link_token !== token && /^[0-9a-f]{64}$/.test(row.magic_link_token));

  const v1 = await call("POST", "/auth/verify", { body: { token } });
  check("検証 → セッション発行", v1.status === 200 && v1.j.session && v1.j.user.plan === "none");
  const v2 = await call("POST", "/auth/verify", { body: { token } });
  check("同じリンクは2回使えない", v2.status === 401);
  env.session = v1.j.session;

  // 期限切れ
  const outbox2 = outbox.length;
  env.SELFCARD_KV._m.clear();
  await call("POST", "/auth/request", { body: { email: "c@example.com" } });
  const t2 = outbox[outbox2].text.match(/mine_token=(\S+)/)[1];
  env.DB.raw.prepare("UPDATE users SET token_expires_at = 1 WHERE email = 'c@example.com'").run();
  const v3 = await call("POST", "/auth/verify", { body: { token: t2 } });
  check("期限切れリンクは 401", v3.status === 401);

  const me = await call("GET", "/me", { headers: { Authorization: "Bearer " + env.session } });
  check("GET /me でログイン中の会員が返る", me.status === 200 && me.j.user.email === "a@example.com");
  const me0 = await call("GET", "/me", { headers: { Authorization: "Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxx" } });
  check("不正なセッションは 401", me0.status === 401);
}

console.log("■ Checkout");
{
  const auth = { Authorization: "Bearer " + env.session };
  stripeState.prices.price_month.unit_amount = 4800;
  const bad = await call("POST", "/billing/checkout", { body: { interval: "month" }, headers: auth });
  check("Price の金額が ¥480 でなければ作らない（price_mismatch）", bad.status === 500 && bad.j.reason === "price_mismatch");
  check("金額不一致のときは顧客もセッションも作っていない", !stripeState.calls.some((c) => /customers|checkout/.test(c)));
  stripeState.prices.price_month.unit_amount = 480;
  const ok = await call("POST", "/billing/checkout", { body: { interval: "month", return_path: "/pages/personalcolor" }, headers: auth });
  check("月額 ¥480 → Checkout URL が返る", ok.status === 200 && ok.j.url.startsWith("https://checkout.stripe.com/"));
  const body = decodeURIComponent(stripeState.lastCheckoutBody);
  check("Checkout は subscription・price_month・顧客ID付き", /mode=subscription/.test(body) && /line_items\[0\]\[price\]=price_month/.test(body) && /customer=cus_1/.test(body));
  check("戻り先は依頼元サイト", /success_url=https:\/\/www\.blubel\.jp\/pages\/personalcolor\?mine_checkout=success/.test(body));
  const yr = await call("POST", "/billing/checkout", { body: { interval: "year" }, headers: auth });
  check("年払い ¥3,980 も作れる", yr.status === 200);
  const bi = await call("POST", "/billing/checkout", { body: { interval: "week" }, headers: auth });
  check("未知のプランは 400", bi.status === 400);
  const na = await call("POST", "/billing/checkout", { body: { interval: "month" } });
  check("未ログインは 401", na.status === 401);
}

console.log("■ Webhook");
{
  const sign = (payload, t = Math.floor(Date.now() / 1000), secret = env.STRIPE_WEBHOOK_SECRET) =>
    `t=${t},v1=${createHmac("sha256", secret).update(t + "." + payload).digest("hex")}`;
  const ev = { id: "evt_1", type: "customer.subscription.created", data: { object: { id: "sub_1", customer: "cus_1", status: "incomplete" } } };
  const payload = JSON.stringify(ev);
  const w0 = await call("POST", "/stripe/webhook", { raw: payload, origin: null, headers: { "Stripe-Signature": sign(payload, undefined, "whsec_wrong") } });
  check("署名が違えば 400", w0.status === 400);
  const old = await call("POST", "/stripe/webhook", { raw: payload, origin: null, headers: { "Stripe-Signature": sign(payload, Math.floor(Date.now() / 1000) - 3600) } });
  check("古いタイムスタンプ（1時間前）は 400", old.status === 400);

  // イベント本文は incomplete だが、取り直した最新状態は active（順不同の到着を想定）
  stripeState.subs.sub_1 = { id: "sub_1", customer: "cus_1", status: "active" };
  const w1 = await call("POST", "/stripe/webhook", { raw: payload, origin: null, headers: { "Stripe-Signature": sign(payload) } });
  check("正しい署名 → 200", w1.status === 200 && w1.j.ok);
  const me = await call("GET", "/me", { headers: { Authorization: "Bearer " + env.session } });
  check("購読の最新状態を取り直して paid になる", me.j.user.plan === "paid" && me.j.user.subscription_status === "active");
  const w2 = await call("POST", "/stripe/webhook", { raw: payload, origin: null, headers: { "Stripe-Signature": sign(payload) } });
  check("同じイベントの再送は二重処理しない", w2.status === 200 && w2.j.duplicate === true);
  const again = await call("POST", "/billing/checkout", { body: { interval: "month" }, headers: { Authorization: "Bearer " + env.session } });
  check("購読中は Checkout を作らない（409 already_active）", again.status === 409);

  delete stripeState.subs.sub_1;
  const del = { id: "evt_2", type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } } };
  const p2 = JSON.stringify(del);
  await call("POST", "/stripe/webhook", { raw: p2, origin: null, headers: { "Stripe-Signature": sign(p2) } });
  const me2 = await call("GET", "/me", { headers: { Authorization: "Bearer " + env.session } });
  check("解約 → plan none", me2.j.user.plan === "none" && me2.j.user.subscription_status === "canceled");

  env.DB.raw.prepare("UPDATE users SET is_ec_purchaser = 1 WHERE email = 'a@example.com'").run();
  const me3 = await call("GET", "/me", { headers: { Authorization: "Bearer " + env.session } });
  check("EC購入者は購読なしでも ec_free", me3.j.user.plan === "ec_free");
  const ec = await call("POST", "/billing/checkout", { body: { interval: "month" }, headers: { Authorization: "Bearer " + env.session } });
  check("EC購入者には Checkout を作らない（409 ec_free）", ec.status === 409 && ec.j.reason === "ec_free");
  check("verifyStripeSignature: ヘッダ無しは false", (await verifyStripeSignature("x", null, "s")) === false);
}

console.log("■ 答え合わせキャンペーン");
{
  const dev = (n) => "device_" + String(n).padStart(12, "0");
  const ans = (n, pf, ps, af, as, extra = {}) => call("POST", "/campaign/answer", { body: Object.assign({ campaign: "kotae_test", device_id: dev(n), site: "blubel", pro_first: pf, pro_second: ps, app_first: af, app_second: as }, extra) });
  const a1 = await ans(1, "summer", "winter", "summer", "winter");
  check("一致（1st・2nd とも）→ 記録", a1.status === 200 && a1.j.recorded && a1.j.first_match && a1.j.full_match === true);
  const a1b = await ans(1, "summer", "winter", "winter", "summer");
  check("同じ端末の2回目は集計に入れない（recorded:false）", a1b.status === 200 && a1b.j.recorded === false && a1b.j.stats.total === 1);
  const a2 = await ans(2, "summer", null, "autumn", "spring", { first_match: true });
  check("クライアントの match 申告は無視してサーバで判定", a2.j.first_match === false && a2.j.full_match === null);
  await ans(3, "winter", "", "winter", "summer");
  const bad = await ans(4, "summer", "summer", "summer", "winter");
  check("プロの 1st と 2nd が同じなら 400", bad.status === 400);
  const bad2 = await ans(5, "pink", null, "summer", "winter");
  check("未知のシーズンは 400", bad2.status === 400);
  const wrong = await call("POST", "/campaign/answer", { body: { campaign: "other", device_id: dev(6), pro_first: "summer", app_first: "summer", app_second: "winter" } });
  check("実施中でないキャンペーンIDは 404", wrong.status === 404);

  const st = await call("GET", "/campaign/stats?campaign=kotae_test");
  const s = st.j.stats;
  check("集計: 3件・1st一致2件", s.total === 3 && s.first_match === 2 && Math.abs(s.first_rate - 2 / 3) < 1e-9);
  check("集計: 2nd まで比べられたのは1件・一致1件", s.full_total === 1 && s.full_match === 1);
  check("行列は 4x4 の全セルを返す（0件のセルも消さない）", Object.keys(s.matrix).length === 4 && Object.values(s.matrix).every((r) => Object.keys(r).length === 4));
  check("外れ（プロ夏→アプリ秋）も行列に残る", s.matrix.summer.autumn === 1);

  for (let i = 10; i < 10 + 30; i++) await ans(i, "spring", null, "spring", "autumn");
  const lim = await ans(99, "spring", null, "spring", "autumn");
  check("IP ごとの日次上限（30件）で 429", lim.status === 429);
  env.KOTAE_CAMPAIGN = "";
  const off = await call("GET", "/campaign/stats?campaign=kotae_test");
  check("キャンペーン期間外（KOTAE_CAMPAIGN 空）は 404", off.status === 404);
}

globalThis.fetch = realFetch;
console.log(`\n${pass} OK / ${fail} NG`);
process.exit(fail ? 1 : 0);
