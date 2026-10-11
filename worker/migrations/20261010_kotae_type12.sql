-- 2026-10-10: 答え合わせ回答に12タイプ名を足す（列追加のみ・既存行は NULL のまま）
-- 値は Worker が app_first / app_second から決める（例 summer-spring → ブライトサマー）。この SQL では行を書き換えない
-- 適用: wrangler d1 execute colorlab-mine --remote --file=migrations/20261010_kotae_type12.sql
ALTER TABLE kotae_answers ADD COLUMN type12 TEXT;
