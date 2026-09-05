# colorlab-selfcard — 「自分の顔で作る」の中継

`colorlab.iife.js` は jsDelivr で**公開配信される JS** なので、OpenAI の APIキーを
そこに置くと誰でも読めて残高を使われる。だからキーは Workers Secret に置き、
生成はこの Worker ごしにだけ行う。

日次上限もここで数える。ブラウザの localStorage で数えても、
シークレットウィンドウや保存データの削除でいくらでもリセットできるので、
**予算の上限としては機能しない**。

## デプロイ手順

```bash
cd worker
npm i -g wrangler          # 未導入なら
wrangler login

# 1) 日次カウンタ用の KV を作る
wrangler kv namespace create SELFCARD_KV
#    → 出力された id を wrangler.toml の REPLACE_WITH_KV_NAMESPACE_ID に貼る

# 2) APIキーを Secret に入れる（wrangler.toml には絶対に書かない）
wrangler secret put OPENAI_API_KEY

# 3) デプロイ
wrangler deploy
```

デプロイすると `https://colorlab-selfcard.<account>.workers.dev` が払い出される。
**その URL を `src/color_lab_stylist_v23.jsx` の `SELFCARD_ENDPOINT` に反映し、
`SELFCARD_ENABLED` を `true` にしてからビルドする。**
それまでは `false` のままにしておくこと（入口ごと出ない）。

## 動作確認

```bash
# 許可オリジン以外は 403 になること
curl -i -X POST https://colorlab-selfcard.<account>.workers.dev/illustrate \
  -H "Origin: https://example.com" -F "photo=@test.jpg" -F "first=summer"

# 許可オリジンなら 200 で画像が返ること
curl -s -X POST https://colorlab-selfcard.<account>.workers.dev/illustrate \
  -H "Origin: https://blubel.jp" -F "photo=@test.jpg" -F "first=summer" \
  | head -c 200
```

## 仕様

| 項目 | 内容 |
|---|---|
| 受け付け | `POST` / `multipart/form-data`（`photo`, `first`, `second`） |
| 許可オリジン | blubel.jp / iebel.jp（www 有無の4つ）。それ以外は 403 |
| 生成 | `images.edit` / `gpt-image-1.5` / medium / 1024x1536 |
| 日次上限 | **50回/日**、JST 0:00 リセット。超過は 429 + `reason: "daily_limit"` |
| 写真の扱い | メモリ上で中継するだけ。**KV にもログにも書かない** |
| ログ | 日付・使用数・出力画像トークンのみ。上流のエラー本文は外に出さない |
| 上限の数え方 | 生成の**前**に +1。後から増やす作りだと、失敗を繰り返して上限を素通りできてしまう |

## プロンプトの2色（2026-09-05・v2）

カードの色名は **「1位シーズンの色 × 2位シーズンの色」**（`src/card_data.js` の
`CARD_COPY[].cn` / `.ch`）。プロンプトの2色もこれと一字一句そろえる。

| | 1色目 = `FIRST_COLOR[first]` | 2色目 = `SECOND_COLOR[second]` |
|---|---|---|
| spring / イエベ春 | peach `#EE8B7E` | yellow `#F6D65B` |
| summer / ブルベ夏 | lavender `#C9B8D8` | rose pink `#D4708E` |
| autumn / イエベ秋 | terracotta `#A65A3A` | camel `#B5734A` |
| winter / ブルベ冬 | navy `#1E2A44` | magenta `#C2408B` |

- **v1 の不具合**: 2色目を `ACCENT[first]`（1位シーズンで引く別表）から取っていたため、
  カードが「ネイビー×キャメル」でもプロンプトは `bordeaux red accent` だった。
  **2色目が弱かったのではなく、一度も指定されていなかった。**
  `second` はクライアントが最初から送っていたのに、Worker が読んでいなかった。
- **v2 の直し方**: 2色目を `second` で引き、さらに
  **役割（MAIN / SECOND）・面積比（70% / 30%）・置き場所3箇所（襟、袖口、背景のストローク）**
  を名指しする。「2色目を1色目に寄せるな・省くな」も明示する。
  置き場所を服のトリムと背景に限るのは、**写真に無い持ち物（眼鏡・アクセサリー）を
  描き足させないため**。この方針は変えないこと。
- 2色目を変えたら、クライアントの `SELFCARD_PROMPT_VERSION` も上げる
  （上げないとセッションキャッシュから古い絵が返る）。

### 検証

```bash
# 画像を生成せずに確かめる（課金0円）
node test/selfcard_prompt_check.mjs        # 12通りの配色がカード表記と一致するか
node test/selfcard_color_check_test.mjs    # 2色検出そのものが正しく効くか

# 実物を1枚だけ作って確かめる（課金1回）
node test/selfcard_live.mjs <写真> winter autumn   # ネイビー×キャメル
node test/selfcard_live.mjs <写真> spring summer   # ピーチ×ローズ

# 手元の画像に2色が入っているかだけ測る（課金0円）
node test/selfcard_color_check.mjs <画像> winter autumn
```

**Worker を直したら `wrangler deploy` が要る。**jsDelivr のタグを上げても
Worker は入れ替わらない（配信経路が別）。

## 分かっている限界

- KV は結果整合なので、同時アクセスが重なると 50 をわずかに超えることがある。
  暴走を止めるのが目的で、厳密な会計ではない。
- 生成に失敗した回も枠を1消費する。上限の意味（課金の上限）を守るための割り切り。
- 2色検出（`selfcard_color_check.mjs`）は目安。肌色はキャメル・ピーチに近いので、
  判定は肌が入らない**背景マージン**を主に見ている。最終確認は必ず画像を目で見ること。
- プロンプトを直しても、**モデルが必ず従う保証はない**。実物の確認は実接続テストで行う。
- サイズは 1024x1536 固定。1024x1024 なら出力画像トークンが 1584 → 1056 に減るが、
  事前生成16種アバターと画角が揃わなくなるため採用していない（2026-09-05 実測・判断）。
