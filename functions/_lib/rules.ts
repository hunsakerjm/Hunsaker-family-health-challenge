// Shared `rules` row parsing. Extracted from `functions/api/bootstrap.ts` (Phase 1b) plus a new
// unfiltered loader Phase 2a's logging route needs — scoring a specific (possibly past or future)
// date requires seeing every rule regardless of today's effective window, since
// `computeDayScore`/`maxPointsForDate` already do that filtering per-date themselves (spec §4.3:
// "a given date only offers the rules effective on that date"). Never use `loadAllRules` for "what
// shows on today's page" — that stays bootstrap's own today-filtered SQL query.
import type { Rule, RuleConfig, RuleType } from '../../src/types'

export interface RuleRow {
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

const RULE_COLUMNS = `id, key, label, short_label, description, icon, category, type, config, points,
              sort_order, effective_from, effective_to, enabled`

export function parseRuleRow(row: RuleRow): Rule {
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

export function parseRuleConfig(raw: string): RuleConfig {
  try {
    return JSON.parse(raw) as RuleConfig
  } catch {
    // A corrupt or missing config JSON must never crash the request path — an empty object is a
    // safe (if inert) config for every rule type.
    return {} as RuleConfig
  }
}

/** Every rule, regardless of `enabled` or effective window. See file header for why. */
export async function loadAllRules(db: D1Database): Promise<Rule[]> {
  const result = await db
    .prepare(`SELECT ${RULE_COLUMNS} FROM rules ORDER BY sort_order ASC`)
    .all<RuleRow>()
  return (result.results ?? []).map(parseRuleRow)
}
