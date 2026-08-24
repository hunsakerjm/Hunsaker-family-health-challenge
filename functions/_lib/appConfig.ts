// Shared `app_config` loader. Extracted from `functions/api/bootstrap.ts` (Phase 1b) so Phase 2a's
// new routes (`PUT /api/logs/:userId/:date` needs the editable-date-range config; a future
// `/api/config` route will need the same coercion) never hand-roll a second copy of the
// TEXT-column-to-typed-value coercion. Behavior is unchanged from the original bootstrap.ts
// version — this is a pure extraction, not a rewrite.
import type { AppConfig } from '../../src/types'

const DEFAULT_TIMEZONE = 'America/Los_Angeles'
const DEFAULT_SESSION_VERSION = 1
const DEFAULT_BACKFILL_LIMIT_DAYS = 0 // spec §5: 0 = unlimited past editing
const DEFAULT_FUTURE_LOGGING_DAYS = 7
const DEFAULT_CHALLENGE_TITLE = 'Family Health Challenge'
const SECRET_CONFIG_KEYS = new Set(['family_password_hash', 'family_password_salt'])

export async function loadPublicConfig(db: D1Database): Promise<AppConfig> {
  const result = await db
    .prepare(`SELECT key, value FROM app_config`)
    .all<{ key: string; value: string }>()

  const raw: Record<string, string> = {}
  for (const row of result.results ?? []) {
    // The password hash and salt never leave this layer — spec §9 "/api/config ... password hash
    // never returned" applies just as much to every other reader of app_config.
    if (SECRET_CONFIG_KEYS.has(row.key)) continue
    raw[row.key] = row.value
  }
  return coerceAppConfig(raw)
}

function parseConfigInt(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

// app_config.value is TEXT in D1 (spec §5) even for the numeric keys — coerced here, once, at the
// response boundary, so every consumer of `AppConfig` gets real numbers rather than re-parsing a
// Record<string,string> multiple times downstream.
function coerceAppConfig(raw: Record<string, string>): AppConfig {
  return {
    challenge_start: raw.challenge_start,
    challenge_end: raw.challenge_end,
    timezone: raw.timezone ?? DEFAULT_TIMEZONE,
    session_version: parseConfigInt(raw.session_version, DEFAULT_SESSION_VERSION),
    backfill_limit_days: parseConfigInt(raw.backfill_limit_days, DEFAULT_BACKFILL_LIMIT_DAYS),
    future_logging_days: parseConfigInt(raw.future_logging_days, DEFAULT_FUTURE_LOGGING_DAYS),
    prize_monthly: raw.prize_monthly ?? '',
    prize_final: raw.prize_final ?? '',
    challenge_title: raw.challenge_title ?? DEFAULT_CHALLENGE_TITLE,
  }
}
