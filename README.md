# colorlab-embed

Shoppal Mart の記事本文に「貼るだけ」で動くよう、パーソナルカラー診断アプリ（v21）と
NG色警察（v2）を自己完結IIFEにビルドし、jsDelivr(CDN)で配信するためのリポジトリ。

- `dist/colorlab.iife.js` … 本家アプリ（12タイプ診断 / NGカラー / 手持ち服チェッカー / 試し塗り 等）
- `dist/ngpolice.iife.js` … NG色警察（違反切符 / 無罪放免証）
- `dist/mens.iife.js` … 清潔感カラー診断（メンズ版・商品導線なし）
- `snippet_colorlab.html` / `snippet_ngpolice.html` / `snippet_mens.html` … 記事に貼り付ける数行
- `test/local_article.html` … Shoppal記事を模したローカル検証ページ
- `test/screenshot.mjs` … Playwright検証（375px SS / localStorage再訪 / 画面遷移）
- `test/screenshot_mens.mjs` … メンズ版のPlaywright検証（全ツール通し / 商品語の不在 / Lite判定）

## メンズ版（清潔感カラー診断）

女性版とは**ソースを完全分離**した3つ目のビルドターゲット。女性版 `color_lab_stylist_v23.jsx`
には一切変更を加えない方針のため、アプリ内モード切替ではなく独立ビルドにしている。

| 項目 | 値 |
|---|---|
| ソース | `src/mens_stylist_v1.jsx` |
| エントリ / CSS | `src/mens-entry.jsx` / `src/base.mens.css` |
| グローバル名 / root id | `window.MensApp` / `#mens-root` |
| 出力 | `dist/mens.iife.js`（約 205KB / gzip 66KB） |
| 本番URL | `https://www.iebel.jp/pages/personalcolormens`（`VITE_MENS_PAGE_URL` で上書き可） |

搭載: 12タイプ診断 / タイプ別カラーコーデ提案（ビジネス・カジュアル・デート）/ NGカラー /
この色似合う？ / 髪色シミュレーション / 骨格診断 / ふたりの相性配色 / シェア画像。

方針上の制約:

- **商品・アフィリ・LINE導線は一切持たない。**出口は IG（@seiketsu_lab）フォローとスクショ推奨のみ。
  `test/screenshot_mens.mjs` が「楽天 / Amazon / 商品を見る / LINE」の文字列不在をアサートしている。
- 診断中は「ブルベ / イエベ」を出さず「青みタイプ / 黄みタイプ」。結果画面でのみ正式名称を併記する。
- 配色は清潔感研究所のIGレンダラと同一トークン（navy `#1F2A44` / accent `#9CBCE0` / accent2 `#5B7FAC`）。
- `base.mens.css` は女性版と違い h1/h2/p の `border`・`color`・`font-size` も打ち消している
  （記事側の `h1{border-bottom}` がタイトルに漏れるのを防ぐため）。

## 特徴

- React / ReactDOM / lucide-react を**すべてバンドルに内包**（外部CDN依存なし）
- Tailwind はビルド時にクラス抽出し **CSSをJSに内包**（実行時CDN不使用）
- 全ユーティリティを `#colorlab-root` / `#ngpolice-root` 配下に**スコープ**（Shoppal既存CSSと衝突しない・preflightは無効化）
- `window.ColorLabApp.mount("#colorlab-root")` / `window.NgPoliceApp.mount("#ngpolice-root")` で明示マウント
- フェーズ1: AI機能（顔写真診断 / コーデ提案 / コーデ採点）は `AI_ENABLED=false` で「近日公開」化。
  NG色警察の取り調べは AI の代わりに**ルールベース簡易判定**（写真中央領域の平均色相）で完走。
- AIゲートは**AI画面への入口5箇所すべて**に適用（ホーム3カード + 12タイプ結果ページCTA + 骨格結果ページCTA）。
  押下時は「近日公開」モーダルへ流す。`npm run verify` で `api.anthropic.com` へのリクエストが0件であることを実測。

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

`src/ng_color_police_v2.jsx` 冒頭の `MAIN_APP_URL_OVERRIDE` に、本家アプリ（v21）を設置した
ページのURLを入れて再ビルドすると、NG色警察内の「本家診断アプリへ」リンクがそのURLに差し替わる。
（ビルド時に `VITE_MAIN_APP_URL` 環境変数でも上書き可能）

## 本番設置URL（2026-07 稼働中・ブルベ側）

| アプリ | 本番URL |
|---|---|
| 本家（カラー診断アプリ） | https://www.blubel.jp/pages/personalcolor |
| NG色警察 | https://www.blubel.jp/pages/police |

## 現在の運用タグ

| アプリ | 参照タグ | jsDelivr |
|---|---|---|
| colorlab | `@v1.3.0` | `https://cdn.jsdelivr.net/gh/thecompany20220901-cpu/colorlab-embed@v1.3.0/dist/colorlab.iife.js` |
| ngpolice | `@v1.3.0` | `https://cdn.jsdelivr.net/gh/thecompany20220901-cpu/colorlab-embed@v1.3.0/dist/ngpolice.iife.js` |

- v1.3.0 で colorlab=v21 / ngpolice=v2 に更新し、**両アプリのタグを v1.3.0 に揃えた**。
- v1.3.0 の内容: colorlab v21（バッジ拡大 / スクロールトップ / シェア画像修正 / パレット10色 等）、
  ngpolice v2（結果ページのボタン2つのレイアウト修正）。
- 旧: colorlab `@v1.1.0`（v20）/ ngpolice `@v1.2.0`（v1）。

## 次回予定タスク（メモ）

1. **イエベ側の固定ページ設置** … 貼り付けるスニペットは同一（同じ jsDelivr URL）。両アプリとも `iebel`/`blubel` をアプリ内のタイプ選択で出し分ける作り＝**追加ビルド不要**。イエベ用の固定ページを作ってスニペットを貼るだけ。
2. **フェーズ2 = AI機能の解禁** … Cloudflare Workers 中継（APIキーを秘匿したプロキシ）を用意し、`AI_ENABLED` を `true` に切り替えて再ビルド。対象は「顔写真で診断」「コーデ提案」「今日のコーデ採点」（colorlab）と「NG警察のAI取り調べ」（ルールベース→AIへ）。解禁後はタグを上げてスニペット差し替え。
   - なお v21 のソースは AI画面の入口のうちホーム3カードしかゲートしておらず、12タイプ/骨格の結果ページCTAが素通りしていたため、本リポジトリ側で同じゲートを追加している（`src/color_lab_stylist_v21.jsx` の該当2箇所）。**次のバージョンを取り込む際も同じ2箇所の確認が必要**。
3. **ヘッダー微調整** … トップのパレット帯に「監修」文字が重なる箇所の微調整（帯の下の白余白へ寄せる等）。
4. **375px での文字折返し** … ホームの「近日公開」バッジが「近日公/開」で改行される、骨格結果ページの
   得意/注意カードのラベルが1文字ずつ縦に折り返る、の2点（いずれも v21 ソース側のレイアウト起因・要素は表示されている）。
