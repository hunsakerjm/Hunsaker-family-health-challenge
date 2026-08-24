-- Supporting table for the login rate limiter (spec §3.1: 10 attempts per
-- IP per 15 minutes). Not part of the §5 data model — infrastructure for
-- the auth gate, so it lives in its own migration rather than folded into
-- 0001_schema.sql, which must stay a verbatim copy of §5.
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX ix_login_attempts_ip_at ON login_attempts(ip, at);
