import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const tailwind = require("tailwindcss");
const autoprefixer = require("autoprefixer");
const twConfig = require("./tailwind.ngpolice.config.cjs");

export default defineConfig({
  plugins: [react(), cssInjectedByJs()],
  // ライブラリモードでは process.env.NODE_ENV が置換されず react-dom が
  // 「process is not defined」で落ちるため、明示的に production を注入する。
  define: { "process.env.NODE_ENV": '"production"' },
  css: { postcss: { plugins: [tailwind(twConfig), autoprefixer()] } },
  build: {
    emptyOutDir: false,
    target: "es2018",
    lib: {
      entry: "src/ngpolice-entry.jsx",
      name: "NgPoliceApp",
      formats: ["iife"],
      fileName: () => "ngpolice.iife.js",
    },
    rollupOptions: { output: { extend: true, inlineDynamicImports: true } },
  },
});
