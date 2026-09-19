/* ══════════════════════════════════════════════════════════
   Color Lab MINE v1 — 会員・課金・答え合わせキャンペーン

   selfcard-worker.js の先頭から routeMine() を呼び、ここが受け持つパスだけ
   Response を返す。受け持たないパスは null を返し、既存の中継（/illustrate・
   /quota・/health）はそのまま動く。

   受け持つパス:
     POST /auth/request      メールアドレス → マジックリンクを送る
     POST /auth/verify       リンクのトークン → セッション発行
     POST /auth/logout       セッション破棄
     GET  /me                ログイン中の会員状態（プラン判定つき）
     POST /billing/checkout  Stripe Checkout セッション作成（月額/年払い）
     POST /stripe/webhook    Stripe Webhook 受信（署名検証つき）
     POST /campaign/answer   答え合わせの結果を1端末1回だけ記録
     GET  /campaign/stats    一致率の集計（全セルを返す・外れ値も隠さない）
     POST /ec/apply          EC購入者の無料会員申請（購入完了メールのスクショ添付）
     GET  /ec/status         自分の申請の状態
     GET  /admin             申請の承認画面（HTML）
     *    /admin/api/*       承認画面の API（ADMIN_TOKEN 必須）

   秘密情報は OpenAI キーと同じく Workers Secret に置く（wrangler.toml に書かない）:
     STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / RESEND_API_KEY / ADMIN_TOKEN

   写真は受け取らない・保存しない。キャンペーンもタイプ名（春夏秋冬）だけを持つ。
   ══════════════════════════════════════════════════════════ */

import { ADMIN_PAGE } from "./admin_page.js";

const SEASONS = ["spring", "summer", "autumn", "winter"];

const MAGIC_LINK_TTL_SEC = 15 * 60;          // リンクの有効期限 15分
const SESSION_TTL_SEC = 90 * 24 * 3600;      // ログイン状態 90日
const MAGIC_LINK_RESEND_SEC = 60;            // 同じアドレスへの再送は60秒あける
const KOTAE_IP_DAILY_LIMIT = 30;             // 答え合わせの記録は IP ごとに 1日30回まで
const STRIPE_SIG_TOLERANCE_SEC = 300;        // Webhook 署名のタイムスタンプ許容ずれ

// 料金。Stripe 側の Price がこの金額・周期と一致しない限り Checkout を作らない
// （ダッシュボードで作った Price ID の貼り間違いで ¥4,800/月 を請求する事故を止める）。
export const PLANS = {
  month: { env: "STRIPE_PRICE_MONTHLY", amount: 480, interval: "month" },
  year:  { env: "STRIPE_PRICE_YEARLY",  amount: 3980, interval: "year" },
};

// Stripe の購読状態のうち「使える」とみなすもの。past_due（引き落とし再試行中）は含めない。
const PAID_STATUSES = ["active", "trialing"];

// メール送信。env.MAIL_PROVIDER で選ぶ（2026-09-19 keisuke 決定: Resend）。
// 未設定・未登録・キーや差出人が無いときは 503 mail_not_configured を返し、黙って成功扱いにしない。
const configError = () => Object.assign(new Error("mail_not_configured"), { code: "not_configured" });
export const MAIL_SENDERS = {
  // https://resend.com/docs/api-reference/emails/send-email
  // 差出人はサイトごと（BLUBEL の利用者に IEBEL 名義で届かないように）。
  // ドメイン認証（SPF/DKIM）が済むまでは onboarding@resend.dev しか使えず、宛先も Resend アカウントの本人だけ。
  resend: async (env, msg) => {
    const from = msg.site === "iebel" ? env.MAIL_FROM_IEBEL : env.MAIL_FROM_BLUBEL;
    if (!env.RESEND_API_KEY || !from) throw configError();
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!r.ok) {
      // 上流の本文は外に出さない（宛先アドレス等が混ざるため）
      console.log("resend_error status=" + r.status);
      throw new Error("resend_error");
    }
  },
};

// EC購入者の申請（C案: 手動申請 + 管理者承認）
const EC_IMAGE_MAX_BYTES = 1_500_000;        // D1 の1行上限(2MB)より小さく。画面側で長辺1600pxに縮めて送る
const ADMIN_FAIL_LIMIT = 10;                 // 承認APIの認証失敗は IP ごとに 1時間10回まで

