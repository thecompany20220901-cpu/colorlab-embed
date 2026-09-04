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
| 受け付け | `POST` / `multipart/form-data`（`photo`, `first`） |
| 許可オリジン | blubel.jp / iebel.jp（www 有無の4つ）。それ以外は 403 |
| 生成 | `images.edit` / `gpt-image-1.5` / medium / 1024x1536 |
| 日次上限 | **50回/日**、JST 0:00 リセット。超過は 429 + `reason: "daily_limit"` |
| 写真の扱い | メモリ上で中継するだけ。**KV にもログにも書かない** |
| ログ | 日付・使用数・出力画像トークンのみ。上流のエラー本文は外に出さない |
| 上限の数え方 | 生成の**前**に +1。後から増やす作りだと、失敗を繰り返して上限を素通りできてしまう |

## 分かっている限界

- KV は結果整合なので、同時アクセスが重なると 50 をわずかに超えることがある。
  暴走を止めるのが目的で、厳密な会計ではない。
- 生成に失敗した回も枠を1消費する。上限の意味（課金の上限）を守るための割り切り。
- サイズは 1024x1536 固定。1024x1024 なら出力画像トークンが 1584 → 1056 に減るが、
  事前生成16種アバターと画角が揃わなくなるため採用していない（2026-09-05 実測・判断）。
