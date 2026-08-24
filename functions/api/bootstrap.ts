import type { Env } from '../_lib/env'
import { computeServerTodayInTimezone } from '../_lib/dates'

const DEFAULT_TIMEZONE = 'America/Los_Angeles'
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
  config: string
  points: number
  sort_order: number
  effective_from: string | null
  effective_to: string | null
  enabled: number
}

// Spec §9 / §14 Phase 1 demo: one call on cold start returning config,
// serverToday, rules effective now, users, and the current month's logs.
// This phase seeds no users and builds no logging screen, so those two
// arrays are correctly empty rather than placeholders to fill in later.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  const config = await loadPublicConfig(env.DB)
  const serverToday = computeServerTodayInTimezone(config.timezone ?? DEFAULT_TIMEZONE)
  const rules = await loadEffectiveRules(env.DB, serverToday)

  const body = {
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

async function loadPublicConfig(db: D1Database): Promise<Record<string, string>> {
  const result = await db
    .prepare(`SELECT key, value FROM app_config`)
    .all<{ key: string; value: string }>()

  const config: Record<string, string> = {}
  for (const row of result.results ?? []) {
    // The password hash and salt never leave this layer — spec §9 "/api/config
    // ... password hash never returned" applies just as much to bootstrap.
    if (SECRET_CONFIG_KEYS.has(row.key)) continue
    config[row.key] = row.value
  }
  return config
}

async function loadEffectiveRules(db: D1Database, todayIso: string): Promise<RuleRow[]> {
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
  return result.results ?? []
}
