-- 2026-10-10 keisuke: 既存の答え合わせ回答（type12 列を足す前の行）に12タイプ名を埋める。
-- 先に 20261010_kotae_type12.sql（ALTER）を当ててから実行する。
-- 対象は type12 が NULL で、app_first/app_second が12通りのどれかの行だけ（1位=2位などは NULL のまま）。
-- 何度実行しても同じ結果になる（2回目以降は 0 行）。他の列は書き換えない。
-- 対応は worker/mine.js の KOTAE_TYPE12 / アプリの TYPE12_NAME と同じ。
-- 適用: wrangler d1 execute colorlab-mine --remote --file=migrations/20261010_kotae_type12_backfill.sql
UPDATE kotae_answers
SET type12 = CASE app_first || '-' || app_second
  WHEN 'spring-summer' THEN 'ライトスプリング'
  WHEN 'spring-autumn' THEN 'ウォームスプリング'
  WHEN 'spring-winter' THEN 'ブライトスプリング'
  WHEN 'autumn-spring' THEN 'ウォームオータム'
  WHEN 'autumn-summer' THEN 'ソフトオータム'
  WHEN 'autumn-winter' THEN 'ディープオータム'
  WHEN 'summer-spring' THEN 'ブライトサマー'
  WHEN 'summer-autumn' THEN 'ソフトサマー'
  WHEN 'summer-winter' THEN 'クールサマー'
  WHEN 'winter-spring' THEN 'ブライトウィンター'
  WHEN 'winter-summer' THEN 'クールウィンター'
  WHEN 'winter-autumn' THEN 'ディープウィンター'
END
WHERE type12 IS NULL
  AND app_first || '-' || app_second IN (
    'spring-summer', 'spring-autumn', 'spring-winter',
    'autumn-spring', 'autumn-summer', 'autumn-winter',
    'summer-spring', 'summer-autumn', 'summer-winter',
    'winter-spring', 'winter-summer', 'winter-autumn'
  );