const now = () => Math.floor(Date.now() / 1000);

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function normalizeEmail(s) {
  const e = String(s || "").trim().toLowerCase();
  // 形式だけ見る。実在確認はリンクを踏めたかどうかで行う
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

function cors(origin, allowed) {
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://www.blubel.jp",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

// 会員のプラン判定。EC購入者は購読の有無に関係なく無料会員。
export function planOf(u) {
  if (!u) return "none";
  if (u.is_ec_purchaser) return "ec_free";
  if (PAID_STATUSES.includes(u.subscription_status)) return "paid";
  return "none";
}

const publicUser = (u) => ({
  email: u.email,
  plan: planOf(u),
  subscription_status: u.subscription_status,
  is_ec_purchaser: !!u.is_ec_purchaser,
});

async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

async function userFromSession(request, env) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
  if (!m) return null;
  const th = await sha256hex(m[1]);
  return env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"
  ).bind(th, now()).first();
}

// ── Stripe（SDK を使わず REST を直接叩く。Workers では Node 用 SDK が重いため）──
function formEncode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}

async function stripe(env, method, path, params) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : formEncode(params || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 上流の本文はそのまま外に出さない（既存の OpenAI 中継と同じ方針）
    console.log("stripe_error path=" + path + " status=" + r.status);
    const e = new Error("stripe_error"); e.status = r.status; throw e;
  }
  return j;
}

