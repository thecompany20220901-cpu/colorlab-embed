import "./base.ngpolice.css";
import React from "react";
import { createRoot } from "react-dom/client";
import NgColorPolice from "./ng_color_police_v1.jsx";

// window.NgPoliceApp.mount("#ngpolice-root") で起動する。
function mount(target) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) {
    console.error("[NgPoliceApp] マウント先が見つかりません:", target);
    return null;
  }
  el.innerHTML = "";
  const root = createRoot(el);
  root.render(React.createElement(NgColorPolice));
  return root;
}

if (typeof window !== "undefined") {
  window.NgPoliceApp = window.NgPoliceApp || {};
  window.NgPoliceApp.mount = mount;
}

export { mount };
