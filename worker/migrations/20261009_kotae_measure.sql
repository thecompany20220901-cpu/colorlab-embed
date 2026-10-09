-- 2026-10-09 v1.22.5: 答え合わせ回答に校正用の付帯情報を足す（列追加のみ・既存行は NULL のまま）
-- 適用: wrangler d1 execute colorlab-mine --remote --file=migrations/20261009_kotae_measure.sql
ALTER TABLE kotae_answers ADD COLUMN app_version TEXT;
ALTER TABLE kotae_answers ADD COLUMN method TEXT;
ALTER TABLE kotae_answers ADD COLUMN measure_json TEXT;
ALTER TABLE kotae_answers ADD COLUMN captured_at TEXT;
