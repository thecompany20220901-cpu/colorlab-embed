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

// カード側のプロンプト。事前生成16種と画風を揃えるため画風の文面は共通にしてある。
//
// 色は「カードに実際に出る2色配色」と必ず一致させる。出所は src/card_data.js の
// CARD_COPY[].cn / .ch（例 4-3 = "ネイビー×キャメル." / ["#1E2A44","#B5734A"]）。
// 12ペアぶんの表は要らない。1色目は1位シーズン、2色目は2位シーズンだけで決まるため。
//
//   1位: 春=ピーチ #EE8B7E / 夏=ラベンダー #C9B8D8 / 秋=テラコッタ #A65A3A / 冬=ネイビー #1E2A44
//   2位: 春=イエロー #F6D65B / 夏=ローズ #D4708E / 秋=キャメル #B5734A / 冬=マゼンタ #C2408B
//
// 2026-09-05: それ以前は 2色目を 1位シーズンだけで決め打ちしていた（冬なら常に
// bordeaux red 等）。カードが「ネイビー×キャメル」でも生成側へは camel が一度も
// 渡っておらず、2色目が絵に出ないのは当然だった。ここが本体の原因。
export const FIRST_COLOR = {
  spring: { en: "peach",      hex: "#EE8B7E" },
  summer: { en: "lavender",   hex: "#C9B8D8" },
  autumn: { en: "terracotta", hex: "#A65A3A" },
  winter: { en: "navy",       hex: "#1E2A44" },
};
export const SECOND_COLOR = {
  spring: { en: "warm yellow", hex: "#F6D65B" },
  summer: { en: "rose pink",   hex: "#D4708E" },
  autumn: { en: "camel",       hex: "#B5734A" },
  winter: { en: "magenta",     hex: "#C2408B" },
};

// second が届かない旧バンドル向けの保険。v1.20.3 以降のクライアントは必ず送るので
// 通常は使われないが、キャッシュに残った版を 400 で落とさないために残す。
// 値は 2026-09-05 以前の実挙動そのまま（＝振る舞いを変えない）。
export const LEGACY_SECOND = {
  spring: { en: "light green",  hex: "#8FCB9B" },
  summer: { en: "charcoal gray", hex: "#93A5B8" },
  autumn: { en: "olive green",  hex: "#7B8B45" },
  winter: { en: "bordeaux red", hex: "#9E1F33" },
};

// 2色が近いと、色鉛筆調の彩度落ち（実測 ΔE 15〜20）のほうが色見本どうしの距離より
// 大きくなり、2色目が主色に溶ける。実測した色見本間の距離:
//   ピーチ x キャメル 22.1 / ピーチ x ローズ 24.2 ← この2組だけが 30 を切る
//   テラコッタ x ローズ 35.9 / ピーチ x マゼンタ 47.5 / ... / ネイビー x イエロー 106.6
// 近い組でだけ「実際の色見本より濃く・彩度を上げて描け」と足す。表を持たず毎回測るのは、
// 色見本を差し替えたときに閾値の外れた組を書き換え忘れないため。
const CLOSE_PAIR_DELTA_E = 30;

function labOf(hex) {
  const v = parseInt(hex.slice(1), 16);
  const f = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
  const R = f((v >> 16) & 255), G = f((v >> 8) & 255), B = f(v & 255);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = k(X), fy = k(Y), fz = k(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function deltaE(hexA, hexB) {
  const a = labOf(hexA), b = labOf(hexB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// 1色目から2色目へ「どちらの向きに振ればよいか」を Lab の差から言葉にする。
//
// 2026-09-05 実測: ピーチ x ローズで「濃く・彩度を上げろ」とだけ書いたら、
// 生成物は L* が下がり a* が上がっただけで b* が 21 のまま残り、ローズ (b* 1.6)
// ではなくレンガ色に振れた。色見本への ΔE は 18.6 -> 21.1 とむしろ悪化している。
// 外していたのは明度でも彩度でもなく色相なので、軸ごとに向きを言葉で渡す。
function pushDirection(fromHex, toHex) {
  const a = labOf(fromHex), b = labOf(toHex);
  const dL = b[0] - a[0], da = b[1] - a[1], db = b[2] - a[2];
  const w = [];
  if (dL <= -5) w.push("clearly darker");
  else if (dL >= 5) w.push("clearly lighter");
  if (da >= 5) w.push("redder");
  else if (da <= -5) w.push("less red");
  if (db <= -5) w.push("much cooler and far less orange or yellow");
  else if (db >= 5) w.push("warmer and more golden");
  return w;
}

// 名前付き export は test/selfcard_prompt_check.mjs から色表とプロンプトを実測するため。
// Workers は default export の fetch しか見ないので、増やしても実行時の挙動は変わらない。
//
// 2色目の置き場所は「服そのものの部位」と「背景のストローク」に限る。
// 眼鏡・帽子・アクセサリーは写真に無いものを描き足させないため使わない
// （CC指示では小物案も挙がっていたが、既存の設計方針を優先した）。
export const buildPrompt = (first, second) => {
  const dom = FIRST_COLOR[first] || FIRST_COLOR.summer;
  const acc = (second && second !== first && SECOND_COLOR[second])
    || LEGACY_SECOND[first] || LEGACY_SECOND.summer;
  // 近い組だけ、2色目を色見本より一段濃く振らせる。生成は必ず淡いほうへ寄るので、
  // 色見本ちょうどを狙わせると主色に溶ける（2026-09-05 ピーチxローズで実測）。
  const dir = pushDirection(dom.hex, acc.hex);
  const close = deltaE(dom.hex, acc.hex) < CLOSE_PAIR_DELTA_E
    ? "These two colors are close, so push them apart along the right axis: next to the " +
      dom.en + ", the " + acc.en + " must be " + dir.join(", ") + ". " +
      "Making it darker or more saturated is not enough on its own: get the hue of " +
      acc.hex + " right first, then the depth. Never let it read as a tint of the " +
      dom.en + ". "
    : "";
  return (
    "Editorial magazine-style illustrated portrait based on the reference photo. " +
    "Loose black ink linework with soft colored pencil shading. Keep the face and " +
    "hairstyle accurately recognizable as the same person. Upper body, confident calm expression. " +
    "Two-color outfit. Both colors must be clearly visible; do not drop either one. " +
    "MAIN COLOR is " + dom.en + " (" + dom.hex + "): the body of the garment, about " +
    "three quarters of the clothing area. " +
    "SECOND COLOR is " + acc.en + " (" + acc.hex + "): solid " + acc.en +
    " collar, cuffs and button placket on that same garment, about one quarter of the " +
    "clothing area, large enough to be obvious in a small thumbnail. The " + acc.en +
    " must read as " + acc.en + " at a glance, not as a shadow or a tint of the " + dom.en + ". " +
    close +
    "Keep the second color on the garment's own parts and on the background strokes; " +
    "add no accessories that are not in the photo. " +
    "White background with loose brush strokes, mostly " + dom.en + " plus at least two " +
    acc.en + " strokes. No text."
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
    // 2色目。カードの配色は 1位x2位 で決まるので、これが無いと絵に2色目が出ない。
    const second = String(form.get("second") || "");
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
