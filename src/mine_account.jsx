import React, { useState, useEffect, useRef } from "react";
import { mineFetch, readSession, writeSession } from "./mine_api.js";

/* ════════════════════════════════════════════
   MINE 会員画面（v1）

   入口: /pages/personalcolor?mine=account、またはログインメールのリンク（?mine_token=...）
   ・ログイン（メールアドレス → マジックリンク）
   ・会員状態の表示（無料会員 / 有料会員 / 未加入）
   ・EC購入者の無料会員申請（購入完了メールのスクショ添付 → 管理者が承認）
   有料プランの申し込みボタンはまだ置かない（有料機能の範囲が決まってから）。

   Tailwind に頼らずインラインスタイルで書く（kotaeawase.jsx と同じ理由）。
   ════════════════════════════════════════════ */

const INK = "#3a3340", SUB = "#7d7580", FAINT = "#a99fa8", LINE = "#e7dfe6", MAIN = "#7D2E46";
const SERIF = "'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif";
const PLAN_LABEL = {
  ec_free: "無料会員（BLUBEL / IEBEL でお買い物いただいた方）",
  paid: "有料会員",
  none: "未加入",
};
const IMAGE_MAX_SIDE = 1600;
const IMAGE_MAX_BYTES = 1_400_000;   // Worker 側の上限 1.5MB より少し下

const btn = (enabled = true) => ({
  width: "100%", padding: "14px 0", borderRadius: 999, border: "none", fontSize: 15, fontWeight: 600,
  background: enabled ? MAIN : "#d9d2d8", color: "#fff", cursor: enabled ? "pointer" : "default",
});
const input = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: `1px solid ${LINE}`, fontSize: 15, color: INK, background: "#fff" };
const label = { display: "block", fontSize: 13, fontWeight: 600, margin: "16px 0 6px" };

// URL から mine_token を取り出して消す（履歴やスクショに残さない）。
// 代わりに mine=account を置き、再読み込みしても会員ページのままにする
function takeTokenFromUrl() {
  try {
    const u = new URL(location.href);
    const t = u.searchParams.get("mine_token");
    if (!t) return null;
    u.searchParams.delete("mine_token");
    u.searchParams.set("mine", "account");
    history.replaceState(history.state, "", u.pathname + (u.search ? u.search : "") + u.hash);
    return t;
  } catch (e) { return null; }
}

// スクショを長辺1600pxの JPEG に縮める（通信量と D1 の1行上限のため）
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = url; });
    const k = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);   // 透過PNGの背景を白に
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const b = await new Promise((r) => cv.toBlob(r, "image/jpeg", q));
      if (b && b.size <= IMAGE_MAX_BYTES) return b;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

