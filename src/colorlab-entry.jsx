import "./base.colorlab.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./color_lab_stylist_v23.jsx";
import { KotaeStats } from "./kotaeawase.jsx";

/* ════════════════════════════════════════════
   マウント方式（v1.12.0〜）

   設置先の blubel.jp / iebel.jp は Next.js の SPA。
   トップのバナーなどサイト内リンクから来ると「クライアント遷移」になり、
   ページ本文に貼った <script> は **ブラウザ仕様上まったく実行されない**
   （React が innerHTML 相当で差し込むため）。その結果
   #colorlab-root が「アプリを読み込み中…」のまま残る。

   そこで、
     1. このスクリプトは**サイト共通ヘッダー**に置いて常時読み込ませる
     2. #colorlab-root が現れたら**自分で気づいてマウントする**（自動マウント）
     3. SPA の再描画で中身を消されたら**貼り直す**（MutationObserver）
   という作りにした。スニペット側の明示 mount() 呼び出しも従来どおり動く。
   ════════════════════════════════════════════ */

const ROOT_ID = "colorlab-root";
const MOUNTED_FLAG = "data-colorlab-mounted";

let mountedEl = null;
let mountedRoot = null;

// 答え合わせキャンペーン（MINE v1）。どちらか一方で有効になる:
//   ・本文の <div id="colorlab-root" data-mode="kotaeawase">（LP を GTM の読み込み対象に足した場合）
//   ・/pages/personalcolor?campaign=kotaeawase（GTM を変えずに今のページで出す場合）
const CAMPAIGNS = ["kotaeawase"];
function campaignOf(el) {
  try {
    const a = el && el.getAttribute("data-mode");
    if (CAMPAIGNS.includes(a)) return a;
    const q = new URLSearchParams(location.search).get("campaign");
    return CAMPAIGNS.includes(q) ? q : null;
  } catch (e) { return null; }
}

function mount(target) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) {
    console.error("[ColorLabApp] マウント先が見つかりません:", target);
    return null;
  }
  // 同じ要素に二重マウントしない（スニペットの明示呼び出しと自動マウントが重なっても安全）
  if (el === mountedEl && el.getAttribute(MOUNTED_FLAG) === "1" && el.firstElementChild) return mountedRoot;
  // 貼り直す前に必ず古いルートを片付ける（同じ要素を SPA に innerHTML で書き戻された場合も含む）
  if (mountedRoot) {
    try { mountedRoot.unmount(); } catch (e) { /* すでにDOMから外れている場合は無視 */ }
    if (mountedEl && mountedEl !== el) mountedEl.removeAttribute(MOUNTED_FLAG);
    mountedRoot = null;
  }
  el.innerHTML = "";
  const root = createRoot(el);
  root.render(React.createElement(App, { campaign: campaignOf(el) }));
  el.setAttribute(MOUNTED_FLAG, "1");
  mountedEl = el;
  mountedRoot = root;
  return root;
}

/* #colorlab-root があって、まだ中身が無ければマウントする。
   SPA の再描画で中身を消された場合もここで拾って貼り直す。 */
function autoMount() {
  if (typeof document === "undefined") return;
  const el = document.getElementById(ROOT_ID);
  if (!el) return;
  // firstChild ではなく firstElementChild を見る。SPA がプレースホルダ文字列
  // （テキストノード）に書き戻したとき、firstChild だと「生きている」と誤判定するため。
  const alive = el === mountedEl && el.getAttribute(MOUNTED_FLAG) === "1" && el.firstElementChild;
  if (alive) return;
  mount(el);
}

/* LP に置く集計欄（<div id="colorlab-kotae-stats"></div>）。アプリ本体とは別のルートで、
   同じく SPA の再描画で消されたら貼り直す。 */
const STATS_ID = "colorlab-kotae-stats";
let statsEl = null;
let statsRoot = null;
function autoMountStats() {
  if (typeof document === "undefined") return;
  const el = document.getElementById(STATS_ID);
  if (!el) return;
  if (el === statsEl && el.firstElementChild) return;
  if (statsRoot) { try { statsRoot.unmount(); } catch (e) {} statsRoot = null; }
  el.innerHTML = "";
  statsRoot = createRoot(el);
  statsRoot.render(React.createElement(KotaeStats));
  statsEl = el;
}

if (typeof window !== "undefined") {
  window.ColorLabApp = window.ColorLabApp || {};
  window.ColorLabApp.mount = mount;
  window.ColorLabApp.autoMount = autoMount;

  if (!window.ColorLabApp.__watching) {
    window.ColorLabApp.__watching = true;

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { autoMount(); autoMountStats(); });
    else { autoMount(); autoMountStats(); }

    // SPA のルート変更・再描画に追従する。自前の再描画で毎回走らないよう、
    // 「マウント先が入れ替わった / 中身が消えた」ときだけ実際に貼り直す（autoMount 内で判定）。
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; autoMount(); autoMountStats(); }, 150);
    };
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    }
    // pushState/replaceState による遷移も拾う（Next.js の router.push 等）
    ["pushState", "replaceState"].forEach((k) => {
      const orig = history[k];
      if (typeof orig !== "function") return;
      history[k] = function () { const r = orig.apply(this, arguments); schedule(); return r; };
    });
    window.addEventListener("popstate", schedule);
  }
}

export { mount, autoMount };
