/* ══════════════════════════════════════════════════════════
   colorlab-selfcard — 「自分の顔で作る」の中継

   なぜ中継が要るか:
     colorlab.iife.js は jsDelivr で公開配信される。OpenAI の APIキーを
     そこに置くと誰でも読めて残高を使われる。よってキーは Workers Secret に
     置き、生成はこの Worker ごしにだけ行う。

   ここでやること:
     1. 許可したオリジンからの POST だけ受ける
     2. JST の日付でグローバルに 50回/日 を数え、超えたら 429 を返す
     3. OpenAI images.edit (medium / 1024x1536) に中継する
     4. 写真は保存しない・ログにも残さない（バイト列はメモリ上だけ）

   デプロイ:
     wrangler kv namespace create SELFCARD_KV
       → 出た id を wrangler.toml に書く
     wrangler secret put OPENAI_API_KEY
     wrangler deploy
   ══════════════════════════════════════════════════════════ */

const ALLOW_ORIGINS = [
  "https://blubel.jp", "https://www.blubel.jp",
  "https://iebel.jp", "https://www.iebel.jp",
];

const DAILY_LIMIT = 50;
const MODEL = "gpt-image-1.5";
const SIZE = "1024x1536";
const QUALITY = "medium";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// カード側のプロンプト。事前生成16種と画風を揃えるため文面は共通にしてある。
// 眼鏡には触れない（写真に無いものを描き足させない）。
//
// ★2色はカードの表記（CARD_COPY[].cn / .ch）と一字一句そろえる。
//   カードの色名は「1位の色 × 2位の色」で、1色目は【1位】シーズン、
//   2色目は【2位】シーズンから決まる（src/card_data.js・出所は TYPES[].palette10）。
//   v1 は 2色目を ACCENT[first] という別表から引いていたため、カードが
//   「ネイビー×キャメル」でもプロンプトは "bordeaux red accent" になっていた
//   ＝ 2色目が弱いのではなく、そもそも一度も指定されていなかった。
//   新しい色は作らず、下の2表はカードの ch[0] / ch[1] をそのまま英名にしたもの。
const FIRST_COLOR = {   // = CARD_COPY[].ch[0]（1位シーズンで決まる）
  spring: { en: "peach", hex: "#EE8B7E" },
  summer: { en: "lavender", hex: "#C9B8D8" },
  autumn: { en: "terracotta", hex: "#A65A3A" },
  winter: { en: "navy", hex: "#1E2A44" },
};
const SECOND_COLOR = {  // = CARD_COPY[].ch[1]（2位シーズンで決まる）
  spring: { en: "yellow", hex: "#F6D65B" },
  summer: { en: "rose pink", hex: "#D4708E" },
  autumn: { en: "camel", hex: "#B5734A" },
  winter: { en: "magenta", hex: "#C2408B" },
};

// 2色を並べるだけだと片方（特に2色目）が落ちる。役割と置き場所を名指しし、
// 面積比まで書く。置き場所は「服のトリム2箇所＋背景のストローク」に限る
// ——写真に無い持ち物（眼鏡・アクセサリー）を描き足させないため。
const buildPrompt = (first, second) => {
  const c1 = FIRST_COLOR[first] || FIRST_COLOR.summer;
  const c2 = SECOND_COLOR[second] || SECOND_COLOR[first] || SECOND_COLOR.summer;
  return (
    "Editorial magazine-style illustrated portrait based on the reference photo. " +
    "Loose black ink linework with soft colored pencil shading. Keep the face and " +
    "hairstyle accurately recognizable as the same person. " +
    "Use a strict two-color palette and make BOTH colors clearly visible. " +
    "MAIN COLOR is " + c1.en + " " + c1.hex + ": the body of the clothing, about 70% of the " +
    "colored area, plus most of the loose brush strokes on the white background. " +
    "SECOND COLOR is " + c2.en + " " + c2.hex + ": about 30% of the colored area, and it must be " +
    "clearly visible in all three of these places - (1) the collar and neckline trim, " +
    "(2) the cuffs or sleeve ends, (3) at least two brush strokes on the background. " +
    "Keep the two colors distinct: do not tint " + c2.en + " toward " + c1.en + ", and do not omit it. " +
    "Upper body, confident calm expression. No text."
  );
};

