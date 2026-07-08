# colorlab-embed

Shoppal Mart の記事本文に「貼るだけ」で動くよう、パーソナルカラー診断アプリ（v19）と
NG色警察を自己完結IIFEにビルドし、jsDelivr(CDN)で配信するためのリポジトリ。

- `dist/colorlab.iife.js` … 本家アプリ（12タイプ診断 / NGカラー / 手持ち服チェッカー / 試し塗り 等）
- `dist/ngpolice.iife.js` … NG色警察（違反切符 / 無罪放免証）
- `snippet_colorlab.html` / `snippet_ngpolice.html` … 記事に貼り付ける数行
- `test/local_article.html` … Shoppal記事を模したローカル検証ページ
- `test/screenshot.mjs` … Playwright検証（375px SS / localStorage再訪 / 画面遷移）

## 特徴

- React / ReactDOM / lucide-react を**すべてバンドルに内包**（外部CDN依存なし）
- Tailwind はビルド時にクラス抽出し **CSSをJSに内包**（実行時CDN不使用）
- 全ユーティリティを `#colorlab-root` / `#ngpolice-root` 配下に**スコープ**（Shoppal既存CSSと衝突しない・preflightは無効化）
- `window.ColorLabApp.mount("#colorlab-root")` / `window.NgPoliceApp.mount("#ngpolice-root")` で明示マウント
- フェーズ1: AI機能（顔写真診断 / コーデ提案 / コーデ採点）は `AI_ENABLED=false` で「近日公開」化。
  NG色警察の取り調べは AI の代わりに**ルールベース簡易判定**（写真中央領域の平均色相）で完走。

## ビルド

```bash
npm install
npm run build      # dist/ に colorlab.iife.js と ngpolice.iife.js を出力
npm run verify     # Playwrightで検証（要 npx playwright install chromium）
```

## 記事への埋め込み

`snippet_colorlab.html` / `snippet_ngpolice.html` の中身をそのまま記事本文に貼り付ける。
更新時は**必ずタグを上げて**（例 `@v1.0.1`）スニペットのURLも差し替える（`@main`はCDNキャッシュで反映が遅いため使わない）。

## NG色警察の本家リンク差し替え

`src/ng_color_police_v1.jsx` 冒頭の `MAIN_APP_URL_OVERRIDE` に、本家アプリ（v19）を設置した
記事のURLを入れて再ビルドすると、NG色警察内の「本家診断アプリへ」リンクがそのURLに差し替わる。
（ビルド時に `VITE_MAIN_APP_URL` 環境変数でも上書き可能）
