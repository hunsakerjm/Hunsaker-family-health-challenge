// D1-touching aggregation for the §8.5 Standings screen: leaderboard, per-rule completion
// (radar/consistency), the ribbon, and weight percentages. Every date-range/window decision is
// delegated to the pure helpers in `functions/_lib/statsMath.ts` — this file's job is only to turn
// an already-resolved date range into a SQL query and a wire-shaped result.
//
// Spec §9 rule this file exists to satisfy structurally: "Aggregate in SQL, not JavaScript." Point
// totals are `SUM(points)`/`COUNT`/`GROUP BY` over `log_entries`, whose `points` column is already
// the server-computed snapshot from write time (spec §4.3) — no rule needs to be re-evaluated to
// total a period. Only the (small, O(users × rules) ≤ ~100) window-intersection math for eligible
// windows is JavaScript, same as `maxPointsForDate`/`isRuleEffectiveOnDate` already are.
import type {
  User, Rule, LeaderboardEntry, RuleStatsEntry, RibbonUserRow, RibbonDayCell, WeightStatsEntry,
} from '../../src/types'
import { addDays, compareDates, getMonthBoundaries, maxPointsForDate } from '../../src/lib/dates'
import {
  type DateRange,
  capRangeEnd,
  computeStandardCompetitionRanks,
  inclusiveDayCount,
  intersectRanges,
  ruleEffectiveWindow,
  userActiveWindow,
} from './statsMath'

// ---------------------------------------------------------------------------
// Period resolution — spec §9: GET .../stats/leaderboard?period=month|all&month=YYYY-MM
// ---------------------------------------------------------------------------

const MONTH_STRING_PATTERN = /^\d{4}-\d{2}$/

export function isValidMonthString(value: string): boolean {
  return MONTH_STRING_PATTERN.test(value)
}

/** Null return means the caller gave an invalid/missing `month` for `period=month` — a 400. */
export function resolvePeriodRange(
  period: 'month' | 'all',
  month: string | undefined,
  challengeRange: DateRange,
): DateRange | null {
  if (period === 'all') return challengeRange
  if (month === undefined || !isValidMonthString(month)) return null
  return getMonthBoundaries(month)
}

// ---------------------------------------------------------------------------
// Shared population filter — every points-based widget (leaderboard, radar, consistency, ribbon)
// starts from the same set: points-challenge participants whose active window overlaps the
// challenge at all. A user with zero overlap with the *requested period* is filtered out later,
// per widget, once that period's range is known.
// ---------------------------------------------------------------------------

interface WindowedUser {
  user: User
  window: DateRange
}

function pointsEligibleUsers(users: readonly User[], challengeRange: DateRange): WindowedUser[] {
  const result: WindowedUser[] = []
  for (const user of users) {
    if (!user.in_points_challenge) continue
    const window = userActiveWindow(user, challengeRange)
    if (window !== null) result.push({ user, window })
  }
  return result
}

// ---------------------------------------------------------------------------
// Leaderboard (spec §8.5 #1, §9) — also powers the Consistency widget (§8.5 #4): days_logged and
// avg_points_per_logged_day are the same per-person totals query for the same period, so
// `LeaderboardEntry` already carries both (see src/types.ts) rather than a second endpoint.
// ---------------------------------------------------------------------------

interface UserPeriodRow {
  user: User
  range: DateRange
}

export async function loadLeaderboardEntries(
  db: D1Database,
  users: readonly User[],
  periodRange: DateRange,
  challengeRange: DateRange,
): Promise<LeaderboardEntry[]> {
  const rows: UserPeriodRow[] = []
  for (const { user, window } of pointsEligibleUsers(users, challengeRange)) {
    const range = intersectRanges(window, periodRange)
    if (range !== null) rows.push({ user, range })
  }
  if (rows.length === 0) return []

  const statement = db.prepare(
    `SELECT COALESCE(SUM(points), 0) as points_total, COUNT(DISTINCT log_date) as days_logged
     FROM log_entries WHERE user_id = ? AND log_date >= ? AND log_date <= ?`,
  )
  const batchResults = await db.batch<{ points_total: number; days_logged: number }>(
    rows.map(({ user, range }) => statement.bind(user.id, range.start, range.end)),
  )

  const totals = rows.map(({ user }, index) => {
    const row = batchResults[index].results[0]
    return { user, pointsTotal: row?.points_total ?? 0, daysLogged: row?.days_logged ?? 0 }
  })

  const ranked = computeStandardCompetitionRanks(
    totals.map((t) => ({ user_id: t.user.id, points_total: t.pointsTotal })),
  )
  const rankByUserId = new Map(ranked.map((r) => [r.user_id, r]))

  return totals.map(({ user, pointsTotal, daysLogged }): LeaderboardEntry => {
    const rank = rankByUserId.get(user.id)
    return {
      user_id: user.id,
      display_name: user.display_name,
      color_key: user.color_key,
      emoji: user.emoji,
      points_total: pointsTotal,
      rank: rank?.rank ?? 1,
      tied: rank?.tied ?? false,
      days_logged: daysLogged,
      avg_points_per_logged_day: daysLogged > 0 ? pointsTotal / daysLogged : 0,
    }
  })
}