export function MineAccount({ site, onBack }) {
  const [phase, setPhase] = useState("loading");   // loading / login / sent / account
  const [session, setSession] = useState(readSession());
  const [info, setInfo] = useState(null);          // { user, application }
  const [err, setErr] = useState("");

  const loadStatus = async (s) => {
    const r = await mineFetch("/ec/status", { session: s });
    if (r.status === 401) { writeSession(""); setSession(""); setPhase("login"); return; }
    if (!r.ok) { setErr("会員情報を読み込めませんでした。時間をおいて開き直してください。"); setPhase("login"); return; }
    setInfo({ user: r.j.user, application: r.j.application });
    setPhase("account");
  };

  useEffect(() => {
    (async () => {
      const t = takeTokenFromUrl();
      if (t) {
        const r = await mineFetch("/auth/verify", { method: "POST", body: { token: t } });
        if (r.ok) { writeSession(r.j.session); setSession(r.j.session); await loadStatus(r.j.session); return; }
        setErr("ログインリンクの有効期限が切れているか、すでに使われています。もう一度メールを送ってください。");
        setPhase("login");
        return;
      }
      if (session) await loadStatus(session); else setPhase("login");
    })();
  }, []);

  const logout = async () => {
    await mineFetch("/auth/logout", { method: "POST", session }).catch(() => {});
    writeSession(""); setSession(""); setInfo(null); setPhase("login");
  };

  return (
    <div style={{ padding: "24px 22px 32px", color: INK }}>
      <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: SUB, fontSize: 13, cursor: "pointer", padding: 0 }}>← 戻る</button>
      <div style={{ fontSize: 12, color: SUB, letterSpacing: ".08em", marginTop: 12 }}>Color Lab MINE</div>
      <h2 style={{ fontFamily: SERIF, fontSize: 26, margin: "4px 0 6px", fontWeight: 500 }}>会員ページ</h2>
      {err && <p role="alert" style={{ fontSize: 13, color: "#b42318", lineHeight: 1.7 }}>{err}</p>}
      {phase === "loading" && <p style={{ fontSize: 13, color: FAINT }}>読み込み中…</p>}
      {phase === "login" && <LoginForm onSent={() => { setErr(""); setPhase("sent"); }} />}
      {phase === "sent" && (
        <p style={{ fontSize: 14, lineHeight: 1.8, marginTop: 14 }}>
          ログイン用のメールを送りました。<b>15分以内</b>にメールのリンクを開いてください。届かないときは迷惑メールフォルダもご確認ください。
        </p>
      )}
      {phase === "account" && info && (
        <>
          <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 16, background: "#faf7f9", border: `1px solid ${LINE}` }}>
            <div style={{ fontSize: 12, color: SUB }}>ログイン中</div>
            <div style={{ fontSize: 15, wordBreak: "break-all" }}>{info.user.email}</div>
            <div style={{ fontSize: 12, color: SUB, marginTop: 10 }}>会員の種類</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{PLAN_LABEL[info.user.plan] || PLAN_LABEL.none}</div>
          </div>
          {info.user.plan !== "ec_free" && (
            <EcApplication site={site} session={session} application={info.application} onDone={() => loadStatus(session)} />
          )}
          <button type="button" onClick={logout} style={{ display: "block", margin: "24px auto 0", background: "none", border: "none", color: SUB, fontSize: 13, textDecoration: "underline", cursor: "pointer" }}>
            ログアウト
          </button>
        </>
      )}
    </div>
  );
}

function LoginForm({ onSent }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await mineFetch("/auth/request", { method: "POST", body: { email: email.trim(), return_path: "/pages/personalcolor" } });
      if (r.ok) onSent();
      else if (r.j.reason === "too_soon") setMsg("1分ほど待ってからもう一度お試しください。");
      else if (r.j.reason === "mail_not_configured") setMsg("ただいまメールを送れません（準備中）。");
      else setMsg("送信できませんでした。アドレスを確かめて、もう一度お試しください。");
    } catch (e) { setMsg("通信に失敗しました。"); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 13, color: SUB, lineHeight: 1.7 }}>パスワードは不要です。メールアドレスあてに届くリンクを開くとログインできます。</p>
      <label style={label} htmlFor="mine-email">メールアドレス</label>
      <input id="mine-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
      <button type="button" disabled={!valid || busy} onClick={submit} style={{ ...btn(valid && !busy), marginTop: 16 }}>
        {busy ? "送信中…" : "ログイン用のメールを送る"}
      </button>
      {msg && <p role="alert" style={{ fontSize: 13, color: "#b42318", marginTop: 10 }}>{msg}</p>}
    </div>
  );
}

