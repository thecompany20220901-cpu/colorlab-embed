// EC購入者申請の承認画面（GET /admin で Worker 自身が返す）。
// 外部の CSS/JS は読まない（CSP で 'self' 以外への通信を禁止している）。
// 申請者が入力した文字列は必ず textContent で入れる（innerHTML に流さない）。
export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>MINE EC購入者申請の承認</title>
<style>
:root{--ink:#3a3340;--sub:#7d7580;--line:#e7dfe6;--main:#7D2E46;--ok:#1a7f37;--ng:#b42318;--bg:#faf8f9}
*{box-sizing:border-box}body{margin:0;font:14px/1.6 system-ui,'Hiragino Sans','Yu Gothic',sans-serif;color:var(--ink);background:var(--bg)}
header{background:#fff;border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
h1{font-size:16px;margin:0}main{max-width:900px;margin:0 auto;padding:16px}
button{font:inherit;border-radius:8px;border:1px solid var(--line);background:#fff;padding:6px 12px;cursor:pointer}
button.p{background:var(--main);border-color:var(--main);color:#fff}button.ok{background:var(--ok);border-color:var(--ok);color:#fff}button.ng{color:var(--ng);border-color:var(--ng)}
button[aria-selected=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
input,textarea{font:inherit;border:1px solid var(--line);border-radius:8px;padding:6px 10px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0;display:grid;grid-template-columns:1fr 220px;gap:14px}
@media(max-width:640px){.card{grid-template-columns:1fr}}
dl{display:grid;grid-template-columns:8em 1fr;gap:2px 10px;margin:0}dt{color:var(--sub)}dd{margin:0;word-break:break-all}
.shot{width:100%;border:1px solid var(--line);border-radius:8px;cursor:zoom-in;background:#f3f0f2;min-height:80px}
.acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:flex-start}.acts textarea{flex:1;min-width:200px}
.msg{color:var(--sub)}.err{color:var(--ng)}
#big{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center;padding:16px}
#big img{max-width:100%;max-height:100%}
</style></head><body>
<header><h1>MINE EC購入者申請の承認</h1><span id="who" class="msg"></span></header>
<main>
  <section id="login">
    <p>管理用トークンを入力してください（Workers Secret の ADMIN_TOKEN）。このタブを閉じると消えます。</p>
    <input id="tok" type="password" autocomplete="off" size="40" aria-label="管理用トークン"> <button class="p" id="go">開く</button>
    <p id="lerr" class="err"></p>
  </section>
  <section id="app" hidden>
    <div role="tablist" style="display:flex;gap:8px;flex-wrap:wrap">
      <button role="tab" data-st="pending" aria-selected="true">確認待ち</button>
      <button role="tab" data-st="approved" aria-selected="false">承認済み</button>
      <button role="tab" data-st="rejected" aria-selected="false">却下</button>
      <button role="tab" data-st="kotae" aria-selected="false">答え合わせ集計</button>
      <button id="reload">再読み込み</button>
      <button id="out">トークンを消す</button>
    </div>
    <p class="msg" style="margin:10px 0 0">承認すると、その会員は無料会員（EC購入者）になります。承認・却下のどちらでも、添付のスクショはその時点で削除されます。</p>
    <div id="list"></div>
  </section>
</main>
<div id="big" role="dialog" aria-label="拡大表示"><img alt="購入完了メールのスクショ（拡大）"></div>
<script>
(function () {
  var KEY = "mine_admin_token", st = "pending", urls = [];
  var $ = function (id) { return document.getElementById(id); };
  var tok = function () { try { return sessionStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
  function api(path, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ Authorization: "Bearer " + tok() }, opt.headers || {});
    return fetch("/admin/api" + path, opt);
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function fmt(t) { return t ? new Date(t * 1000).toLocaleString("ja-JP") : "—"; }
  function row(dl, k, v) { dl.appendChild(el("dt", null, k)); dl.appendChild(el("dd", null, v == null || v === "" ? "—" : String(v))); }

  var SEASON = { spring: "イエベ春", summer: "ブルベ夏", autumn: "イエベ秋", winter: "ブルベ冬" };
  var ORDER = ["spring", "summer", "autumn", "winter"];
  function pct(r) { return r == null ? "—" : Math.round(r * 100) + "%"; }

  // 答え合わせの集計（画面で非公開のあいだも、ここでは数字を見られる）
  function loadKotae() {
    var list = $("list"); list.textContent = "読み込み中…";
    api("/kotae-stats").then(function (r) {
      if (r.status === 401 || r.status === 429) { showLogin(r.status === 429 ? "失敗が続いたため1時間ロックされています" : "トークンが違います"); return null; }
      return r.json();
    }).then(function (j) {
      if (!j) return;
      list.textContent = "";
      if (!j.ok) { list.appendChild(el("p", { class: "msg" }, "キャンペーンが設定されていません。")); return; }
      var s = j.stats, c = el("article", { class: "card", style: "grid-template-columns:1fr" }), d = el("div");
      d.appendChild(el("div", { style: "font-weight:600;margin-bottom:6px" }, "答え合わせ集計（" + j.campaign + "）"));
      d.appendChild(el("p", { class: "msg", style: "margin:0 0 8px" }, j.public ? "アプリの画面に公開中" : "アプリの画面では非公開（Worker の KOTAE_STATS_PUBLIC を \"1\" にすると公開）"));
      var dl = el("dl");
      row(dl, "実施期間", s.period && s.period.start ? s.period.start + " 〜 " + s.period.end + "（" + s.period.status + "）" : "未設定");
      row(dl, "回答数", s.total);
      row(dl, "1st 一致", s.first_match + " / " + s.total + "（" + pct(s.first_rate) + "）");
      row(dl, "2nd まで一致", s.full_match + " / " + s.full_total + "（" + pct(s.full_rate) + "・2nd を入力した人）");
      row(dl, "最終回答", s.last_at ? fmt(s.last_at) : "—");
      d.appendChild(dl);
      var t = el("table", { style: "border-collapse:collapse;margin-top:12px;font-size:13px" }), hr = el("tr");
      hr.appendChild(el("th", { style: "text-align:left;padding:4px 10px;color:#7d7580" }, "プロ ＼ アプリ"));
      ORDER.forEach(function (a) { hr.appendChild(el("th", { style: "padding:4px 10px;color:#7d7580" }, SEASON[a])); });
      t.appendChild(hr);
      ORDER.forEach(function (p) {
        var tr = el("tr");
        tr.appendChild(el("td", { style: "padding:4px 10px;color:#7d7580" }, SEASON[p]));
        ORDER.forEach(function (a) { tr.appendChild(el("td", { style: "padding:4px 10px;text-align:center;" + (p === a ? "font-weight:700;background:#f3eef2" : "") }, String(s.matrix[p][a]))); });
        t.appendChild(tr);
      });
      d.appendChild(t);
      c.appendChild(d); list.appendChild(c);
    }).catch(function () { list.textContent = "読み込みに失敗しました。"; });
  }

  function load() {
    urls.forEach(function (u) { URL.revokeObjectURL(u); }); urls = [];
    if (st === "kotae") { loadKotae(); return; }
    var list = $("list"); list.textContent = "読み込み中…";
    api("/applications?status=" + st).then(function (r) {
      if (r.status === 401 || r.status === 429) { showLogin(r.status === 429 ? "失敗が続いたため1時間ロックされています" : "トークンが違います"); return null; }
      return r.json();
    }).then(function (j) {
      if (!j) return;
      list.textContent = "";
      if (!j.applications.length) { list.appendChild(el("p", { class: "msg" }, "該当する申請はありません。")); return; }
      j.applications.forEach(function (a) { list.appendChild(card(a)); });
    }).catch(function () { list.textContent = "読み込みに失敗しました。"; });
  }

  function card(a) {
    var c = el("article", { class: "card" }), left = el("div"), right = el("div");
    left.appendChild(el("div", { style: "font-weight:600;margin-bottom:6px" }, "申請 #" + a.id + "（" + (a.site === "iebel" ? "IEBEL" : "BLUBEL") + "）"));
    var dl = el("dl");
    row(dl, "申請日時", fmt(a.created_at));
    row(dl, "ログイン用メール", a.login_email);
    row(dl, "注文時のメール", a.order_email || "（ログイン用と同じ）");
    row(dl, "注文番号", a.order_number);
    row(dl, "メモ", a.note);
    if (a.status !== "pending") { row(dl, "判断日時", fmt(a.reviewed_at)); if (a.reject_reason) row(dl, "却下の理由", a.reject_reason); }
    left.appendChild(dl);

    if (a.status === "pending") {
      var acts = el("div", { class: "acts" });
      var ok = el("button", { class: "ok" }, "承認する");
      var reason = el("textarea", { rows: "2", placeholder: "却下の理由（申請者に表示されます）", "aria-label": "却下の理由" });
      var ng = el("button", { class: "ng" }, "却下する");
      var msg = el("span", { class: "err" });
      ok.onclick = function () { if (confirm("申請 #" + a.id + " を承認して無料会員にしますか？")) decide(a.id, "approve", null, msg); };
      ng.onclick = function () {
        if (!reason.value.trim()) { msg.textContent = "却下の理由を入力してください"; reason.focus(); return; }
        if (confirm("申請 #" + a.id + " を却下しますか？")) decide(a.id, "reject", reason.value, msg);
      };
      acts.appendChild(ok); acts.appendChild(reason); acts.appendChild(ng); acts.appendChild(msg);
      left.appendChild(acts);
    }

    if (a.has_image) {
      var img = el("img", { class: "shot", alt: "購入完了メールのスクショ（申請 #" + a.id + "）" });
      api("/applications/" + a.id + "/image").then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
        if (!b) return; var u = URL.createObjectURL(b); urls.push(u); img.src = u;
      });
      img.onclick = function () { if (!img.src) return; $("big").querySelector("img").src = img.src; $("big").style.display = "flex"; };
      right.appendChild(img);
    } else {
      right.appendChild(el("p", { class: "msg" }, "スクショは判断後に削除済み"));
    }
    c.appendChild(left); c.appendChild(right);
    return c;
  }

  function decide(id, decision, reason, msg) {
    msg.textContent = "送信中…";
    api("/applications/" + id + "/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: decision, reason: reason }) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) { if (x.r.ok) load(); else msg.textContent = "失敗しました（" + (x.j.reason || x.r.status) + "）"; })
      .catch(function () { msg.textContent = "通信に失敗しました"; });
  }

  function showLogin(err) { $("app").hidden = true; $("login").hidden = false; $("lerr").textContent = err || ""; $("who").textContent = ""; }
  function showApp() { $("login").hidden = true; $("app").hidden = false; $("who").textContent = "ログイン中"; load(); }

  $("go").onclick = function () { try { sessionStorage.setItem(KEY, $("tok").value.trim()); } catch (e) {} $("tok").value = ""; showApp(); };
  $("tok").onkeydown = function (e) { if (e.key === "Enter") $("go").click(); };
  $("out").onclick = function () { try { sessionStorage.removeItem(KEY); } catch (e) {} showLogin(); };
  $("reload").onclick = load;
  $("big").onclick = function () { $("big").style.display = "none"; };
  Array.prototype.forEach.call(document.querySelectorAll("[role=tab]"), function (b) {
    b.onclick = function () {
      st = b.getAttribute("data-st");
      Array.prototype.forEach.call(document.querySelectorAll("[role=tab]"), function (x) { x.setAttribute("aria-selected", String(x === b)); });
      load();
    };
  });
  if (tok()) showApp(); else showLogin();
})();
</script></body></html>`;
