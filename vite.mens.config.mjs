import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const tailwind = require("tailwindcss");
const autoprefixer = require("autoprefixer");
const twConfig = require("./tailwind.mens.config.cjs");

// React/ReactDOM/lucide-react を内包した自己完結IIFEを1ファイル出力。
// CSS(build時に抽出したTailwind)は vite-plugin-css-injected-by-js で JS に内包。
export default defineConfig({
  plugins: [react(), cssInjectedByJs()],
  // ライブラリモードでは process.env.NODE_ENV が置換されず react-dom が
  // 「process is not defined」で落ちるため、明示的に production を注入する。
  define: { "process.env.NODE_ENV": '"production"' },
  css: { postcss: { plugins: [tailwind(twConfig), autoprefixer()] } },
  build: {
    // 他ターゲットの出力を消さない（clean は npm script 側に集約）。
    emptyOutDir: false,
    target: "es2018",
    // 画像は必ず base64 でJSに内包する。CDN(jsDelivr)から配信されるスクリプトを
    // 設置ページ(iebel.jp)上で実行するため、相対パスの外部アセットは
    // ページ側ドメインに解決されて404になる。単一<script>構成を崩さないための必須設定。
    assetsInlineLimit: 1024 * 1024,
    lib: {
      entry: "src/mens-entry.jsx",
      name: "MensApp",
      formats: ["iife"],
      fileName: () => "mens.iife.js",
    },
    rollupOptions: { output: { extend: true, inlineDynamicImports: true } },
  },
});
