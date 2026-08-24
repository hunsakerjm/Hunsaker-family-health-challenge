import type { Env } from '../_lib/env'
import { loadPublicConfig } from '../_lib/appConfig'
import { loadAllRules } from '../_lib/rules'
import { csvRow } from '../_lib/csv'
import { computeServerTodayInTimezone, maxPointsForDate } from '../../src/lib/dates'

// GET /api/export.csv — spec §9 "The export is load-bearing": streak calculation and any other
// after-the-fact analysis are deliberately done OFFLINE from this file, not in the app (spec
// §4.2, §8.5 "No streak calculation"). This is a hard requirement, not a convenience — get the
// columns exactly right (spec §9's own column list, copied verbatim into the two header rows
// below) and never filter out a zero-value row, since a zero row (rule touched, not completed) is
// how a "rough day" is told apart from "never logged" (no row at all).
//
// Two schemas (entries, weights) can't share one CSV header, and spec §9 only defines a single
// `/api/export.csv` route — no second endpoint. Simplest reversible resolution
// (Docs/DECISIONS.md, 2026-08-24): one file, two blocks, each with its own header row, separated
// by a blank line and a `# weights` marker line so a human (or a quick script) can tell where one
// block ends and the next begins. Still workable in Excel/Sheets: import as text, the family
// splits at the blank line if they want two separate imports.

interface EntryExportRow {
  display_name: string
  user_id: string
  log_date: string
  rule_key: string
  rule_label: string | null
  value: number
  points: number
  in_points_challenge: number
  updated_at: string
}

interface WeightExportRow {
  display_name: string
  log_date: string
  weight_lb: number
  is_baseline: number
}

const ENTRY_HEADER = [
  'display_name', 'user_id', 'log_date', 'rule_key', 'rule_label', 'value', 'points',
  'max_points_for_date', 'in_points_challenge', 'updated_at',
]
const WEIGHT_HEADER = ['display_name', 'log_date', 'weight_lb', 'is_baseline']
const WEIGHTS_SECTION_MARKER = '# weights'

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context
  const [config, rules, entryRows, weightRows] = await Promise.all([
    loadPublicConfig(env.DB),
    loadAllRules(env.DB),
    loadEntryExportRows(env.DB),
    loadWeightExportRows(env.DB),
  ])

  const maxPointsCache = new Map<string, number>()
  function maxPointsFor(date: string): number {
    const cached = maxPointsCache.get(date)
    if (cached !== undefined) return cached
    const computed = maxPointsForDate(rules, date)
    maxPointsCache.set(date, computed)
    return computed
  }

  const lines: string[] = []
  lines.push(csvRow(ENTRY_HEADER))
  for (const row of entryRows) {
    lines.push(csvRow([
      row.display_name,
      row.user_id,
      row.log_date,
      row.rule_key,
      row.rule_label,
      row.value,
      row.points,
      maxPointsFor(row.log_date),
      row.in_points_challenge,
      row.updated_at,
    ]))
  }
  lines.push('')
  lines.push(WEIGHTS_SECTION_MARKER)
  lines.push(csvRow(WEIGHT_HEADER))
  for (const row of weightRows) {
    lines.push(csvRow([row.display_name, row.log_date, row.weight_lb, row.is_baseline]))
  }

  const serverToday = computeServerTodayInTimezone(config.timezone)
  const filename = `health-challenge-export-${serverToday}.csv`

  return new Response(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}

async function loadEntryExportRows(db: D1Database): Promise<EntryExportRow[]> {
  const result = await db
    .prepare(
      `SELECT u.display_name AS display_name, e.user_id AS user_id, e.log_date AS log_date,
              e.rule_key AS rule_key, r.label AS rule_label, e.value AS value, e.points AS points,
              u.in_points_challenge AS in_points_challenge, e.updated_at AS updated_at
       FROM log_entries e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN rules r ON r.key = e.rule_key
       ORDER BY u.display_name ASC, e.log_date ASC, e.rule_key ASC`,
    )
    .all<EntryExportRow>()
  return result.results ?? []
}

async function loadWeightExportRows(db: D1Database): Promise<WeightExportRow[]> {
  const result = await db
    .prepare(
      `SELECT u.display_name AS display_name, w.log_date AS log_date, w.weight_lb AS weight_lb,
              w.is_baseline AS is_baseline
       FROM weight_entries w
       JOIN users u ON u.id = w.user_id
       ORDER BY u.display_name ASC, w.log_date ASC`,
    )
    .all<WeightExportRow>()
  return result.results ?? []
}
