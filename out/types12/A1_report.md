# A-① 調査 (HEAD b9bb17a / v1.22.6・ファイルは書き換えていない)

## 1. 12パターンの現在の出方 (ファイル:行)

12タイプのカタカナ名はリポジトリ全体で **0件**（`grep -rnoE "(ライト|ブライト|ソフト|クール|ディープ|ウォーム|…)(サマー|ウィンター|スプリング|オータム)"`、node_modules・_backup・dist 除外）。
12パターンは「1位シーズン名 + 2位シーズン名」の組み合わせで表示されている。

| 場所 | 行 | 今の表示・データ | 種別 |
|---|---|---|---|
| src/color_lab_stylist_v23.jsx | 592-597 | TYPES: spring=イエベ春(1) / summer=ブルベ夏(2) / autumn=イエベ秋(3) / winter=ブルベ冬(4) | 4タイプ定義 |
| 同 | 558-577 | mergeCombo: URL キー `${num}-${num}`、note は1位名のみ | 判定 |
| 同 | 851-862 | RESULT_MAP: キー "1-2"…"4-3" → 結果ページURL | キー |
| 同 | 1167 | カード画像(canvas): `1st ブルベ夏　2nd イエベ春` | **組み合わせ表示** |
| 同 | 4159 | カード画面: `1st ブルベ夏　2nd イエベ春` | **組み合わせ表示** |
| 同 | 4275 | カード注記: `12タイプ診断の結果（ブルベ夏 → イエベ春）` | **組み合わせ表示** |
| 同 | 4496 | 今日なに着る？ のピル: `ブルベ夏 × 2nd イエベ春` | **組み合わせ表示** |
| 同 | 4346-4349 | 診断結果 h2 `あなたは【ブルベ夏】タイプです！` + ピル `2nd：イエベ春` | 1位/2位を別表示 |
| 同 | 1028 / 1031 | シェア画像: 1位名 130px + `2nd イエベ春` 40px | 1位/2位を別表示 |
| 同 | 3925 / 4380 / 4451-4458 / 1995 | `2nd ○○` 単独（2nd活用ブロック等） | 2位シーズン単独 |
| 同 | 3574 / 3583 / 3620 / 3645 / 3667 / 4247 / 4265 | GA `color_type: "2-1"` 等 | キー |
| src/card_data.js | 117 | `cardKey = first-second_q1_q2`（例 "2-1_intuition_action"）。称号 t は「そよ風の情熱家」等でタイプ名ではない | キー |
| src/kotaeawase.jsx | 36-39 / 181-182 / 375-376 | SEASON 4名・プロ/アプリを 1st・2nd 別表示（シーズン比較の企画） | シーズン |
| worker/selfcard-worker.js | 48-67, 120-122, 244 | spring/summer/… のキーのみ。表示名なし | キー |
| worker/mine.js / schema.sql | 347-378 / 54-57 | pro_first 等に spring/summer/… を保存 | キー |
| test/_selfcard_capture_20260908.mjs | 20 | `TYPE_RE = /1st\s*(…)\s*2nd\s*(…)/` でカード表示を読む | テスト補助 |
| test/screenshot.mjs | 463 | `【イエベ春】` と `2nd：ブルベ夏` を確認 | テスト |
| test/kotaeawase_check.mjs | 228 ほか | `イエベ春 2nd：ブルベ夏` | テスト |
| test/season_avatar_check.mjs | 76 / 87 | 結果画面に `2nd` が残っていること | テスト |

## 2. 旧名→新名

| キー | 旧表示 (1st/2nd) | 新名 | 結果ページ |
|---|---|---|---|
| 2-1 | ブルベ夏 / イエベ春 | ブライトサマー | blubel diagnosis3 |
| 2-3 | ブルベ夏 / イエベ秋 | ソフトサマー | blubel diagnosis4 |
| 2-4 | ブルベ夏 / ブルベ冬 | クールサマー | blubel diagnosis5 |
| 4-1 | ブルベ冬 / イエベ春 | ブライトウィンター | blubel diagnosis6 |
| 4-2 | ブルベ冬 / ブルベ夏 | クールウィンター | blubel diagnosis7 |
| 4-3 | ブルベ冬 / イエベ秋 | ディープウィンター | blubel diagnosis8 |
| 1-2 | イエベ春 / ブルベ夏 | ライトスプリング | iebel diagnosis3 |
| 1-3 | イエベ春 / イエベ秋 | ウォームスプリング | iebel diagnosis4 |
| 1-4 | イエベ春 / ブルベ冬 | ブライトスプリング | iebel diagnosis5 |
| 3-1 | イエベ秋 / イエベ春 | ウォームオータム | iebel diagnosis6 |
| 3-2 | イエベ秋 / ブルベ夏 | ソフトオータム | iebel diagnosis7 |
| 3-4 | イエベ秋 / ブルベ冬 | ディープオータム | iebel diagnosis8 |

※ IEBEL の diagnosis 番号は指示書の表の並び順と違う（4=ウォームスプリング、5=ブライトスプリング）。番号→名は RESULT_MAP のキーで対応付けた。

## 3. 出現数

- 新名(カタカナ12名): 全ファイル 0
- シーズン名(イエベ春|ブルベ夏|イエベ秋|ブルベ冬) 出現数: color_lab_stylist_v23.jsx 34 / kotaeawase.jsx 4 / test: kotaeawase_check 15, screenshot 5, _v1205_live_credit 4, depacosme_check 4, _selfcard_capture 2, card_smoke 2, card_sku_check 1, facecheck_check 1, screenshot_mens 1, season_avatar_check 1, shot_illustration 1, build_color70.py 1（行数）
- うち「1位+2位を1つの名前として出している」箇所 = 4 (v23:1167, 4159, 4275, 4496)

## 4. 互換性

- cardKey・color_type・RESULT_MAP・localStorage(`colorlab-profile` = {myType, mySecond}: spring 等)・D1(kotae_answers: spring 等)・URLパラメータ(campaign のみ)は、すべて数値キーか英字シーズンキー。表示名は保存されていない。
- 案はキーを1つも変えないので、保存済みデータ・GA集計・URL は壊れない → 読み替えテーブルは不要。

## 5. RESULT_MAP の URL (v23:851-862 実物)

```
"1-2": "https://www.iebel.jp/pages/diagnosis3"
"1-3": "https://www.iebel.jp/pages/diagnosis4"
"1-4": "https://www.iebel.jp/pages/diagnosis5"
"3-1": "https://www.iebel.jp/pages/diagnosis6"
"3-2": "https://www.iebel.jp/pages/diagnosis7"
"3-4": "https://www.iebel.jp/pages/diagnosis8"
"2-1": "https://www.blubel.jp/pages/diagnosis3"
"2-3": "https://www.blubel.jp/pages/diagnosis4"
"2-4": "https://www.blubel.jp/pages/diagnosis5"
"4-1": "https://www.blubel.jp/pages/diagnosis6"
"4-2": "https://www.blubel.jp/pages/diagnosis7"
"4-3": "https://www.blubel.jp/pages/diagnosis8"
```

## 変更案 (diff: out/types12/A1_proposed.diff)

- 表示名テーブル `TYPE12_NAME`（キーは RESULT_MAP と同じ）を1つ足し、「1位+2位を1つの名前として出している」4箇所だけを新名に置換。
- 診断結果 h2【ブルベ夏】・ピル「2nd：イエベ春」・シェア画像は変えない（4タイプ判定の表示。新名に替えるとシェア画像 130px で「ブライトウィンター」≒1170px となり幅1080pxからはみ出す＝レイアウト変更が要る）。