function EcApplication({ site, session, application, onDone }) {
  const [shopSite, setShopSite] = useState(site === "iebel" ? "iebel" : "blubel");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [orderEmail, setOrderEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (application && application.status === "pending") {
    return (
      <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 16, border: `1px solid ${LINE}` }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>無料会員の申請：確認中です</div>
        <p style={{ fontSize: 13, color: SUB, lineHeight: 1.7, margin: "6px 0 0" }}>
          {new Date(application.created_at * 1000).toLocaleDateString("ja-JP")} に受け付けました。確認が済むと、この画面の「会員の種類」が無料会員に変わります。
        </p>
      </div>
    );
  }

  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f)); setMsg("");
  };

  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const small = await shrinkImage(file).catch(() => null);
      if (!small) { setMsg("画像を読み込めませんでした。スクリーンショット（JPEG / PNG）を選んでください。"); setBusy(false); return; }
      const fd = new FormData();
      fd.append("site", shopSite);
      fd.append("image", small, "order.jpg");
      if (orderEmail.trim()) fd.append("order_email", orderEmail.trim());
      if (orderNumber.trim()) fd.append("order_number", orderNumber.trim());
      if (note.trim()) fd.append("note", note.trim());
      const r = await mineFetch("/ec/apply", { method: "POST", session, form: fd });
      if (r.ok) { onDone(); return; }
      setMsg(r.j.reason === "bad_email" ? "注文時のメールアドレスの形式を確かめてください。" : "申請できませんでした。時間をおいてもう一度お試しください。");
    } catch (e) { setMsg("通信に失敗しました。"); }
    setBusy(false);
  };

  const radio = (v, text) => (
    <label style={{ flex: 1, padding: "10px 0", textAlign: "center", borderRadius: 12, cursor: "pointer", fontSize: 14,
      border: `1.5px solid ${shopSite === v ? MAIN : LINE}`, background: shopSite === v ? MAIN + "12" : "#fff", fontWeight: shopSite === v ? 600 : 400 }}>
      <input type="radio" name="mine-shop" value={v} checked={shopSite === v} onChange={() => setShopSite(v)} style={{ marginRight: 6 }} />{text}
    </label>
  );

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>BLUBEL / IEBEL でお買い物いただいた方へ</div>
      <p style={{ fontSize: 13, color: SUB, lineHeight: 1.7, margin: "6px 0 0" }}>
        購入完了メールのスクリーンショットを送ってください。確認が済むと無料会員になります（確認には数日かかることがあります）。
      </p>
      {application && application.status === "rejected" && (
        <div role="alert" style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "#fff4f2", fontSize: 13, lineHeight: 1.7 }}>
          前回の申請は確認できませんでした：{application.reject_reason}
        </div>
      )}

      <span style={label}>購入したサイト</span>
      <div style={{ display: "flex", gap: 8 }}>{radio("blubel", "BLUBEL")}{radio("iebel", "IEBEL")}</div>

      <label style={label} htmlFor="mine-shot">購入完了メールのスクリーンショット<span style={{ color: "#C0392B" }}>＊</span></label>
      <input id="mine-shot" ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ fontSize: 13 }} />
      {preview && <img src={preview} alt="選んだスクリーンショット" style={{ display: "block", maxWidth: 160, maxHeight: 220, marginTop: 10, borderRadius: 8, border: `1px solid ${LINE}` }} />}

      <label style={label} htmlFor="mine-order-email">注文時のメールアドレス（ログイン用と違う場合だけ）</label>
      <input id="mine-order-email" type="email" value={orderEmail} onChange={(e) => setOrderEmail(e.target.value)} style={input} />
      <label style={label} htmlFor="mine-order-no">注文番号（わかれば）</label>
      <input id="mine-order-no" type="text" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} style={input} />
      <label style={label} htmlFor="mine-note">メモ（任意）</label>
      <textarea id="mine-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, resize: "vertical" }} />

      <p style={{ fontSize: 11, color: FAINT, lineHeight: 1.7, marginTop: 12 }}>
        スクリーンショットに氏名や住所が写っていてもかまいません。確認のためだけに使い、確認が済んだ時点で削除します。
      </p>
      <button type="button" disabled={!file || busy} onClick={submit} style={{ ...btn(!!file && !busy), marginTop: 8 }}>
        {busy ? "送信中…" : "申請する"}
      </button>
      {msg && <p role="alert" style={{ fontSize: 13, color: "#b42318", marginTop: 10 }}>{msg}</p>}
    </div>
  );
}
