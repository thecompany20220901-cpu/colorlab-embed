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

## 顔写真で診断（実測方式・v1.7.0〜）

AIに写真を見せて判断させる方式をやめ、**白い紙を基準にした照明補正 + CIELab の実測**に置き換えた。
外部通信は一切発生しない（`npm run verify` で `api.anthropic.com` 0件を実測）。

| 項目 | 内容 |
|---|---|
| フラグ | `PHOTO_DIAGNOSE_ENABLED = true`（`AI_ENABLED` とは独立） |
| 判定ロジックの出典 | `src/photo_diagnose_v3.jsx`（参照用。**どのビルドからも import されない**） |
| 契約 | `aiPhotoDiagnose(base64, mediaType)` → `{type, second, confidence, hue_pct, value_pct, chroma_pct, reason}` |
| サンプリング領域 | `PH_REGION`（白紙 0.34-0.76-0.66-0.92 / 左頬 / 右頬 / 髪） |
| 品質ゲート | 暗すぎ / 白飛び / 色かぶり28%超 / 左右頬差ΔE14超 / 肌の生理的範囲外 → `gateError()` を throw して撮り直し画面へ |
| 画面 | intro（撮影条件5項目 + 染髪確認）→ guide（ライブカメラ + 丸型グラデガイド）→ analyzing → rejected |

**触るときの注意**

- `hue_pct` / `value_pct` / `chroma_pct` は「そのタイプのラベル方向の強さ」。結果画面が軸ラベル
  （Warm/Cool・Light/Deep・Clear/Soft）を1stタイプから決めるため、生の warmth/lightness/clarity を
  そのまま入れると「Cool（青み）20%」のような矛盾表示になる。質問式 `finishQuiz()` と同じ考え方。
- **ガイドの座標と `PH_REGION` は必ずセットで動かす。** 見た目だけ動かすと「ガイドに合わせたのに
  測定エリアが違う」事故になる。`npm run verify` に中心Yズレ5px以内の恒久ゲートを入れてある。
- 撮影ボタンは**映像の下の黒帯(96px)の中**に置く。映像に重ねると白紙ガイド＝測定範囲(0.76〜0.92)を
  丸ごと覆ってしまう（実測で 68×54px の重なり）。オーバーレイSVGは内側ラッパで映像と同じ高さに
  閉じ込めること（黒帯まで伸びるとガイドが50px下へズレる）。

## コーデ提案（シーン別記事のデータ参照・v1.8.0〜）

`STYLING_DATA` は BLUBEL/IEBEL のシーン別記事22本（`42_{BLUBEL,IEBEL}_scene_articles_20260822.csv`）から
機械抽出した色マスター。**86シーン / 1,204色チップ**を持つ（約76KB / gzip 約15KB）。

- シーンの選択順は 気分の自由入力 > デート細分 > 会う相手 > シーン既定。
- `styling` は記事のリード文と記事の色名・効果だけで組み立てる。**新しい文章を創作しない。**
- `sku_ids` は必ず `SKUS[site]` の実在商品から2〜3点。記事の推奨SKUが在庫にあれば最優先する
  （記事の推奨SKU 23件のうち在庫にあるのは7件だけなので、残りはシーン・骨格・悩みで選ぶ）。
- 同じ入力なら必ず同じ結果になる（`npm run verify` で決定論であることを実測している）。

## 今日のコーデ採点（色照合・v1.8.0〜）

トップスとボトムスの2領域をサンプリングし、`TYPES[type].palette10`（勝ち色10色）と
`NG_COLORS[type]`（NG色4色）との ΔE(CIE76) で採点する。

- `score = clamp(50 + トップス(±30) + ボトムス(±20), 0, 100)`。顔に近いトップスを重く配点する。
- `improve` / `one_item` は `NG_COLORS` が持つ `why`（理由）と `alt`（置換色）をそのまま使う。
- 品質ゲート: 暗すぎ / 白飛び / 枠に服が入っていない / 2領域と背景が揃って区別できない。
  **ワントーンコーデは却下しない**（背景と区別できていれば正当な写真なので採点し、その旨を添える）。
- **判定できるのは服の色とタイプの相性だけ。**シルエット・素材感は対象外で、案内画面と結果画面の
  両方に明記している。この注記を消さないこと。
