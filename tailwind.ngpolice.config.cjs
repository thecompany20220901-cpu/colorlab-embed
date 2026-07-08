/** Tailwind (ngpolice) — 記事埋め込み用スコープ設定
 *  ユーティリティを #ngpolice-root 配下に限定。preflight は無効化。
 */
module.exports = {
  content: ["./src/ng_color_police_v1.jsx", "./src/ngpolice-entry.jsx"],
  important: "#ngpolice-root",
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
