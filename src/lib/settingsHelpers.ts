// Pure date-logic helpers backing the Settings screen's two fairness rules (spec §4.4, §8.7).
// Extracted from the section components so they're independently testable — Appendix B/CLAUDE.md
// calls out effective-date and scoring-window logic specifically as code that fails silently if
// wrong, and a React component file is not where that gets unit-tested.
import { addDays, compareDates, daysBetween } from './dates'

/**
 * Spec §8.7: "Adding mid-challenge sets active_from to that date — no backfilled history."
 * Docs/DECISIONS.md 2026-08-24: this is a Settings-form default, not server behavior — the server
 * accepts whatever `active_from` (or none) the client sends. Forward-dated only: if the challenge
 * has already started, a newly added person starts today; if it hasn't started yet (pre-launch
 * roster setup), they're present from the very beginning (`null` = since challenge start).
 */
export function computeDefaultActiveFrom(serverToday: string, challengeStart: string): string | null {
  return compareDates(serverToday, challengeStart) > 0 ? serverToday : null
}

/** Spec §4.4: "New rules default to effective_from = tomorrow." */
export function defaultRuleEffectiveFrom(serverToday: string): string {
  return addDays(serverToday, 1)
}

/**
 * Spec §4.4: "Backdating is allowed but requires confirming a warning that names the date and
 * states how many past days it opens for every participant." A rule effective ON today or in the
 * future is never a backdate — only a strictly-past effective_from opens already-elapsed days.
 */
export function isRuleBackdated(effectiveFrom: string, serverToday: string): boolean {
  return compareDates(effectiveFrom, serverToday) < 0
}

/**
 * How many PAST days (strictly before serverToday) a backdated `effective_from` opens for every
 * participant (spec §4.4's "how many past days it opens"). Today itself is never counted here —
 * a rule created today is visible today regardless of backdating, so today isn't a day the
 * backdate "opens"; only effective_from..yesterday, inclusive, is newly reachable. That span's
 * length is exactly `daysBetween(effectiveFrom, serverToday)` (dates.ts: "inclusive whole-day
 * count from a to b" — src/lib/dates.test.ts asserts this is 180 for the 181-day challenge
 * window, i.e. one less than the full inclusive span, which is the same "today doesn't count"
 * shape this function needs). 0 for a non-backdated date — callers gate the warning itself on
 * `isRuleBackdated` and should treat this as informational only otherwise.
 */
export function daysRuleWouldOpen(effectiveFrom: string, serverToday: string): number {
  if (!isRuleBackdated(effectiveFrom, serverToday)) return 0
  return daysBetween(effectiveFrom, serverToday)
}
