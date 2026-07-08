# Claude Code 指示書: v19アプリのShoppal記事埋め込みビルド

作成日: 2026-07-08
発注者: Keisuke
前提確認済み: blubel.jp の記事本文内で `<script>` が実行される（blubel.jp/articles/1060 で検証済み）

---

## 0. ゴール

`color_lab_stylist_v19.jsx`（本家アプリ）と `ng_color_police_v1.jsx`（NG色警察）を、
**Shoppal Martの記事本文に貼るだけで動く形**にビルドし、貼り付け用スニペットを出力する。

成果物:
1. `dist/colorlab.iife.js` / `dist/ngpolice.iife.js` … 自己完結バンドル
2. `snippet_colorlab.html` / `snippet_ngpolice.html` … 記事に貼る3〜5行
3. `test/local_article.html` … 記事貼り付けを再現したローカル検証ページ
4. GitHubリポジトリへのpushとjsDelivr URLの確定

## 1. 配信構成

- 新規GitHubリポジトリ（例: `colorlab-embed`、public）を作成しビルド成果物をpush
- 記事からは jsDelivr CDN で読み込む:
  `https://cdn.jsdelivr.net/gh/{user}/colorlab-embed@{tag}/dist/colorlab.iife.js`
- **必ずタグ（@v1.0.0 等）でバージョン固定**。更新時はタグを上げてスニペット差し替え
  （@mainはjsDelivrのキャッシュで反映が遅れるため使わない）

## 2. ビルド仕様

- ビルダー: Vite（library mode, format: iife）または esbuild。React/ReactDOM/lucide-react を**すべてバンドルに内包**（外部CDN依存なし）
- Tailwind: 実行時CDNは使わない。ビルド時にクラスを抽出して**CSSをJSに内包**
  （vite-plugin-css-injected-by-js等でstyleタグ注入）。Shoppal側の既存CSSと衝突しないよう、
  アプリのルート要素配下にスコープするprefix設定を入れること
- マウント: `window.ColorLabApp.mount("#colorlab-root")` のような明示的マウント関数を公開
- 文字コード: UTF-8。日本語テキストが化けないことを検証に含める

## 3. コード改修（ビルド前に v19 / NG警察へ適用）

1. **window.storage → localStorage 置換**（v19のみ）:
   `window.storage.get/set/delete` を localStorage ベースの同等関数に差し替える
   （try-catch維持、キー名 `colorlab-profile` は据え置き）
2. **AI機能をLiteモード化**（フェーズ1）:
   - 対象: v19の「顔写真で診断」「コーデ提案AI」「今日のコーデ採点」、NG警察の取り調べAI
   - `const AI_ENABLED = false;` のフラグで制御。オフ時のUI:
     - v19: 対象3機能のメニューカードに「近日公開」バッジを付け、タップ時は
       「AI機能は近日公開！まずは12タイプ診断から」のモーダル→診断へ誘導
     - NG警察: AIの代わりに**ルールベース簡易判定**で動かす。写真の中央領域の
       平均色相をcanvasで取得し、タイプのNG色相域なら検挙、それ以外は無罪
       （判定精度よりアプリとして完走することを優先。文言は既存のJSON形式に合わせて
       タイプ別に3パターンずつハードコード）
3. **MAIN_APP_URL の差し替え**: NG警察内の本家リンクを、本家アプリ設置記事のURLに
   （記事IDが未確定のため、ビルド引数 or 定数で差し替えやすくしておく）
4. UTMは現状のまま維持（colorapp / ngpolice）

## 4. 記事貼り付けスニペット（出力形式）

```html
<!-- ここからカラー診断アプリ -->
<div id="colorlab-root">アプリを読み込み中…</div>
<script src="https://cdn.jsdelivr.net/gh/{user}/colorlab-embed@v1.0.0/dist/colorlab.iife.js"></script>
<script>window.ColorLabApp.mount("#colorlab-root");</script>
<!-- ここまで -->
```

- 読み込み失敗時に「読み込み中…」のまま止まらないよう、onerrorで
  「再読み込みしてください」表示を出す1行も含めること

## 5. 検証（必須）

1. `test/local_article.html`（Shoppal記事を模した素のHTML＋適当な既存CSS入り）で
   両アプリが表示・全画面遷移できること
2. スマホ幅375pxでレイアウト崩れがないこと（Playwrightでスクリーンショット取得）
3. localStorage保存→リロード→「おかえり」表示が出ること
4. バンドルサイズをログに出す（目安: gzip後500KB以下。超える場合は
   lucide-reactのアイコンを使用分のみimportしているか確認）
5. 検証スクリーンショット一式を `test/screenshots/` に出力

## 6. やらないこと

- Shoppal管理画面への貼り付け（発注者が手動で行う）
- Cloudflare Workers中継（フェーズ2で別指示）
- イエベ版の色違い展開（本家v19は両対応済みのため不要）

## 7. 完了報告に含めるもの

- jsDelivrの確定URL（タグ付き）
- 貼り付けスニペット2種の全文
- 検証スクリーンショットのパスとバンドルサイズ
- NG警察のルールベース判定の精度に関する所感（フェーズ2でAI化する際の参考）