- ガイド枠の座標は `SC_REGION` と一致させること（`npm run verify` に中心Yズレ5px以内のゲートがある）。

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
- **v1.8.0 で「近日公開」は全廃。3機能とも外部AIに依存しない実装へ置換して解禁済み。**

  | 機能 | 方式 | フラグ |
  |---|---|---|
  | 顔写真で診断 | 白基準補正 + CIELab の実測（v1.7.0〜） | `PHOTO_DIAGNOSE_ENABLED` |
  | パーソナルカラー別コーデ提案 | シーン別記事22本の実データ参照（v1.8.0〜） | `STYLIST_ENABLED` |
  | 今日のコーデ採点 | 服の色と色マスターの ΔE 照合（v1.8.0〜） | `SCORE_ENABLED` |

  Anthropic API を叩いていた `callClaude()` / `parseAiJson()` は v1.8.0 でソースごと削除した。
  `AI_ENABLED` は未使用のまま残してあるが、これを読むコードはもう無い。
- NG色警察の取り調べも AI ではなく**ルールベース簡易判定**（写真中央領域の平均色相）で完走する。
- `npm run verify` で `api.anthropic.com` へのリクエストが0件であることを毎回実測している。

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
| colorlab | `@v1.8.0` | `https://cdn.jsdelivr.net/gh/thecompany20220901-cpu/colorlab-embed@v1.8.0/dist/colorlab.iife.js` |
| ngpolice | `@v1.3.0` | `https://cdn.jsdelivr.net/gh/thecompany20220901-cpu/colorlab-embed@v1.3.0/dist/ngpolice.iife.js` |
| mens | `@v1.6.1` | `https://cdn.jsdelivr.net/gh/thecompany20220901-cpu/colorlab-embed@v1.6.1/dist/mens.iife.js` |

- v1.8.0 の内容: 「コーデ提案」を**シーン別記事22本のデータ参照方式**へ、「今日のコーデ採点」を
  **色照合方式（CIELab のΔE）**へ全面置換して解禁。これで「近日公開」は全廃。
  未使用になった `callClaude` / `parseAiJson` をソースから削除。
- v1.7.0 の内容: 「顔写真で診断」をAI API方式から**実測方式（白基準補正 + CIELab）へ全面置換**して解禁。
  撮影条件チェック → ライブカメラ + 丸型グラデガイド → 品質ゲート → 12タイプ結果ページへ合流。
  ngpolice / mens は v1.7.0 でも中身に変更なし（タグを揃えていないので注意）。
- v1.3.0 の内容: colorlab v21（バッジ拡大 / スクロールトップ / シェア画像修正 / パレット10色 等）、
  ngpolice v2（結果ページのボタン2つのレイアウト修正）。
- 旧: colorlab `@v1.1.0`（v20）→ `@v1.3.0`（v21）→ `@v1.4.0`（v23）→ `@v1.7.0`（v23 + 実測写真診断）。
  **v1.4.0 のときスニペットの更新が漏れていた**（本番のShopifyページだけ手で v1.4.0 に差し替えられていた）。
  タグを上げたら `snippet_*.html` の更新も必ずセットで行うこと。

## 次回予定タスク（メモ）

1. **イエベ側の固定ページ設置** … 貼り付けるスニペットは同一（同じ jsDelivr URL）。両アプリとも `iebel`/`blubel` をアプリ内のタイプ選択で出し分ける作り＝**追加ビルド不要**。イエベ用の固定ページを作ってスニペットを貼るだけ。
2. ~~フェーズ2 = AI機能の解禁~~ … **v1.8.0 で不要になった。** 顔写真診断・コーデ提案・コーデ採点の
   3機能とも決定論的な実装に置き換えたため、Cloudflare Workers 中継も `AI_ENABLED` の切り替えも要らない。
   残る AI 前提の機能は「NG警察のAI取り調べ」だけで、こちらもルールベース判定で完走している。
   - なお v21 のソースは AI画面の入口のうちホーム3カードしかゲートしておらず、12タイプ/骨格の結果ページCTAが素通りしていたため、本リポジトリ側で同じゲートを追加している（`src/color_lab_stylist_v21.jsx` の該当2箇所）。**次のバージョンを取り込む際も同じ2箇所の確認が必要**。
3. **ヘッダー微調整** … トップのパレット帯に「監修」文字が重なる箇所の微調整（帯の下の白余白へ寄せる等）。
4. **375px での文字折返し** … ホームの「近日公開」バッジが「近日公/開」で改行される、骨格結果ページの
   得意/注意カードのラベルが1文字ずつ縦に折り返る、の2点（いずれも v21 ソース側のレイアウト起因・要素は表示されている）。
