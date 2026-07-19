import "./base.mens.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./mens_stylist_v1.jsx";

// 記事／固定ページに貼るだけで動く明示的マウント関数。
// window.MensApp.mount("#mens-root") で起動する。
function mount(target) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) {
    console.error("[MensApp] マウント先が見つかりません:", target);
    return null;
  }
  el.innerHTML = "";
  const root = createRoot(el);
  root.render(React.createElement(App));
  return root;
}

if (typeof window !== "undefined") {
  window.MensApp = window.MensApp || {};
  window.MensApp.mount = mount;
}

export { mount };