// Stripe-Signature: t=1700000000,v1=abcdef...,v1=... を検証する
export async function verifyStripeSignature(payload, header, secret, nowSec = now()) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = parseInt((parts.find(([k]) => k === "t") || [])[1], 10);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(nowSec - t) > STRIPE_SIG_TOLERANCE_SEC) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + payload));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // 長さをそろえてから定数時間で比べる
  return sigs.some((s) => {
    if (s.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

// 戻り先はサイト内の /pages/<英数字> だけ許す（外部サイトへ飛ばすリンクを作らせない）
function safeReturnPath(p) {
  return typeof p === "string" && /^\/pages\/[a-z0-9_-]{1,64}$/.test(p) ? p : "/pages/personalcolor";
}

export async function routeMine(request, env, allowOrigins) {
  const url = new URL(request.url);
  const path = url.pathname;
  const origin = request.headers.get("Origin") || "";
  // ステージングだけ、ローカルの検証ページ等を EXTRA_ALLOW_ORIGINS（カンマ区切り）で足せる。本番は空
  const extra = String(env.EXTRA_ALLOW_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = allowOrigins.includes(origin) || extra.includes(origin);
  const mine = /^\/(auth\/|me$|billing\/|stripe\/webhook$|campaign\/|ec\/|admin$|admin\/)/.test(path);
  if (!mine) return null;

  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: Object.assign({ "Content-Type": "application/json" }, cors(origin, allowed)),
  });

  // ── Stripe Webhook。ブラウザではなく Stripe から来るので Origin 検査の前に置く ──
  if (path === "/stripe/webhook") {
    if (request.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);
    const payload = await request.text();
    const ok = await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
    if (!ok) return json({ ok: false, reason: "bad_signature" }, 400);
    const ev = JSON.parse(payload);
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, type, received_at) VALUES (?, ?, ?)")
      .bind(ev.id, ev.type, now()).run();
    if (!ins.meta || ins.meta.changes === 0) return json({ ok: true, duplicate: true });
    try {
      await handleStripeEvent(env, ev);
    } catch (e) {
      // 処理に失敗したら受信記録を消して 500。Stripe の再送で取り直す
      await env.DB.prepare("DELETE FROM stripe_events WHERE id = ?").bind(ev.id).run();
      return json({ ok: false, reason: "handler_failed" }, 500);
    }
    return json({ ok: true });
  }

  // ── 承認画面。Worker 自身のドメインで配る同一オリジンのページなので Origin 検査の前に置く ──
  if (path === "/admin" || path.startsWith("/admin/")) return routeAdmin(request, env, path);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin, allowed) });
  if (!allowed) return json({ ok: false, reason: "forbidden_origin" }, 403);
  if (!env.DB) return json({ ok: false, reason: "db_not_configured" }, 503);

  // ── マジックリンク送信 ──
  if (path === "/auth/request" && request.method === "POST") {
    const body = await readJson(request);
    const email = normalizeEmail(body && body.email);
    if (!email) return json({ ok: false, reason: "bad_email" }, 400);
    const send = MAIL_SENDERS[env.MAIL_PROVIDER || ""];
    if (!send) return json({ ok: false, reason: "mail_not_configured" }, 503);
    const site = /iebel\.jp$/.test(new URL(origin).hostname) ? "iebel" : "blubel";

    const rk = "ml:" + (await sha256hex(email));
    if (env.SELFCARD_KV && (await env.SELFCARD_KV.get(rk))) return json({ ok: false, reason: "too_soon" }, 429);

    const token = randomToken();
    const t = now();
    await env.DB.prepare(
      "INSERT INTO users (email, magic_link_token, token_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(email) DO UPDATE SET magic_link_token = excluded.magic_link_token, " +
      "token_expires_at = excluded.token_expires_at, updated_at = excluded.updated_at"
    ).bind(email, await sha256hex(token), t + MAGIC_LINK_TTL_SEC, t, t).run();

    const link = origin + safeReturnPath(body.return_path) + "?mine_token=" + token;
    try {
      await send(env, {
        site,
        to: email,
        subject: "Color Lab MINE ログインリンク",
        text: "下のリンクを15分以内に開くとログインできます。\n\n" + link +
          "\n\n心当たりがない場合は、このメールを破棄してください。",
      });
    } catch (e) {
      if (e.code === "not_configured") return json({ ok: false, reason: "mail_not_configured" }, 503);
      console.log("mail_error provider=" + env.MAIL_PROVIDER);
      return json({ ok: false, reason: "mail_failed" }, 502);
    }
    if (env.SELFCARD_KV) await env.SELFCARD_KV.put(rk, "1", { expirationTtl: MAGIC_LINK_RESEND_SEC });
    // 登録済みかどうかは返さない（アドレスの存在確認に使わせない）
    return json({ ok: true });
  }

  // ── マジックリンク検証 → セッション発行 ──
  if (path === "/auth/verify" && request.method === "POST") {
    const body = await readJson(request);
    const token = String((body && body.token) || "");
    if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return json({ ok: false, reason: "bad_token" }, 400);
    const th = await sha256hex(token);
    const u = await env.DB.prepare("SELECT * FROM users WHERE magic_link_token = ? AND token_expires_at > ?")
      .bind(th, now()).first();
    if (!u) return json({ ok: false, reason: "invalid_or_expired" }, 401);
    // 1回使ったら消す（同じリンクで2度ログインさせない）
    await env.DB.prepare("UPDATE users SET magic_link_token = NULL, token_expires_at = NULL, updated_at = ? WHERE id = ?")
      .bind(now(), u.id).run();
    const session = randomToken();
    await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256hex(session), u.id, now() + SESSION_TTL_SEC, now()).run();
    return json({ ok: true, session, user: publicUser(u) });
  }

  if (path === "/auth/logout" && request.method === "POST") {
    const h = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/, "");
    if (h) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256hex(h)).run();
    return json({ ok: true });
  }

  if (path === "/me" && request.method === "GET") {
    const u = await userFromSession(request, env);
    if (!u) return json({ ok: false, reason: "not_logged_in" }, 401);
    return json({ ok: true, user: publicUser(u) });
  }

  // ── Stripe Checkout ──
  if (path === "/billing/checkout" && request.method === "POST") {
    const u = await userFromSession(request, env);
    if (!u) return json({ ok: false, reason: "not_logged_in" }, 401);
    if (!env.STRIPE_SECRET_KEY) return json({ ok: false, reason: "not_configured" }, 503);
    const plan = planOf(u);
    if (plan === "ec_free") return json({ ok: false, reason: "ec_free" }, 409);
    if (plan === "paid") return json({ ok: false, reason: "already_active" }, 409);

    const body = await readJson(request);
    const spec = PLANS[body && body.interval];
    if (!spec) return json({ ok: false, reason: "bad_interval" }, 400);
    const priceId = env[spec.env];
    if (!priceId) return json({ ok: false, reason: "not_configured" }, 503);

    try {
      // Price の実体が料金表と一致するか毎回確かめる（食い違ったら作らない）
      const price = await stripe(env, "GET", "prices/" + encodeURIComponent(priceId));
      const ri = price.recurring || {};
      if (price.currency !== "jpy" || price.unit_amount !== spec.amount || ri.interval !== spec.interval || ri.interval_count !== 1 || !price.active) {
        console.log("price_mismatch interval=" + spec.interval);
        return json({ ok: false, reason: "price_mismatch" }, 500);
      }
      let customer = u.stripe_customer_id;
      if (!customer) {
        const c = await stripe(env, "POST", "customers", { email: u.email, metadata: { user_id: u.id } });
        customer = c.id;
        await env.DB.prepare("UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?").bind(customer, now(), u.id).run();
      }
      const back = origin + safeReturnPath(body.return_path);
      const s = await stripe(env, "POST", "checkout/sessions", {
        mode: "subscription",
        customer,
        client_reference_id: String(u.id),
        line_items: { 0: { price: priceId, quantity: 1 } },
        subscription_data: { metadata: { user_id: u.id } },
        success_url: back + "?mine_checkout=success",
        cancel_url: back + "?mine_checkout=cancel",
        locale: "ja",
      });
      return json({ ok: true, url: s.url });
    } catch (e) {
      return json({ ok: false, reason: "stripe_error" }, 502);
    }
  }

  // ── 答え合わせキャンペーン ──
  if (path === "/campaign/answer" && request.method === "POST") {
    const b = await readJson(request);
    if (!b || !env.KOTAE_CAMPAIGN || b.campaign !== env.KOTAE_CAMPAIGN) return json({ ok: false, reason: "no_campaign" }, 404);
    const okSeason = (s) => SEASONS.includes(s);
    const proSecond = b.pro_second == null || b.pro_second === "" ? null : b.pro_second;
    if (!okSeason(b.pro_first) || !okSeason(b.app_first) || !okSeason(b.app_second) ||
        (proSecond !== null && (!okSeason(proSecond) || proSecond === b.pro_first)) ||
        !/^[A-Za-z0-9_-]{16,64}$/.test(String(b.device_id || ""))) {
      return json({ ok: false, reason: "bad_request" }, 400);
    }
    const site = b.site === "iebel" ? "iebel" : "blubel";

    // IP ごとの日次上限（IP は生で残さずハッシュだけ・48時間で消える）
    if (env.SELFCARD_KV) {
      const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const ipKey = "kotae_ip:" + day + ":" + (await sha256hex(request.headers.get("CF-Connecting-IP") || "none"));
      const n = parseInt((await env.SELFCARD_KV.get(ipKey)) || "0", 10);
      if (n >= KOTAE_IP_DAILY_LIMIT) return json({ ok: false, reason: "rate_limited" }, 429);
      await env.SELFCARD_KV.put(ipKey, String(n + 1), { expirationTtl: 60 * 60 * 48 });
    }

    // 一致判定はサーバでやり直す（クライアントの申告した match は使わない）
    const firstMatch = b.pro_first === b.app_first ? 1 : 0;
    const fullMatch = proSecond === null ? null : (firstMatch && proSecond === b.app_second ? 1 : 0);
    const r = await env.DB.prepare(
      "INSERT OR IGNORE INTO kotae_answers (campaign, device_id, site, pro_first, pro_second, app_first, app_second, first_match, full_match, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(b.campaign, b.device_id, site, b.pro_first, proSecond, b.app_first, b.app_second, firstMatch, fullMatch, now()).run();
    return json({
      ok: true,
      recorded: !!(r.meta && r.meta.changes),   // false = この端末は記録済み（2回目以降は集計に入れない）
      first_match: !!firstMatch,
      full_match: fullMatch === null ? null : !!fullMatch,
      stats: await kotaeStats(env, b.campaign),
    });
  }

  // ── EC購入者の無料会員申請 ──
  if (path === "/ec/apply" && request.method === "POST") {
    const u = await userFromSession(request, env);
    if (!u) return json({ ok: false, reason: "not_logged_in" }, 401);
    if (u.is_ec_purchaser) return json({ ok: false, reason: "already_ec_free" }, 409);
    const pending = await env.DB.prepare("SELECT id FROM ec_applications WHERE user_id = ? AND status = 'pending'").bind(u.id).first();
    if (pending) return json({ ok: false, reason: "pending_exists" }, 409);

    let form;
    try { form = await request.formData(); } catch (e) { return json({ ok: false, reason: "bad_request" }, 400); }
    const img = form.get("image");
    if (!img || typeof img.arrayBuffer !== "function") return json({ ok: false, reason: "no_image" }, 400);
    if (img.size > EC_IMAGE_MAX_BYTES) return json({ ok: false, reason: "image_too_large" }, 413);
    const ab = await img.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const type = imageTypeOf(bytes);
    if (!type) return json({ ok: false, reason: "bad_image" }, 400);
    const site = form.get("site") === "iebel" ? "iebel" : "blubel";
    const orderEmail = form.get("order_email") ? normalizeEmail(form.get("order_email")) : null;
    if (form.get("order_email") && !orderEmail) return json({ ok: false, reason: "bad_email" }, 400);
    const orderNumber = String(form.get("order_number") || "").trim().slice(0, 64) || null;
    const note = String(form.get("note") || "").trim().slice(0, 500) || null;
    await env.DB.prepare(
      "INSERT INTO ec_applications (user_id, site, order_email, order_number, note, image, image_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)"
    ).bind(u.id, site, orderEmail, orderNumber, note, ab, type, now()).run();
    return json({ ok: true, status: "pending" });
  }

  if (path === "/ec/status" && request.method === "GET") {
    const u = await userFromSession(request, env);
    if (!u) return json({ ok: false, reason: "not_logged_in" }, 401);
    const a = await env.DB.prepare(
      "SELECT status, site, created_at, reviewed_at, reject_reason FROM ec_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1"
    ).bind(u.id).first();
    return json({ ok: true, application: a || null, user: publicUser(u) });
  }

  if (path === "/campaign/stats" && request.method === "GET") {
    const c = url.searchParams.get("campaign") || "";
    if (!env.KOTAE_CAMPAIGN || c !== env.KOTAE_CAMPAIGN) return json({ ok: false, reason: "no_campaign" }, 404);
    return json({ ok: true, stats: await kotaeStats(env, c) });
  }

  return json({ ok: false, reason: "not_found" }, 404);
}

