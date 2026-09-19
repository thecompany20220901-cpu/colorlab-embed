import React, { useState, useEffect, useRef } from "react";
import { MINE_ENDPOINT as ENDPOINT } from "./mine_api.js";

/* ════════════════════════════════════════════
   答え合わせキャンペーン（MINE v1）

   流れ: ①プロ診断の結果を入力 → ②既存の「写真で診断」をそのまま実施
        → ③一致/不一致を即時表示 → ④ストーリー用画像（1080x1920）を保存
   判定ロジックは新しく作らない。写真診断は color_lab_stylist_v23.jsx の
   既存エンジン（白基準補正 + CIELab・端末内）の結果 {first, second} を受け取るだけ。

   入口は /pages/personalcolor?campaign=kotaeawase（2026-09-19 keisuke 決定: GTM は変えない）。
   Fulmo の LP は JS が動かないため、リアルタイム集計はこの入力画面の下に出す。

   Tailwind 側の見た目に左右されないよう、ここはインラインスタイルだけで書く。
   ════════════════════════════════════════════ */

// キャンペーン内容（2026-09-19 keisuke 確定）。実施期間は日付が決まってから Worker の
// KOTAE_START / KOTAE_END に入れ、画面は集計 API（stats.period）から表示する（アプリの再リリース不要）。
export const KOTAE = {
  id: "kotae2026",       // Worker の KOTAE_CAMPAIGN と一致させる
  hashtag: "#答え合わせキャンペーン #ColorLabMINE",
  // メンション先は診断結果で出し分ける（ブルベ → @blube_lab / イエベ → @iebe_lab）。
  // 「診断結果」はストーリー画像を作ったアプリの結果（写真で診断の 1st）で判定する
  mention: { spring: "@iebe_lab", autumn: "@iebe_lab", summer: "@blube_lab", winter: "@blube_lab" },
  announce: "期間終了後、@blube_lab・@iebe_lab 両アカウントのストーリーで当選者にDMでご連絡します。あわせてアカウント上で当選人数・結果を告知します。",
};

// 名前と accent は color_lab_stylist_v23.jsx の TYPES と同じ（test/kotaeawase_check.mjs で照合）
export const SEASON = {
  spring: { name: "イエベ春", accent: "#E8927C" },
  summer: { name: "ブルベ夏", accent: "#9B8CB5" },
  autumn: { name: "イエベ秋", accent: "#A65E3A" },
  winter: { name: "ブルベ冬", accent: "#3B5BA5" },
};
const ORDER = ["spring", "summer", "autumn", "winter"];

const INK = "#3a3340", SUB = "#7d7580", FAINT = "#a99fa8", LINE = "#e7dfe6";
const SERIF = "'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif";

const pct = (r) => (r == null ? "—" : Math.round(r * 100) + "%");
const mentionFor = (first) => KOTAE.mention[first] || "@blube_lab";

