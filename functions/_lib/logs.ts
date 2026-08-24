// Shared `log_entries` loaders and the one write path for logging a day (spec §4.3, §5, §9).
// `upsertScoredEntries` is the ONLY place a row is written into `log_entries` — every value
// arriving here has already passed through `computeDayScore` (functions/_lib/scoring.ts), so a
// client-supplied `points` value can never reach the database (CLAUDE.md hard rule).
import type { LogEntry } from '../../src/types'

export interface LogEntryRow {
  user_id: string
  log_date: string
  rule_key: string
  value: number
  points: number
  updated_at: string
}

const LOG_ENTRY_COLUMNS = `user_id, log_date, rule_key, value, points, updated_at`

function parseLogEntryRow(row: LogEntryRow): LogEntry {
  return {
    user_id: row.user_id,
    log_date: row.log_date,
    rule_key: row.rule_key,
    value: row.value,
    points: row.points,
    updated_at: row.updated_at,
  }
}

/** Spec §9: `GET /api/logs?user_id=&from=&to=` — inclusive range for one user. */
export async function loadLogEntriesForUserRange(
  db: D1Database,
  userId: string,
  from: string,
  to: string,
): Promise<LogEntry[]> {
  const result = await db
    .prepare(
      `SELECT ${LOG_ENTRY_COLUMNS} FROM log_entries
       WHERE user_id = ? AND log_date >= ? AND log_date <= ?
       ORDER BY log_date ASC, rule_key ASC`,
    )
    .bind(userId, from, to)
    .all<LogEntryRow>()
  return (result.results ?? []).map(parseLogEntryRow)
}

/** Every user's entries for a date range — powers bootstrap's "current month's logs" (spec §9). */
export async function loadLogEntriesForRange(
  db: D1Database,
  from: string,
  to: string,
): Promise<LogEntry[]> {
  const result = await db
    .prepare(
      `SELECT ${LOG_ENTRY_COLUMNS} FROM log_entries
       WHERE log_date >= ? AND log_date <= ?
       ORDER BY log_date ASC, user_id ASC, rule_key ASC`,
    )
    .bind(from, to)
    .all<LogEntryRow>()
  return (result.results ?? []).map(parseLogEntryRow)
}

/** Every rule row already logged for one user on one date — the canonical post-write day state. */
export async function loadLogEntriesForUserDate(
  db: D1Database,
  userId: string,
  date: string,
): Promise<LogEntry[]> {
  const result = await db
    .prepare(
      `SELECT ${LOG_ENTRY_COLUMNS} FROM log_entries
       WHERE user_id = ? AND log_date = ?
       ORDER BY rule_key ASC`,
    )
    .bind(userId, date)
    .all<LogEntryRow>()
  return (result.results ?? []).map(parseLogEntryRow)
}

export interface ScoredEntry {
  ruleKey: string
  value: number
  points: number
}

/**
 * Upserts one row per scored rule, all in a single D1 batch (atomic). `values`/`points` here must
 * already be the output of `computeDayScore` — this function trusts its caller completely and
 * does no clamping or scoring of its own.
 */
export async function upsertScoredEntries(
  db: D1Database,
  userId: string,
  date: string,
  entries: readonly ScoredEntry[],
  updatedAtIso: string,
): Promise<void> {
  if (entries.length === 0) return

  const statement = db.prepare(
    `INSERT INTO log_entries (user_id, log_date, rule_key, value, points, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, log_date, rule_key)
     DO UPDATE SET value = excluded.value, points = excluded.points, updated_at = excluded.updated_at`,
  )

  await db.batch(
    entries.map((entry) =>
      statement.bind(userId, date, entry.ruleKey, entry.value, entry.points, updatedAtIso),
    ),
  )
}
