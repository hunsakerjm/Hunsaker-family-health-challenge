import type { Env } from '../_lib/env'
import { computeServerTodayInTimezone } from '../_lib/dates'
import type { AppConfig, BootstrapResponse, Rule, RuleConfig, RuleType } from '../../src/types'

const DEFAULT_TIMEZONE = 'America/Los_Angeles'
const DEFAULT_SESSION_VERSION = 1
const DEFAULT_BACKFILL_LIMIT_DAYS = 0 // spec §5: 0 = unlimited past editing
const DEFAULT_FUTURE_LOGGING_DAYS = 7
const DEFAULT_CHALLENGE_TITLE = 'Family Health Challenge'
const SECRET_CONFIG_KEYS = new Set(['family_password_hash', 'family_password_salt'])

interface RuleRow {
  id: string
  key: string
  label: string
  short_label: string | null
  description: string | null
  icon: string | null
  category: string
  type: string
  config: string // raw JSON, as stored (spec §5) — parsed into RuleConfig before the wire response
  points: number
  sort_order: number
  effective_from: string | null
  effective_to: string | null
  enabled: number // D1 stores 0|1 (spec §5) — coerced to boolean before the wire response
}

// Spec §9 / §14 Phase 1 demo: one call on cold start returning config, serverToday, rules
// effective now, users, and the current month's logs. This phase seeds no users and builds no
// logging screen, so those two arrays are correctly empty rather than placeholders to fill in
// later. Response shape matches `src/types.ts` BootstrapResponse exactly — that file is the
// contract, this handler is one of its implementations.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  const config = await loadPublicConfig(env.DB)
  const serverToday = computeServerTodayInTimezone(config.timezone)
  const rules = await loadEffectiveRules(env.DB, serverToday)

  const body: BootstrapResponse = {
    config,
    serverToday,
    rules,
    users: [],
    logs: [],
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function loadPublicConfig(db: D1Database): Promise<AppConfig> {
  const result = await db
    .prepare(`SELECT key, value FROM app_config`)
    .all<{ key: string; value: string }>()

  const raw: Record<string, string> = {}
  for (const row of result.results ?? []) {
    // The password hash and salt never leave this layer — spec §9 "/api/config ... password hash
    // never returned" applies just as much to bootstrap.
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
// Record<string,string> three times downstream.
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

async function loadEffectiveRules(db: D1Database, todayIso: string): Promise<Rule[]> {
  const result = await db
    .prepare(
      `SELECT id, key, label, short_label, description, icon, category, type, config, points,
              sort_order, effective_from, effective_to, enabled
       FROM rules
       WHERE enabled = 1
         AND (effective_from IS NULL OR effective_from <= ?)
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY sort_order ASC`,
    )
    .bind(todayIso, todayIso)
    .all<RuleRow>()
  return (result.results ?? []).map(parseRuleRow)
}

function parseRuleRow(row: RuleRow): Rule {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    short_label: row.short_label,
    description: row.description,
    icon: row.icon,
    category: row.category,
    type: row.type as RuleType,
    config: parseRuleConfig(row.config),
    points: row.points,
    sort_order: row.sort_order,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    enabled: row.enabled === 1,
  }
}

function parseRuleConfig(raw: string): RuleConfig {
  try {
    return JSON.parse(raw) as RuleConfig
  } catch {
    // A corrupt or missing config JSON must never crash the request path — an empty object is a
    // safe (if inert) config for every rule type.
    return {} as RuleConfig
  }
}
