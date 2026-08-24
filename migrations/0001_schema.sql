-- ---------- users ----------
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,           -- crypto.randomUUID()
  display_name          TEXT NOT NULL,
  color_key             TEXT NOT NULL,              -- palette key, §7
  emoji                 TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  in_points_challenge   INTEGER NOT NULL DEFAULT 1,
  in_weight_challenge   INTEGER NOT NULL DEFAULT 0,
  claimed_at            TEXT,                       -- first device setup; soft signal only
  active_from           TEXT,                       -- NULL = since challenge start
  active_to             TEXT,                       -- NULL = ongoing; set on archive
  status                TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'archived'
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_users_color_active
  ON users(color_key) WHERE status = 'active';

-- ---------- rules ----------
CREATE TABLE rules (
  id              TEXT PRIMARY KEY,
  key             TEXT NOT NULL UNIQUE,        -- stable slug; never reuse a retired key
  label           TEXT NOT NULL,
  short_label     TEXT,                        -- for charts and tight spaces
  description     TEXT,
  icon            TEXT,                        -- lucide icon name
  category        TEXT NOT NULL,           -- reserved: no view groups by this today
  type            TEXT NOT NULL,               -- 'boolean' | 'counter' | 'threshold'
  config          TEXT NOT NULL DEFAULT '{}',  -- JSON
  points          INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL,
  effective_from  TEXT,
  effective_to    TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1
);

-- ---------- daily habit log ----------
CREATE TABLE log_entries (
  user_id     TEXT NOT NULL REFERENCES users(id),
  log_date    TEXT NOT NULL,          -- 'YYYY-MM-DD' in challenge-local time
  rule_key    TEXT NOT NULL,
  value       REAL NOT NULL,
  points      INTEGER NOT NULL,       -- server-computed snapshot; never client-supplied
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, log_date, rule_key)
);
CREATE INDEX ix_log_date      ON log_entries(log_date);
CREATE INDEX ix_log_user_date ON log_entries(user_id, log_date);

-- ---------- weight, as a dated series ----------
CREATE TABLE weight_entries (
  user_id     TEXT NOT NULL REFERENCES users(id),
  log_date    TEXT NOT NULL,
  weight_lb   REAL NOT NULL,
  is_baseline INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, log_date)
);
CREATE UNIQUE INDEX ux_weight_baseline
  ON weight_entries(user_id) WHERE is_baseline = 1;

-- ---------- audit ----------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  acting_user TEXT,            -- client-declared; advisory only
  action      TEXT NOT NULL,   -- 'log.upsert' | 'weight.upsert' | 'rule.create' | ...
  target_user TEXT,
  detail      TEXT             -- JSON
);

-- ---------- config ----------
CREATE TABLE app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