// "2026-09-21" → "9月21日（月）"。曜日は日付そのものから出す（端末のタイムゾーンに左右されない）
const WD = ["日", "月", "火", "水", "木", "金", "土"];
function jpDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return `${m}月${d}日（${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;
}
export function periodText(p) {
  if (!p || !p.start || !p.end) return "近日お知らせします";
  return `${jpDate(p.start)}〜${jpDate(p.end)}`;
}

// 1端末1回の集計のための乱数ID。localStorage が使えない環境では毎回変わる（=記録は最初の1回扱いにならない）
function deviceId() {
  const K = "colorlab-kotae-device";
  try {
    let v = localStorage.getItem(K);
    if (!v) {
      const a = crypto.getRandomValues(new Uint8Array(18));
      v = btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(K, v);
    }
    return v;
  } catch (e) {
    return "nostore_" + Math.random().toString(36).slice(2, 18);
  }
}

// ── ① プロ診断の入力 ──
export function KotaeInput({ onStart }) {
  const [pro, setPro] = useState(null);
  const [second, setSecond] = useState("");     // "" = 言われていない / 覚えていない
  const [agree, setAgree] = useState(false);
  const ready = pro && agree;

  const chip = (active, color) => ({
    padding: "12px 8px", borderRadius: 14, fontSize: 14, cursor: "pointer",
    border: `1.5px solid ${active ? color : LINE}`, background: active ? color + "1f" : "#fff",
    color: active ? INK : SUB, fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ padding: "28px 22px 32px", color: INK }}>
      <div style={{ fontSize: 12, color: SUB, letterSpacing: ".08em" }}>プロ診断 × アプリ</div>
      <h2 style={{ fontFamily: SERIF, fontSize: 28, margin: "6px 0 8px", fontWeight: 500 }}>答え合わせ</h2>
      <p style={{ fontSize: 13, color: SUB, lineHeight: 1.7, margin: 0 }}>
        プロのパーソナルカラー診断を受けた方限定。プロの結果と、このアプリの「写真で診断」の結果が合っているかを、その場で答え合わせします。
      </p>

      <div style={{ marginTop: 22, fontSize: 13, fontWeight: 600 }}>プロ診断の結果（1st）<span style={{ color: "#C0392B" }}>＊</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        {ORDER.map((k) => (
          <button key={k} type="button" aria-pressed={pro === k} onClick={() => { setPro(k); if (second === k) setSecond(""); }} style={chip(pro === k, SEASON[k].accent)}>
            {SEASON[k].name}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18, fontSize: 13, fontWeight: 600 }}>2nd（セカンド）も言われた方は</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <button type="button" aria-pressed={second === ""} onClick={() => setSecond("")} style={chip(second === "", "#7b6f83")}>言われていない</button>
        {ORDER.filter((k) => k !== pro).map((k) => (
          <button key={k} type="button" aria-pressed={second === k} onClick={() => setSecond(k)} style={chip(second === k, SEASON[k].accent)}>
            {SEASON[k].name}
          </button>
        ))}
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 20, fontSize: 13, lineHeight: 1.6, cursor: "pointer" }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
        <span>プロ（対面またはオンライン）のパーソナルカラー診断を受けたことがあります</span>
      </label>

      <button type="button" disabled={!ready} onClick={() => onStart({ first: pro, second: second || null })}
        style={{ width: "100%", marginTop: 20, padding: "15px 0", borderRadius: 999, border: "none", fontSize: 15, fontWeight: 600,
          background: ready ? "#7D2E46" : "#d9d2d8", color: "#fff", cursor: ready ? "pointer" : "default" }}>
        {ready ? "写真で診断して答え合わせする" : "結果の選択と確認をしてください"}
      </button>
      <p style={{ fontSize: 11, color: FAINT, lineHeight: 1.7, marginTop: 12 }}>
        写真はこの端末の中だけで解析し、送信・保存しません。集計に使うのはタイプ名（プロの結果とアプリの結果）だけで、1台の端末につき最初の1回だけを数えます。
      </p>
      <div style={{ marginTop: 22 }}>
        <KotaeStats />
      </div>
    </div>
  );
}

// ── ③ 結果（一致/不一致）+ ④ ストーリー画像 ──
export function KotaeResult({ pro, app, site, onRetry }) {
  const firstMatch = pro.first === app.first;
  const fullMatch = pro.second ? firstMatch && pro.second === app.second : null;
  const [post, setPost] = useState({ state: "sending" });  // sending / done / error
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;   // StrictMode の二重実行でも1回だけ送る
    sent.current = true;
    fetch(ENDPOINT + "/campaign/answer", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign: KOTAE.id, device_id: deviceId(), site, pro_first: pro.first, pro_second: pro.second, app_first: app.first, app_second: app.second }),
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (ok && j.ok) setPost({ state: "done", recorded: j.recorded, stats: j.stats });
        // 実施期間外（開始前 / 終了後）は記録されないが、集計と期間は見せる
        else if (j && (j.reason === "not_started" || j.reason === "ended")) setPost({ state: "closed", reason: j.reason, stats: j.stats });
        else setPost({ state: "error" });
      })
      .catch(() => setPost({ state: "error" }));
  }, []);
  const period = post.stats && post.stats.period;
  const mention = mentionFor(app.first);

  const verdict = firstMatch ? "一致！" : "ちがった！";
  const vColor = firstMatch ? "#7D2E46" : "#5b6b8a";

  const Box = ({ label, v }) => (
    <div style={{ flex: 1, borderRadius: 18, padding: "14px 12px", textAlign: "center", background: SEASON[v.first].accent + "14", border: `1px solid ${SEASON[v.first].accent}55` }}>
      <div style={{ fontSize: 11, color: SUB }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 22, marginTop: 4 }}>{SEASON[v.first].name}</div>
      <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>2nd：{v.second ? SEASON[v.second].name : "—"}</div>
    </div>
  );

  return (
    <div style={{ padding: "26px 22px 32px", color: INK }}>
      <div style={{ fontSize: 12, color: SUB, textAlign: "center" }}>プロ診断 × アプリ 答え合わせ</div>
      <div style={{ fontFamily: SERIF, fontSize: 44, textAlign: "center", color: vColor, margin: "6px 0 14px" }}>{verdict}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Box label="プロ診断" v={pro} />
        <Box label="アプリ（写真で診断）" v={app} />
      </div>
      <p style={{ fontSize: 13, color: SUB, lineHeight: 1.7, marginTop: 14, textAlign: "center" }}>
        {firstMatch ? "1st（いちばん似合うシーズン）が一致しました。" : "1st（いちばん似合うシーズン）が違いました。"}
        {fullMatch === null ? "" : fullMatch ? "2nd まで一致です。" : "2nd は違いました。"}
      </p>

      <button type="button" onClick={() => saveKotaeStory({ pro, app, firstMatch, site, stats: post.stats })}
        style={{ width: "100%", marginTop: 8, padding: "15px 0", borderRadius: 999, border: "none", background: "#7D2E46", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        ストーリー用の画像を保存
      </button>
      <div style={{ fontSize: 12, color: SUB, lineHeight: 1.7, marginTop: 10, padding: "12px 14px", background: "#faf7f9", borderRadius: 12 }}>
        <div>
          <b style={{ color: INK }}>応募方法</b>：保存した画像をストーリーに投稿し、<b style={{ color: INK }}>{KOTAE.hashtag}</b> を付けて
          <b style={{ color: INK }}> {mention}</b> をメンションしてください（アプリの結果がブルベの方は @blube_lab、イエベの方は @iebe_lab）。
        </div>
        <div style={{ marginTop: 6 }}><b style={{ color: INK }}>実施期間</b>：{post.state === "sending" ? "…" : periodText(period)}</div>
        <div style={{ marginTop: 6 }}><b style={{ color: INK }}>当選発表</b>：{KOTAE.announce}</div>
      </div>

      <div style={{ marginTop: 22 }}>
        {post.state === "sending" && <div style={{ fontSize: 12, color: FAINT, textAlign: "center" }}>集計に送信しています…</div>}
        {post.state === "error" && <div style={{ fontSize: 12, color: FAINT, textAlign: "center" }}>集計に接続できませんでした（結果の表示と画像の保存はできます）</div>}
        {post.state === "closed" && (
          <div role="alert" style={{ fontSize: 12, color: "#b42318", textAlign: "center", marginBottom: 8, lineHeight: 1.7 }}>
            {post.reason === "ended" ? "キャンペーンは終了しました。" : "キャンペーンの開始前です。"}この結果は集計に入りません（実施期間 {periodText(period)}）。
          </div>
        )}
        {post.state === "done" && post.recorded === false && (
          <div style={{ fontSize: 12, color: FAINT, textAlign: "center", marginBottom: 8 }}>この端末は記録済みのため、集計には最初の1回の結果が入っています。</div>
        )}
        {(post.state === "done" || post.state === "closed") && <KotaeStatsView stats={post.stats} />}
      </div>

      <button type="button" onClick={onRetry} style={{ display: "block", margin: "18px auto 0", background: "none", border: "none", color: SUB, fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>
        プロ診断の入力に戻る
      </button>
    </div>
  );
}

// ── 集計の表示。4x4 の全セルを出す（件数の少ないセル・外れも隠さない）──
export function KotaeStatsView({ stats }) {
  if (!stats) return null;
  const cell = { padding: "6px 2px", textAlign: "center", fontSize: 12, borderBottom: `1px solid ${LINE}` };
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 18, padding: "16px 14px", background: "#fff", color: INK }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>みんなの答え合わせ（リアルタイム集計）</div>
      <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
        実施期間：{periodText(stats.period)}{stats.period && stats.period.status === "ended" ? "（終了しました）" : ""}
      </div>
      {stats.total === 0 ? (
        <div style={{ fontSize: 12, color: FAINT, marginTop: 8 }}>まだ回答がありません。</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: SUB }}>1st 一致率</div>
              <div style={{ fontFamily: SERIF, fontSize: 30 }}>{pct(stats.first_rate)}</div>
              <div style={{ fontSize: 11, color: FAINT }}>{stats.first_match} / {stats.total} 人</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: SUB }}>2nd まで一致</div>
              <div style={{ fontFamily: SERIF, fontSize: 30 }}>{pct(stats.full_rate)}</div>
              <div style={{ fontSize: 11, color: FAINT }}>{stats.full_match} / {stats.full_total} 人（2nd を入力した人）</div>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ ...cell, fontWeight: 400, color: SUB, textAlign: "left" }}>プロ ＼ アプリ</th>
                {ORDER.map((a) => <th key={a} style={{ ...cell, fontWeight: 400, color: SUB }}>{SEASON[a].name}</th>)}
              </tr>
            </thead>
            <tbody>
              {ORDER.map((p) => (
                <tr key={p}>
                  <td style={{ ...cell, textAlign: "left", color: SUB }}>{SEASON[p].name}</td>
                  {ORDER.map((a) => (
                    <td key={a} style={{ ...cell, fontWeight: p === a ? 700 : 400, background: p === a ? SEASON[p].accent + "1a" : "transparent" }}>
                      {stats.matrix[p][a]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: FAINT, marginTop: 8, lineHeight: 1.6 }}>
            対角線（色付き）が一致。1台の端末につき最初の1回だけを集計しています。
            {stats.last_at ? `最終更新 ${new Date(stats.last_at * 1000).toLocaleString("ja-JP")}` : ""}
          </div>
        </>
      )}
    </div>
  );
}

// 入力画面の下に出す集計。30秒ごとに取り直す。
export function KotaeStats() {
  const [s, setS] = useState({ state: "loading" });
  useEffect(() => {
    let alive = true;
    const load = () => fetch(ENDPOINT + "/campaign/stats?campaign=" + encodeURIComponent(KOTAE.id))
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => alive && setS(ok && j.ok ? { state: "ok", stats: j.stats } : { state: "error" }))
      .catch(() => alive && setS({ state: "error" }));
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (s.state === "loading") return <div style={{ fontSize: 12, color: FAINT, padding: 12 }}>集計を読み込み中…</div>;
  if (s.state === "error") return <div style={{ fontSize: 12, color: FAINT, padding: 12 }}>集計を読み込めませんでした。時間をおいて開き直してください。</div>;
  return <KotaeStatsView stats={s.stats} />;
}

// ── ④ ストーリー用画像（1080x1920）──
export function buildKotaeStory({ pro, app, firstMatch, site, stats }) {
  const W = 1080, H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fbf9f7"; ctx.fillRect(0, 0, W, H);
  // 上部の色帯（ホーム画面と同じ12色）
  const rowA = ["#F7C9A0", "#F4A582", "#F6D65B", "#C89B3C", "#B5734A", "#A65A3A"];
  const rowB = ["#C9B8D8", "#E8A9C0", "#A9C4DE", "#3B5BA5", "#C2408B", "#111418"];
  rowA.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * W / 6, 0, W / 6 + 1, 90); });
  rowB.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * W / 6, 90, W / 6 + 1, 90); });

  ctx.textAlign = "center"; ctx.fillStyle = INK;
  ctx.font = "44px sans-serif"; ctx.fillText("プロ診断 × アプリ", W / 2, 300);
  ctx.font = `110px ${SERIF}`; ctx.fillText("答え合わせ", W / 2, 440);

  const card = (x, label, v) => {
    const w = 440, h = 420, y = 540, acc = SEASON[v.first].accent;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = acc; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 40); ctx.fill(); ctx.stroke();
    ctx.fillStyle = acc; ctx.beginPath(); ctx.roundRect(x, y, w, 90, [40, 40, 0, 0]); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 40px sans-serif"; ctx.fillText(label, x + w / 2, y + 60);
    ctx.fillStyle = INK; ctx.font = `92px ${SERIF}`; ctx.fillText(SEASON[v.first].name, x + w / 2, y + 250);
    ctx.fillStyle = SUB; ctx.font = "40px sans-serif"; ctx.fillText("2nd " + (v.second ? SEASON[v.second].name : "—"), x + w / 2, y + 340);
  };
  card(80, "プロ診断", pro);
  card(560, "アプリ", app);

  ctx.fillStyle = firstMatch ? "#7D2E46" : "#5b6b8a";
  ctx.font = `170px ${SERIF}`;
  ctx.fillText(firstMatch ? "一致！" : "ちがった！", W / 2, 1210);

  if (stats && stats.total) {
    ctx.fillStyle = INK; ctx.font = "48px sans-serif";
    ctx.fillText(`みんなの一致率 ${pct(stats.first_rate)}（${stats.total}人中）`, W / 2, 1360);
  }

  ctx.fillStyle = SUB; ctx.font = "44px sans-serif";
  ctx.fillText(KOTAE.hashtag, W / 2, 1640);
  ctx.fillText(mentionFor(app.first), W / 2, 1710);
  ctx.fillStyle = FAINT; ctx.font = "36px sans-serif";
  ctx.fillText((site === "iebel" ? "iebel.jp" : "blubel.jp") + "/pages/personalcolor", W / 2, 1800);
  return cv;
}

async function saveKotaeStory(args) {
  const cv = buildKotaeStory(args);
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  const file = new File([blob], "kotaeawase.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "答え合わせ" }); return; } catch (e) { /* キャンセル時は保存にフォールバック */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "kotaeawase.png"; a.click();
  URL.revokeObjectURL(a.href);
}