// JST の日付。クライアントの申告は信用せず、必ずサーバ側で出した値で数える。
function jstDateKey() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function cors(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, cors(origin)),
  });

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // GET /health — Secret が生きているかだけを確かめる。画像生成しないので課金は発生しない。
    // 鍵そのものは絶対に返さない（有効かどうかの真偽と、上流のステータスだけ）。
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      if (!env.OPENAI_API_KEY) {
        return json({ ok: false, secret: false, reason: "not_configured" }, 500, origin);
      }
      let st = 0;
      try {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: "Bearer " + env.OPENAI_API_KEY },
        });
        st = r.status;
      } catch (e) {
        return json({ ok: false, secret: true, reason: "upstream_unreachable" }, 502, origin);
      }
      const day = jstDateKey();
      const used = parseInt((await env.SELFCARD_KV.get("count:" + day)) || "0", 10);
      return json({
        ok: st === 200,
        secret: true,              // Secret はバインドされている
        openai_status: st,         // 200 なら鍵が有効
        day: day,
        used: used,
        remaining: Math.max(0, DAILY_LIMIT - used),
      }, st === 200 ? 200 : 502, origin);
    }
    if (request.method !== "POST") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, origin);
    }
    if (!ALLOW_ORIGINS.includes(origin)) {
      return json({ ok: false, reason: "forbidden_origin" }, 403, origin);
    }
    if (!env.OPENAI_API_KEY) {
      return json({ ok: false, reason: "not_configured" }, 500, origin);
    }

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return json({ ok: false, reason: "bad_request" }, 400, origin);
    }

    const photo = form.get("photo");
    const first = String(form.get("first") || "summer");
    // 2色目は【2位】シーズンで決まる。カード側は最初から送っているが、v1 では
    // 読んでいなかった。知らない値・未送信のときは 400 にせず 1位で代用する
    // （古いクライアントが 2色目なしで叩いても、絵は出したいため）。
    const secondRaw = String(form.get("second") || "");
    const second = SECOND_COLOR[secondRaw] ? secondRaw : first;
    if (!photo || typeof photo.arrayBuffer !== "function") {
      return json({ ok: false, reason: "no_photo" }, 400, origin);
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return json({ ok: false, reason: "photo_too_large" }, 413, origin);
    }
    if (!FIRST_COLOR[first]) {
      return json({ ok: false, reason: "bad_type" }, 400, origin);
    }

    // ── 日次上限。KV は結果整合なので厳密なアトミック性は無い。
    //    多少の超過は許容し、暴走を止めることを目的にする。
    const day = jstDateKey();
    const counterKey = "count:" + day;
    const used = parseInt((await env.SELFCARD_KV.get(counterKey)) || "0", 10);
    if (used >= DAILY_LIMIT) {
      return json({ ok: false, reason: "daily_limit", remaining: 0 }, 429, origin);
    }
    // 先に増やす。生成に失敗したぶんも枠を食うが、
    // 後から増やす作りだと失敗を繰り返して上限を素通りできてしまう。
    await env.SELFCARD_KV.put(counterKey, String(used + 1), { expirationTtl: 60 * 60 * 48 });

    const upstream = new FormData();
    upstream.append("model", MODEL);
    upstream.append("prompt", buildPrompt(first, second));
    upstream.append("size", SIZE);
    upstream.append("quality", QUALITY);
    upstream.append("n", "1");
    upstream.append("image[]", photo, "photo.jpg");

    let r;
    try {
      r = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.OPENAI_API_KEY },
        body: upstream,
      });
    } catch (e) {
      // 例外メッセージに写真は含まれないが、念のため内容は返さない
      return json({ ok: false, reason: "upstream_unreachable" }, 502, origin);
    }

    if (!r.ok) {
      // 上流のエラー本文はそのまま外に出さない（キー等が混ざる可能性を避ける）
      console.log("openai_error status=" + r.status);
      return json({ ok: false, reason: "upstream_error", status: r.status }, 502, origin);
    }

    const j = await r.json();
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) return json({ ok: false, reason: "no_image" }, 502, origin);

    // 実測の根拠だけ残す。写真そのものは書き出さない。
    const u = j.usage || {};
    console.log("ok day=" + day + " used=" + (used + 1) +
      " out_image_tokens=" + ((u.output_tokens_details || {}).image_tokens || "?"));

    return json({
      ok: true,
      image: b64,
      remaining: Math.max(0, DAILY_LIMIT - (used + 1)),
      usage: u,
    }, 200, origin);
  },
};

// テスト用の名前付きエクスポート。Workers ランタイムが見るのは default だけなので、
// これを足しても本番の挙動は変わらない（test/selfcard_prompt_check.mjs から読む）。
export { FIRST_COLOR, SECOND_COLOR, buildPrompt };
