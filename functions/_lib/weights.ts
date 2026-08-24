// Shared `weight_entries` row parsing and loaders/mutators (spec §5, §8.6, §9).
//
// STRUCTURAL PRIVACY (spec §9): "Weight pounds are only ever returned for a single requested
// userId. No aggregate endpoint returns raw weights... enforced at the query layer, not by the
// client hiding a field." Every function below that returns a `weight_lb` value takes a single
// required `userId` and binds it into the WHERE clause. There is deliberately NO "load every
// user's weights" function in this file — a future stats/aggregate route (Phase 3B, spec §9's
// `/api/stats/weight`) cannot accidentally pull raw pounds across people, because the only import
// available from here is already scoped to one person. If a percent-lost aggregate is ever built,
// it must compute the percentage per user via `loadWeightSeriesForUser` one call at a time and
// discard `weight_lb` before assembling its response — never add a cross-user SELECT here.
import type { WeightEntry } from '../../src/types'

export interface WeightEntryRow {
  user_id: string
  log_date: string
  weight_lb: number
  is_baseline: number // D1 stores 0|1
  updated_at: string
}

const WEIGHT_COLUMNS = `user_id, log_date, weight_lb, is_baseline, updated_at`
const BASELINE_ON = 1
const BASELINE_OFF = 0

function parseWeightEntryRow(row: WeightEntryRow): WeightEntry {
  return {
    user_id: row.user_id,
    log_date: row.log_date,
    weight_lb: row.weight_lb,
    is_baseline: row.is_baseline === BASELINE_ON,
    updated_at: row.updated_at,
  }
}

/** The full dated series for exactly one person, oldest first. Spec §8.6's sparkline and entry
 * list both read from this single call — there is no separate "recent only" variant. */
export async function loadWeightSeriesForUser(
  db: D1Database,
  userId: string,
): Promise<WeightEntry[]> {
  const result = await db
    .prepare(`SELECT ${WEIGHT_COLUMNS} FROM weight_entries WHERE user_id = ? ORDER BY log_date ASC`)
    .bind(userId)
    .all<WeightEntryRow>()
  return (result.results ?? []).map(parseWeightEntryRow)
}

/** One person's entry for one date, or null if never logged. Used to build canonical responses
 * after a write and to check existence before a delete/baseline call. */
export async function loadWeightEntry(
  db: D1Database,
  userId: string,
  date: string,
): Promise<WeightEntry | null> {
  const row = await db
    .prepare(`SELECT ${WEIGHT_COLUMNS} FROM weight_entries WHERE user_id = ? AND log_date = ?`)
    .bind(userId, date)
    .first<WeightEntryRow>()
  return row ? parseWeightEntryRow(row) : null
}

/**
 * Upsert one dated entry. Never touches `is_baseline` on conflict — editing/correcting an
 * existing weigh-in (spec §8.6: "this is the primary way to correct a mistyped or missed
 * weigh-in") must not silently move the baseline flag off a row the family already set on
 * purpose. Baseline only ever moves via `setBaselineEntry`.
 */
export async function upsertWeightEntry(
  db: D1Database,
  userId: string,
  date: string,
  weightLb: number,
  updatedAtIso: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO weight_entries (user_id, log_date, weight_lb, is_baseline, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, log_date)
       DO UPDATE SET weight_lb = excluded.weight_lb, updated_at = excluded.updated_at`,
    )
    .bind(userId, date, weightLb, BASELINE_OFF, updatedAtIso)
    .run()
}

export async function deleteWeightEntry(db: D1Database, userId: string, date: string): Promise<void> {
  await db
    .prepare(`DELETE FROM weight_entries WHERE user_id = ? AND log_date = ?`)
    .bind(userId, date)
    .run()
  // No baseline reassignment needed here: if the deleted row held is_baseline = 1, no row for
  // this user is flagged afterward, and spec §8.6's default ("baseline defaults to the earliest
  // entry" when nothing is explicitly flagged) already re-derives correctly the next time
  // src/lib/weight.ts's resolveBaselineEntry runs over the remaining series.
}

/**
 * Moves the unique `is_baseline` flag (spec §5's `ux_weight_baseline`) to exactly one entry for
 * one person. Clears any prior baseline first so the two UPDATEs in this batch never collide with
 * the unique index — D1 runs `db.batch()` as a single transaction, so no reader can ever observe
 * zero or two baselines for this user mid-flight either.
 */
export async function setBaselineEntry(
  db: D1Database,
  userId: string,
  date: string,
  updatedAtIso: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(`UPDATE weight_entries SET is_baseline = ? WHERE user_id = ? AND is_baseline = ?`)
      .bind(BASELINE_OFF, userId, BASELINE_ON),
    db
      .prepare(
        `UPDATE weight_entries SET is_baseline = ?, updated_at = ? WHERE user_id = ? AND log_date = ?`,
      )
      .bind(BASELINE_ON, updatedAtIso, userId, date),
  ])
}