// ---------------------------------------------------------------------------
// Rule stats (spec §8.5 #3, §9) — powers the radar. One row per (eligible user × rule), always
// present even at 0/0, so the client can draw a complete spoke set for everyone shown.
// ---------------------------------------------------------------------------

interface RulePair {
  user: User
  rule: Rule
  range: DateRange | null // null = zero eligible days for this user×rule×period
}

export async function loadRuleStatsEntries(
  db: D1Database,
  users: readonly User[],
  rules: readonly Rule[],
  periodRange: DateRange,
  challengeRange: DateRange,
  serverToday: string,
): Promise<RuleStatsEntry[]> {
  const pairs: RulePair[] = []
  for (const { user, window } of pointsEligibleUsers(users, challengeRange)) {
    // Capped at serverToday: a day that hasn't happened is neither a hit nor a miss yet (spec
    // §8.5's completion rate would otherwise be dragged down by future, not-yet-lived days).
    const userRange = capRangeEnd(intersectRanges(window, periodRange), serverToday)
    for (const rule of rules) {
      if (userRange === null) {
        pairs.push({ user, rule, range: null })
        continue
      }
      const ruleWindow = ruleEffectiveWindow(rule, challengeRange)
      const range = ruleWindow === null ? null : intersectRanges(ruleWindow, userRange)
      pairs.push({ user, rule, range })
    }
  }

  const queryablePairs = pairs.filter(
    (pair): pair is RulePair & { range: DateRange } => pair.range !== null,
  )
  const statement = db.prepare(
    `SELECT COUNT(*) as hits FROM log_entries
     WHERE user_id = ? AND rule_key = ? AND log_date >= ? AND log_date <= ? AND points > 0`,
  )
  const batchResults = queryablePairs.length > 0
    ? await db.batch<{ hits: number }>(
      queryablePairs.map((pair) => statement.bind(pair.user.id, pair.rule.key, pair.range.start, pair.range.end)),
    )
    : []

  let queryIndex = 0
  return pairs.map((pair): RuleStatsEntry => {
    const eligibleDays = inclusiveDayCount(pair.range)
    let hits = 0
    if (pair.range !== null) {
      hits = batchResults[queryIndex]?.results[0]?.hits ?? 0
      queryIndex += 1
    }
    return {
      user_id: pair.user.id,
      rule_key: pair.rule.key,
      hits,
      eligible_days: eligibleDays,
      completion_rate: eligibleDays > 0 ? hits / eligibleDays : 0,
    }
  })
}

// ---------------------------------------------------------------------------
// Ribbon (spec §8.5 #2, §9) — the signature element. One row per eligible user, one cell per
// calendar day of the month, `eligible: false` for days outside that person's active window or
// the challenge window (e.g. joined mid-challenge) so the client never has to guess "unlogged" vs
// "wasn't part of the challenge yet" — see Docs/PHASE3B_LOG.md for why this field was added to
// `RibbonDayCell` (an additive, backward-compatible contract change; no other track reads it yet).
// "Unlogged" itself is `rules: {}` (no log_entries rows at all for that day) vs "logged, zero
// points" (rows exist with value/points 0) — that distinction already exists in the contract via
// an empty vs non-empty `rules` object, so no separate flag was needed for it.
// ---------------------------------------------------------------------------

interface LogEntryRow {
  log_date: string
  rule_key: string
  value: number
  points: number
}