// 集計。行列は 4x4 の全セルを 0 埋めで返す（件数の少ないセルも消さない）。
export async function kotaeStats(env, campaign) {
  const rows = (await env.DB.prepare(
    "SELECT pro_first, app_first, COUNT(*) AS n FROM kotae_answers WHERE campaign = ? GROUP BY pro_first, app_first"
  ).bind(campaign).all()).results || [];
  const tot = await env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(first_match) AS first_match, " +
    "SUM(CASE WHEN full_match IS NOT NULL THEN 1 ELSE 0 END) AS full_total, SUM(COALESCE(full_match, 0)) AS full_match, " +
    "MAX(created_at) AS last_at FROM kotae_answers WHERE campaign = ?"
  ).bind(campaign).first();
  const matrix = {};
  for (const p of SEASONS) { matrix[p] = {}; for (const a of SEASONS) matrix[p][a] = 0; }
  for (const r of rows) if (matrix[r.pro_first] && r.app_first in matrix[r.pro_first]) matrix[r.pro_first][r.app_first] = r.n;
  const total = tot.total || 0, fm = tot.first_match || 0, ft = tot.full_total || 0, fu = tot.full_match || 0;
  return {
    total,
    first_match: fm,
    first_rate: total ? fm / total : null,
    full_total: ft,
    full_match: fu,
    full_rate: ft ? fu / ft : null,
    matrix,
    last_at: tot.last_at || null,
  };
}

