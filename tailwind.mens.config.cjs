// content は glob ではなく実ファイル列挙。ファイルを足したら必ずここにも足すこと
// （列挙漏れ＝そのファイルのクラスが黙ってバンドルから落ちる）。
module.exports = {
  content: ["./src/mens_stylist_v1.jsx", "./src/mens-entry.jsx"],
  important: "#mens-root",
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