export async function loadRibbonRows(
  db: D1Database,
  users: readonly User[],
  rules: readonly Rule[],
  monthRange: DateRange,
  challengeRange: DateRange,
): Promise<RibbonUserRow[]> {
  const eligibleUsers = pointsEligibleUsers(users, challengeRange)
    .filter(({ window }) => intersectRanges(window, monthRange) !== null)
  if (eligibleUsers.length === 0) return []

  const statement = db.prepare(
    `SELECT log_date, rule_key, value, points FROM log_entries
     WHERE user_id = ? AND log_date >= ? AND log_date <= ? ORDER BY log_date ASC`,
  )
  const batchResults = await db.batch<LogEntryRow>(
    eligibleUsers.map(({ user }) => statement.bind(user.id, monthRange.start, monthRange.end)),
  )

  return eligibleUsers.map(({ user, window }, index): RibbonUserRow => {
    const rows = batchResults[index].results
    const byDate = new Map<string, { rules: Record<string, number>; points: number }>()
    for (const row of rows) {
      const bucket = byDate.get(row.log_date) ?? { rules: {}, points: 0 }
      bucket.rules[row.rule_key] = row.value
      bucket.points += row.points
      byDate.set(row.log_date, bucket)
    }

    const days: RibbonDayCell[] = []
    let cursor = monthRange.start
    while (compareDates(cursor, monthRange.end) <= 0) {
      const bucket = byDate.get(cursor)
      const eligible = isWithinRange(cursor, window) && isWithinRange(cursor, challengeRange)
      days.push({
        log_date: cursor,
        points: bucket?.points ?? 0,
        max_points_for_date: maxPointsForDate(rules, cursor),
        rules: bucket?.rules ?? {},
        eligible,
      })
      cursor = addDays(cursor, 1)
    }

    return { user_id: user.id, display_name: user.display_name, color_key: user.color_key, days }
  })
}

function isWithinRange(date: string, range: DateRange): boolean {
  return compareDates(date, range.start) >= 0 && compareDates(date, range.end) <= 0
}

// ---------------------------------------------------------------------------
// Weight percentages (spec §8.5 #5, §8.6, §9, §13#9) — the hard privacy rule. See
// `computeWeightPercentLost` below: it is the only function anywhere in this codebase permitted to
// read `weight_entries.weight_lb` for an aggregate view, and its return type makes leaking a
// pound value structurally impossible for any caller, not just a matter of this file's discipline.
// ---------------------------------------------------------------------------

interface WeightExtremesRow {
  baseline_flagged: number | null
  earliest: number | null
  latest: number | null
}

/**
 * Returns a percent-lost figure only — never an object that could carry a pound value through to
 * a caller by accident. `null` means the person has no weight entries yet. Baseline is the
 * `is_baseline` row if one is set, else the earliest entry (spec §8.6).
 */
export async function computeWeightPercentLost(db: D1Database, userId: string): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT weight_lb FROM weight_entries WHERE user_id = ? AND is_baseline = 1) as baseline_flagged,
         (SELECT weight_lb FROM weight_entries WHERE user_id = ? ORDER BY log_date ASC LIMIT 1) as earliest,
         (SELECT weight_lb FROM weight_entries WHERE user_id = ? ORDER BY log_date DESC LIMIT 1) as latest`,
    )
    .bind(userId, userId, userId)
    .first<WeightExtremesRow>()

  if (!row || row.latest === null) return null
  const baseline = row.baseline_flagged ?? row.earliest
  if (baseline === null || baseline === 0) return null
  return ((baseline - row.latest) / baseline) * 100
}

/** Spec §8.5 #5: "Only people with in_weight_challenge = 1 appear" — a live roster view, so
 * archived people (however historically relevant) are excluded, unlike the period-based widgets
 * above which honor a person's *past* active window. */
export async function loadWeightStatsEntries(
  db: D1Database,
  users: readonly User[],
): Promise<WeightStatsEntry[]> {
  const candidates = users.filter((user) => user.in_weight_challenge && user.status === 'active')
  const entries: WeightStatsEntry[] = []
  for (const user of candidates) {
    const percentLost = await computeWeightPercentLost(db, user.id)
    if (percentLost === null) continue
    entries.push({
      user_id: user.id,
      display_name: user.display_name,
      color_key: user.color_key,
      emoji: user.emoji,
      percent_lost: percentLost,
    })
  }
  return entries.sort((a, b) => b.percent_lost - a.percent_lost)
}
