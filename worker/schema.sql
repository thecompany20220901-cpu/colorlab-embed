-- ══════════════════════════════════════════════════════════
--   Color Lab MINE v1 — D1 スキーマ（会員・課金・答え合わせキャンペーン）
--
--   適用（keisuke 承認後）:
--     wrangler d1 create colorlab-mine
--       → 出た database_id を wrangler.toml の [[d1_databases]] に貼る
--     wrangler d1 execute colorlab-mine --remote --file=schema.sql
--
--   方針:
--     - 会員IDは blubel.jp 本体（Fulmo/Vercel）とは連携しない。アプリ独自に持つ
--     - トークンは生の値を保存しない。SHA-256 の16進だけを持つ
--       （D1 が読まれても、そのままではログインに使えない）
--     - 写真・診断画像は一切保存しない（キャンペーンもタイプ名だけ）
-- ══════════════════════════════════════════════════════════

-- 会員。列名は指示書の6列そのまま + 管理用の id / 日時 / Stripe 購読ID。
CREATE TABLE IF NOT EXISTS users (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  email                  TEXT    NOT NULL UNIQUE,          -- 小文字・前後空白除去で正規化して保存
  magic_link_token       TEXT,                             -- 送ったリンクのトークンの SHA-256（生値は保存しない）
  token_expires_at       INTEGER,                          -- UNIX 秒。使い切ったら NULL に戻す
  is_ec_purchaser        INTEGER NOT NULL DEFAULT 0,       -- 1 = EC購入者（無料会員）。管理者が ec_applications を承認すると立つ
  subscription_status    TEXT    NOT NULL DEFAULT 'none',  -- none / active / trialing / past_due / canceled / unpaid / incomplete
  stripe_customer_id     TEXT    UNIQUE,
  stripe_subscription_id TEXT,                             -- Webhook で更新。解約・再開の突き合わせ用
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

-- ログイン状態。マジックリンクを踏んだ端末ごとに1行。
-- users に1列で持つと、2台目の端末でログインした瞬間に1台目が締め出されるため分ける。
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,                         -- セッショントークンの SHA-256
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Stripe Webhook の重複受信よけ。Stripe は同じイベントを再送することがある。
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT    PRIMARY KEY,                        -- evt_...
  type         TEXT    NOT NULL,
  received_at  INTEGER NOT NULL
);

-- 答え合わせキャンペーン。1端末1回（最初の1回だけ集計に入れる）。
-- 何度も撮り直して一致するまで粘った結果で一致率が上がらないようにするため。
CREATE TABLE IF NOT EXISTS kotae_answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign     TEXT    NOT NULL,                           -- 例 'kotae2026'
  device_id    TEXT    NOT NULL,                           -- 端末の localStorage に置いた乱数
  site         TEXT    NOT NULL,                           -- blubel / iebel
  pro_first    TEXT    NOT NULL,                           -- spring / summer / autumn / winter
  pro_second   TEXT,                                       -- 言われていなければ NULL
  app_first    TEXT    NOT NULL,
  app_second   TEXT    NOT NULL,
  first_match  INTEGER NOT NULL,                           -- 1st シーズンが一致したら 1
  full_match   INTEGER,                                    -- プロの 2nd があるときだけ 0/1、無ければ NULL
  created_at   INTEGER NOT NULL,
  UNIQUE (campaign, device_id)
);
CREATE INDEX IF NOT EXISTS idx_kotae_campaign ON kotae_answers(campaign);

-- EC購入者の無料会員申請（C案: 手動申請 + 管理者承認・2026-09-19 keisuke 決定）。
-- スクショ（購入完了メール）は承認・却下した時点で NULL にする（氏名・住所が写るため持ち続けない）。
CREATE TABLE IF NOT EXISTS ec_applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site          TEXT    NOT NULL,                          -- blubel / iebel（どちらで買ったか）
  order_email   TEXT,                                      -- 注文時のアドレス（ログイン用と違う場合だけ）
  order_number  TEXT,
  note          TEXT,
  image         BLOB,                                      -- 画面側で長辺1600pxに縮めた JPEG/PNG/WebP（1.5MB まで）
  image_type    TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending',        -- pending / approved / rejected
  reject_reason TEXT,
  created_at    INTEGER NOT NULL,
  reviewed_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ec_app_status ON ec_applications(status, id);
CREATE INDEX IF NOT EXISTS idx_ec_app_user ON ec_applications(user_id, id);
