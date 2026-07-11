import "./base.colorlab.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./color_lab_stylist_v23.jsx";

// 記事に貼るだけで動く明示的マウント関数。
// window.ColorLabApp.mount("#colorlab-root") で起動する。
function mount(target) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) {
    console.error("[ColorLabApp] マウント先が見つかりません:", target);
    return null;
  }
  el.innerHTML = "";
  const root = createRoot(el);
  root.render(React.createElement(App));
  return root;
}

if (typeof window !== "undefined") {
  window.ColorLabApp = window.ColorLabApp || {};
  window.ColorLabApp.mount = mount;
}

export { mount };
