# 本番反映手順: v1.22.7（12タイプ名）+ 答え合わせ type12 / dist

- 作成 2026-10-10。実施予定 2026-10-13〜10-15、**(4)〜(5) は 10/16 23:59 JST まで**。第3弾 kotae2026c は 10/17 0:00 開始。
- (1)〜(3) は 10/10 に実施済み（結果は末尾）。**(4) 以降は keisuke の承認後**。本番 D1・本番 Worker・タグ・push・GTM はそれまで触らない。
- コマンドはすべて `C:\Users\newfa\projects\colorlab-embed\worker` で実行する（`--file` の相対パスのため）。
- いま本番: GTM 両サイト @v1.22.6 / Worker `793f203f`（戻し先 `c7f08ecc`）/ D1 `colorlab-mine` は type12 列なし・kotae_answers 117行。

## 順番の決まり（守らないと回答が消える）

**D1 の列追加 → Worker の deploy の順。逆にしない。**
新 Worker は INSERT に type12 を含むので、列が無い D1 に当たると INSERT が失敗して回答が保存されない。

## (2) 本番 D1 のバックアップ（承認後・(4) の直前に実行）

```
# 1) 今の時点の Time Travel ブックマークを控える（読み取りのみ。戻すときに使う）
wrangler d1 time-travel info colorlab-mine
#    → 表示された bookmark をこのファイルの末尾に書き写す

# 2) kotae_answers をテーブルごと SQL で書き出す（schema + 全行）
wrangler d1 export colorlab-mine --remote --table=kotae_answers --output=C:/Users/newfa/Downloads/app/backup_kotae_YYYYMMDD_before_type12.sql

# 3) 件数と中身の控え（書き出しと照合する）
wrangler d1 execute colorlab-mine --remote --command "SELECT campaign, COUNT(*) AS n, MIN(id) AS min_id, MAX(id) AS max_id FROM kotae_answers GROUP BY campaign"
```
- 2) のファイルの `INSERT INTO` の行数が 3) の合計（10/9 時点で 117）と一致することを確認する。
- 管理画面の CSV（/admin → 回答 CSV）も回ごとに保存しておく（kotae2026・kotae2026b）。
- 注: `d1 export` の実行中は D1 が短時間応答しにくくなることがある。回答の受付が無い 10/16 までに行う。
- 同じ export コマンドは 10/10 に staging で実行して動作を確認済み（schema + 1行が書き出された）。

## (4) 本番 D1 に列を足す → 既存行を埋める

```
wrangler d1 execute colorlab-mine --remote --file=migrations/20261010_kotae_type12.sql
wrangler d1 execute colorlab-mine --remote --command "SELECT name, type, \"notnull\" FROM pragma_table_info('kotae_answers') WHERE name='type12'"
#   → type12 / TEXT / 0 が出ること

wrangler d1 execute colorlab-mine --remote --file=migrations/20261010_kotae_type12_backfill.sql
wrangler d1 execute colorlab-mine --remote --command "SELECT type12, COUNT(*) AS n FROM kotae_answers GROUP BY type12 ORDER BY n DESC"
#   → 10/9 バックアップでの期待値（ローカル D1 で実測）:
#     ウォームスプリング26 / ブライトスプリング21 / クールサマー18 / クールウィンター12 / ライトスプリング12 /
#     ブライトウィンター8 / ディープウィンター7 / ブライトサマー7 / ウォームオータム2 / ディープオータム2 / ソフトオータム1 / ソフトサマー1（計117・NULL 0）
wrangler d1 execute colorlab-mine --remote --command "SELECT COUNT(*) AS n FROM kotae_answers"
#   → 117（行数が変わっていないこと）
```
- バックフィルは何度実行しても同じ結果（2回目以降は 0 行）。type12 以外の列は書き換えない。

## (5) 本番 Worker を deploy

```
wrangler deploy
#   → 表示された Version ID をこのファイルに控える（戻し先は 793f203f）
```
確認（10/17 前なので回答は記録されない＝403 が正しい）:
```
curl -s -H "Origin: https://www.blubel.jp" "https://colorlab-selfcard.the-company-20220901.workers.dev/campaign/stats?campaign=kotae2026c"
#   → ok:true・period.status:"before"・start 2026-10-17
```
- この時点から、v1.22.6 のアプリの回答にも type12 は入る（サーバで決めるため）。dist は (6)(7) の後から。