async function handleStripeEvent(env, ev) {
  const o = ev.data && ev.data.object;
  if (!o) return;
  if (ev.type === "checkout.session.completed" && o.mode === "subscription") {
    // 状態は customer.subscription.* を正とする。ここでは購読IDの紐付けだけ行う
    await env.DB.prepare("UPDATE users SET stripe_subscription_id = ?, updated_at = ? WHERE stripe_customer_id = ?")
      .bind(o.subscription, now(), o.customer).run();
    return;
  }
  if (ev.type === "customer.subscription.created" || ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    // Webhook は順不同で届く（updated が created より先に来ることもある）。
    // イベント本文の status ではなく、その時点の購読を取り直して最新の状態を書く。
    let status;
    try {
      status = (await stripe(env, "GET", "subscriptions/" + encodeURIComponent(o.id))).status;
    } catch (e) {
      if (e.status === 404) status = "canceled";
      else throw e;   // 500 を返して Stripe に再送させる
    }
    await env.DB.prepare("UPDATE users SET subscription_status = ?, stripe_subscription_id = ?, updated_at = ? WHERE stripe_customer_id = ?")
      .bind(status, o.id, now(), o.customer).run();
  }
}

// 先頭バイトで画像の種類を決める（Content-Type の申告は信用しない）
export function imageTypeOf(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

// ── 承認画面（GET /admin）と API（/admin/api/*）──
// 認証は Workers Secret の ADMIN_TOKEN（32文字以上）を Bearer で送る方式。
// 担当者ごとの ID は持たない（v1 は keisuke 1名運用の想定）。複数人にするなら Cloudflare Access へ。
async function routeAdmin(request, env, path) {
  const sec = {
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: Object.assign({ "Content-Type": "application/json" }, sec) });

  if (path === "/admin" && request.method === "GET") {
    return new Response(ADMIN_PAGE, {
      headers: Object.assign({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'",
      }, sec),
    });
  }
  if (!path.startsWith("/admin/api/")) return json({ ok: false, reason: "not_found" }, 404);
  if (!env.ADMIN_TOKEN || String(env.ADMIN_TOKEN).length < 32) return json({ ok: false, reason: "admin_not_configured" }, 503);

  // 失敗回数の上限（総当たりよけ）
  const failKey = "admin_fail:" + (await sha256hex(request.headers.get("CF-Connecting-IP") || "none"));
  const fails = env.SELFCARD_KV ? parseInt((await env.SELFCARD_KV.get(failKey)) || "0", 10) : 0;
  if (fails >= ADMIN_FAIL_LIMIT) return json({ ok: false, reason: "rate_limited" }, 429);
  const given = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/, "");
  // 両方をハッシュしてから比べる（長さの違いで早抜けしない）
  if ((await sha256hex(given)) !== (await sha256hex(String(env.ADMIN_TOKEN)))) {
    if (env.SELFCARD_KV) await env.SELFCARD_KV.put(failKey, String(fails + 1), { expirationTtl: 3600 });
    return json({ ok: false, reason: "unauthorized" }, 401);
  }

  // GET /admin/api/applications?status=pending|approved|rejected
  if (path === "/admin/api/applications" && request.method === "GET") {
    const st = new URL(request.url).searchParams.get("status") || "pending";
    if (!["pending", "approved", "rejected"].includes(st)) return json({ ok: false, reason: "bad_status" }, 400);
    const rows = (await env.DB.prepare(
      "SELECT a.id, a.status, a.site, u.email AS login_email, a.order_email, a.order_number, a.note, a.created_at, a.reviewed_at, a.reject_reason, " +
      "CASE WHEN a.image IS NULL THEN 0 ELSE 1 END AS has_image, u.is_ec_purchaser " +
      "FROM ec_applications a JOIN users u ON u.id = a.user_id WHERE a.status = ? ORDER BY a.id " + (st === "pending" ? "ASC" : "DESC") + " LIMIT 200"
    ).bind(st).all()).results || [];
    return json({ ok: true, applications: rows });
  }

  let m;
  // GET /admin/api/applications/:id/image
  if ((m = path.match(/^\/admin\/api\/applications\/(\d+)\/image$/)) && request.method === "GET") {
    const a = await env.DB.prepare("SELECT image, image_type FROM ec_applications WHERE id = ?").bind(+m[1]).first();
    if (!a || !a.image) return json({ ok: false, reason: "no_image" }, 404);
    return new Response(new Uint8Array(a.image), { headers: Object.assign({ "Content-Type": a.image_type }, sec) });
  }

  // POST /admin/api/applications/:id/decide {decision: "approve"|"reject", reason?}
  if ((m = path.match(/^\/admin\/api\/applications\/(\d+)\/decide$/)) && request.method === "POST") {
    const b = await readJson(request);
    const decision = b && b.decision;
    if (decision !== "approve" && decision !== "reject") return json({ ok: false, reason: "bad_decision" }, 400);
    const reason = decision === "reject" ? String((b && b.reason) || "").trim().slice(0, 300) : null;
    if (decision === "reject" && !reason) return json({ ok: false, reason: "reason_required" }, 400);
    const a = await env.DB.prepare("SELECT id, user_id, status FROM ec_applications WHERE id = ?").bind(+m[1]).first();
    if (!a) return json({ ok: false, reason: "not_found" }, 404);
    if (a.status !== "pending") return json({ ok: false, reason: "already_decided" }, 409);
    const t = now();
    // 判断が済んだらスクショは消す（購入完了メールには氏名・住所が写るため、持ち続けない）
    await env.DB.prepare(
      "UPDATE ec_applications SET status = ?, reject_reason = ?, reviewed_at = ?, image = NULL WHERE id = ? AND status = 'pending'"
    ).bind(decision === "approve" ? "approved" : "rejected", reason, t, a.id).run();
    if (decision === "approve") {
      await env.DB.prepare("UPDATE users SET is_ec_purchaser = 1, updated_at = ? WHERE id = ?").bind(t, a.user_id).run();
    }
    return json({ ok: true });
  }

  return json({ ok: false, reason: "not_found" }, 404);
}
