// Pure, DB-free date-range and ranking math for the §8.5 Standings aggregates. Split out from
// `functions/_lib/stats.ts` (which touches D1) the same way `scoring.ts` (pure) is split from
// `logs.ts` (DB) — so the parts Appendix B calls out as needing tests ("aggregate/tie/effective-
// window logic") are directly unit-testable with no database or Workers runtime involved.
//
// CLAUDE.md hard rule this file exists to serve: "Every server-side aggregate must respect
// active_from/active_to/status — archived people keep history but drop out of standings from
// active_to forward." Every stats route intersects a user's active window (and, for rules, the
// rule's effective window) with the requested period BEFORE querying D1, using only the exports
// below plus `src/lib/dates.ts` — no ad hoc date arithmetic in a route file.
import { addDays, compareDates, daysBetween } from '../../src/lib/dates'

export interface DateRange {
  start: string // YYYY-MM-DD, inclusive
  end: string // YYYY-MM-DD, inclusive
}

function laterOf(a: string, b: string): string {
  return compareDates(a, b) >= 0 ? a : b
}

function earlierOf(a: string, b: string): string {
  return compareDates(a, b) <= 0 ? a : b
}

/** The overlap of two inclusive ranges, or null when they don't overlap at all. */
export function intersectRanges(a: DateRange, b: DateRange): DateRange | null {
  const start = laterOf(a.start, b.start)
  const end = earlierOf(a.end, b.end)
  return compareDates(start, end) > 0 ? null : { start, end }
}

/**
 * Inclusive day count. `daysBetween` in `src/lib/dates.ts` returns the epoch-day *difference*
 * (0 for the same date), not an inclusive count — its own doc comment says "inclusive," but the
 * implementation doesn't add the +1; that file isn't owned by this track (shared foundation, see
 * CLAUDE.md file ownership), so the discrepancy is worked around here rather than "fixed" in a
 * file three concurrent tracks depend on. `+1` below is the actual inclusive count.
 */
export function inclusiveDayCount(range: DateRange | null): number {
  if (range === null) return 0
  return daysBetween(range.start, range.end) + 1
}

/** Caps a range's end at `cap` (e.g. `serverToday`) — a day that hasn't happened can't be a hit
 * or a miss yet. Returns null if the range starts after the cap. */
export function capRangeEnd(range: DateRange | null, cap: string): DateRange | null {
  if (range === null) return null
  const end = earlierOf(range.end, cap)
  return compareDates(range.start, end) > 0 ? null : { start: range.start, end }
}

export interface UserWindowInput {
  active_from: string | null
  active_to: string | null // spec §5/§9: the FIRST excluded date — "drop out ... from active_to forward"
}

/**
 * A user's active window, clipped to the challenge window. `active_to` is the first date they no
 * longer count (exclusive), unlike a rule's `effective_to` (inclusive) — spec §9: "removes them
 * from standings from that date forward." Returns null if the user has no active days at all
 * within the challenge (e.g. added after it ends, or archived before it starts).
 */
export function userActiveWindow(user: UserWindowInput, challengeRange: DateRange): DateRange | null {
  const start = user.active_from === null ? challengeRange.start : laterOf(challengeRange.start, user.active_from)
  const end = user.active_to === null
    ? challengeRange.end
    : earlierOf(challengeRange.end, addDays(user.active_to, -1))
  return compareDates(start, end) > 0 ? null : { start, end }
}

export interface RuleWindowInput {
  effective_from: string | null
  effective_to: string | null // inclusive — matches src/lib/dates.ts's isRuleEffectiveOnDate
}

/** A rule's effective window, clipped to the challenge window. `effective_to` is inclusive. */
export function ruleEffectiveWindow(rule: RuleWindowInput, challengeRange: DateRange): DateRange | null {
  const start = rule.effective_from === null ? challengeRange.start : laterOf(challengeRange.start, rule.effective_from)
  const end = rule.effective_to === null ? challengeRange.end : earlierOf(challengeRange.end, rule.effective_to)
  return compareDates(start, end) > 0 ? null : { start, end }
}

// ---------------------------------------------------------------------------
// Tie handling (spec §8.5, §13#2) — standard competition ranking ("1224"):
// ties share the lower rank number, and the next distinct score skips ahead
// by the number of people tied. Never auto-broken.
// ---------------------------------------------------------------------------

export interface RankableTotal {
  user_id: string
  points_total: number
}

export interface RankedTotal extends RankableTotal {
  rank: number
  tied: boolean
}

/**
 * Spec §8.5: "Ties display as a shared position with a T prefix and are never auto-broken."
 * The spec's mockup only ever exercises a tie at the leader's position, but the prose is general
 * ("ties display as a shared position") — this implements ties at any rank, not just first place,
 * since narrowing to "leader only" would be inventing a restriction the spec text doesn't state.
 * Sort is by `points_total` descending; ties are broken only for stable list order (never for the
 * rank/tied fields) by the order entries were passed in.
 */
export function computeStandardCompetitionRanks(totals: readonly RankableTotal[]): RankedTotal[] {
  const sorted = [...totals].sort((a, b) => b.points_total - a.points_total)

  const ranks: number[] = []
  for (let index = 0; index < sorted.length; index += 1) {
    const isFirst = index === 0
    const samePointsAsPrevious = !isFirst && sorted[index].points_total === sorted[index - 1].points_total
    ranks.push(samePointsAsPrevious ? ranks[index - 1] : index + 1)
  }

  const countByRank = new Map<number, number>()
  for (const rank of ranks) countByRank.set(rank, (countByRank.get(rank) ?? 0) + 1)

  return sorted.map((entry, index) => ({
    ...entry,
    rank: ranks[index],
    tied: (countByRank.get(ranks[index]) ?? 0) > 1,
  }))
}