## (6) アプリ v1.22.7 のリリース

1. `git merge main`（10/10 時点で main の 0045941 = LP の景品差し替えが未取り込み。リリース直前にもう一度 main を取り込み、全テスト）
2. feature/types12 を main に取り込む
3. `npm run build:colorlab`（`npm run build` は dist/avatars を消すので使わない）→ 全テスト
4. タグ `v1.22.7` → push → jsDelivr で `@v1.22.7/dist/colorlab.iife.js` に `ブライトウィンター` と `dist:` が含まれることを確認

## (7) GTM（keisuke）

- 両サイトのタグを `@v1.22.6` → `@v1.22.7` に差し替えて公開。実ページで `x-jsd-version: 1.22.7` を確認。
- 結果ページ12枚（Fulmo）の貼り替え（out/diagnosis_pages/HOWTO.md）と時期をそろえる（アプリが「ブライトサマー」と出し、リンク先が旧表記のままになる期間を短くするため）。

## ロールバック

| 何を戻す | 方法 | 影響 |
|---|---|---|
| Worker | `wrangler rollback 793f203f` | 旧 Worker は type12 を書かないだけ。列は残してよい（NULL が入る） |
| アプリ | GTM を `@v1.22.6` に戻す | dist が送られなくなるだけ |
| D1 の列 | 戻さない（列があっても旧 Worker・旧アプリは動く） | — |
| D1 の中身（バックフィルの取り消し等） | `UPDATE kotae_answers SET type12 = NULL` で列だけ空にする。全体を戻す必要があれば `wrangler d1 time-travel restore colorlab-mine --bookmark=<(2)で控えた bookmark>` | time-travel restore はそれ以降の全書き込みも消える（10/17 以降は回答が消えるので使わない） |
| 順番を間違えて列より先に Worker を出した | すぐ `wrangler rollback 793f203f` → (4) → (5) をやり直す | その間の回答は保存されていない（10/16 までなら回答は来ない） |

## 10/10 に実施済み（(1)〜(3)）

- (1) main の 1f12a02・899f630 を feature/types12 に取り込み（衝突なし・merge 6d609b8）。全テスト実行（facecheck_check の 5件 FAIL は main=v1.22.6 でも同じ5件で、今回の変更とは無関係）。
- (2) 上の手順を確定。export コマンドは staging で動作確認。
- (3) staging（colorlab-mine-staging / colorlab-selfcard-staging）:
  - 実施前の Worker `2e12d90d`（戻し先）
  - export でバックアップ → migration（type12 列 TEXT・NULL可、既存1行は NULL）
  - 臨時の回 `kotae_stg1010`（10/10〜10/11）を足して deploy（`d66769e5`）→ 回答1件 POST → `type12=ソフトオータム`・`dist` 保存を SELECT で確認（id 8）
  - 臨時の回を外して通常設定で deploy し直し **`704f59dd`**（kotae_stg1010 は no_campaign、kotae2026c は before/403）
  - staging D1 には確認用の1行（campaign kotae_stg1010・id 8）が残っている

## 控え（実施時に書く）

- 10/11 実施（keisuke 承認後）。実施前に staging の確認用の行（id 8・kotae_stg1010）を DELETE（2行 → 1行）。
- (1) main の 0045941 を取り込み（衝突なし・merge 238cedd）→ build:colorlab → 全テスト合格（facecheck_check の既知5件のみ FAIL）
- (2) Time Travel bookmark: `000000b0-00000000-00005101-1d814d08a18db5c1afb5da0602a0d3b6`
- (2) export ファイル / 件数: `C:/Users/newfa/Downloads/app/backup_kotae_20261011_before_type12.sql`（INSERT 117行）/ kotae2026 30（id 2〜49）・kotae2026b 87（id 50〜197）
- (4) ALTER → type12 TEXT・notnull 0（cid 15）。既存117行の id・device_id 先頭6文字・app_first/app_second は ALTER 前後とバックフィル後で同一
- (4) バックフィル: 117行書き込み・NULL 0・内訳はローカル D1 と同じ・対応表との食い違い 0
- (5) 本番 Worker 新 Version ID: `994ba8a4-d52e-4cdd-a39a-b1542040cfec`（戻し先 793f203f）。/campaign/stats は両サイトとも ok:true・kotae2026c before
