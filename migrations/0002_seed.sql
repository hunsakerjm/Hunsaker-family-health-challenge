-- Six launch rules (spec §1) and app_config defaults (spec §5 seed keys).
-- Creates NO users — the owner adds every family member in Settings before
-- launch (Phase 3C), so the device picker shows real people from day one.
--
-- family_password_hash and family_password_salt are deliberately absent
-- here. A static migration file cannot read the INITIAL_FAMILY_PASSWORD
-- Cloudflare secret, so those two keys are bootstrapped on first login
-- request instead — see functions/_lib/passwordBootstrap.ts and
-- Docs/DECISIONS.md for the full write-up of this decision.

INSERT INTO rules (id, key, label, short_label, description, icon, category, type, config, points, sort_order, effective_from, effective_to, enabled) VALUES
  ('f46edca0-a760-470a-80f4-58c5e57afbec', 'water',      'Water over 80 oz',          'Water',      NULL, 'droplet',   'Hydration', 'boolean', '{}', 1, 1, NULL, NULL, 1),
  ('5618db31-1682-4737-a444-c0e1fafe6f3f', 'sleep',      'Slept 7+ hours',             'Sleep',      NULL, 'moon',      'Sleep',     'boolean', '{}', 1, 2, NULL, NULL, 1),
  ('fe123d4a-56c6-4fde-9b54-cbbb1bb8aa6b', 'diet',       'Stuck to my diet',           'Diet',       NULL, 'utensils',  'Nutrition', 'boolean', '{}', 1, 3, NULL, NULL, 1),
  ('3ed2fbc1-c23a-47da-b5af-c4cb6e550f5f', 'stretch',    'Stretched 10+ minutes',      'Stretch',    NULL, 'activity',  'Mobility',  'boolean', '{}', 1, 4, NULL, NULL, 1),
  ('fbbf271f-b4a5-4a1b-bb56-a3992a94583c', 'exercise_1', 'Exercise block 1 (20+ min)', 'Exercise 1', NULL, 'dumbbell',  'Movement',  'boolean', '{}', 1, 5, NULL, NULL, 1),
  ('bf7f3bdf-27b2-4804-bdc3-c20df2068269', 'exercise_2', 'Exercise block 2 (20+ min)', 'Exercise 2', NULL, 'dumbbell',  'Movement',  'boolean', '{}', 1, 6, NULL, NULL, 1);

INSERT INTO app_config (key, value, updated_at) VALUES
  ('challenge_start',     '2026-09-01',                 datetime('now')),
  ('challenge_end',       '2027-02-28',                 datetime('now')),
  ('timezone',            'America/Los_Angeles',        datetime('now')),
  ('session_version',     '1',                           datetime('now')),
  ('backfill_limit_days', '0',                           datetime('now')),
  ('future_logging_days', '7',                           datetime('now')),
  ('prize_monthly',       '$25',                         datetime('now')),
  ('prize_final',         '$50',                         datetime('now')),
  ('challenge_title',     'Family Health Challenge',     datetime('now'));
