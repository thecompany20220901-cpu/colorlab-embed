/** Tailwind (colorlab) — 記事埋め込み用スコープ設定
 *  important セレクタで全ユーティリティを #colorlab-root 配下に限定し、
 *  Shoppal既存CSSと相互に衝突しないようにする。preflight は無効化（記事全体の
 *  リセット漏れを防ぐ。最小リセットは base.colorlab.css でルート配下のみに適用）。
 */
module.exports = {
  content: ["./src/color_lab_stylist_v21.jsx", "./src/colorlab-entry.jsx"],
  important: "#colorlab-root",
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
