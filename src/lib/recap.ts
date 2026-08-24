// Month recap — spec §11.2 "Month recap". Pure date/eligibility/formatting logic only, so it can
// be unit-tested without rendering `src/screens/MonthRecap.tsx`. All date math routes through
// `src/lib/dates.ts` in the challenge timezone (CLAUDE.md) — this file never constructs a `Date`
// from a bare `YYYY-MM-DD` string itself.

import type { LogEntry } from '../types'
import type { CelebrationIntensity } from './celebration'
import { getMonthKey, stepMonthKey } from './dates'

// ---------------------------------------------------------------------------
// Eligibility (spec §11.2: suppressed in the first month, fires once per new month per person per
// device, still fires the month after the challenge ends)
// ---------------------------------------------------------------------------

export interface RecapEligibilityInput {
  /** Server-computed "today" (spec §6) — never the client clock. */
  serverToday: string
  challengeStart: string
  challengeEnd: string
  /** The raw value read from the `lastRecapShown` localStorage key, or `null` if never shown. */
  lastRecapShown: string | null
}

export interface RecapEligibility {
  eligible: boolean
  /** The calendar-month key `serverToday` falls in — write this back to `lastRecapShown` when
   *  the panel is dismissed, regardless of which month is being recapped. */
  currentMonthKey: string
  /** The month key being recapped (the month before `currentMonthKey`), or `null` when not
   *  eligible — there is nothing to fetch or show. */
  recapMonthKey: string | null
}

function compareMonthKeys(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Decide whether a month recap should show on this open, and which month it recaps.
 *
 * The three rules from §11.2 collapse into two month-key comparisons plus a dedup check:
 * - "Suppressed in the challenge's first month" falls out for free — the month before the
 *   challenge's first month is before `challengeStart`'s own month, so `hasPriorMonth` is false.
 * - "Still fires on the first of the month after the challenge ends" is the `withinChallengeSpan`
 *   check: the recapped month only has to fall at or before the challenge's last month, so the
 *   final month (recapped from the month right after) still passes.
 * - Once two full months have passed since the challenge ended, the recapped month would fall
 *   after `challengeEnd`'s month too, and `withinChallengeSpan` turns off recaps for good.
 */
export function getRecapEligibility(input: RecapEligibilityInput): RecapEligibility {
  const currentMonthKey = getMonthKey(input.serverToday)
  const recapMonthKey = stepMonthKey(currentMonthKey, -1)
  const challengeStartMonthKey = getMonthKey(input.challengeStart)
  const challengeEndMonthKey = getMonthKey(input.challengeEnd)

  const hasPriorMonth = compareMonthKeys(recapMonthKey, challengeStartMonthKey) >= 0
  const withinChallengeSpan = compareMonthKeys(recapMonthKey, challengeEndMonthKey) <= 0
  const alreadyShownThisMonth = input.lastRecapShown === currentMonthKey

  const eligible = hasPriorMonth && withinChallengeSpan && !alreadyShownThisMonth

  return {
    eligible,
    currentMonthKey,
    recapMonthKey: eligible ? recapMonthKey : null,
  }
}

// ---------------------------------------------------------------------------
// Content (spec §11.2: hero total, or a plain zero-entry statement)
// ---------------------------------------------------------------------------

/** Sum of `points` across the given entries. Callers pass entries already filtered to one user
 *  and one month (e.g. via `getLogs({ userId, from, to })`). */
export function sumPointsForMonth(entries: readonly LogEntry[]): number {
  return entries.reduce((total, entry) => total + entry.points, 0)
}

/** §11.2: "if the person logged nothing" — literally no rows, not "points summed to zero." A
 *  counter rule logged at 0 is still an entry; it just doesn't happen to be worth anything. */
export function hasAnyEntries(entries: readonly LogEntry[]): boolean {
  return entries.length > 0
}

const MONTH_LONG_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' })

/** `"2026-09"` -> `"September"`. UTC is deliberate here, mirroring `formatDisplayDate` in
 *  `dates.ts` — a `YYYY-MM` key has no timezone of its own to begin with. */
export function monthLongLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return MONTH_LONG_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)))
}

export interface RecapDisplay {
  hasEntries: boolean
  /** The hero number to render large, in the person's color. `null` when there is nothing to
   *  celebrate — §11.2 is explicit that a zero-entry month must not read as an achievement. */
  heroValue: number | null
  /** Always present: either a caption under the hero number, or the plain zero-entry statement
   *  standing in for it, e.g. "No entries logged in September". */
  message: string
}

export function buildRecapDisplay(monthLabel: string, total: number, hasEntries: boolean): RecapDisplay {
  if (!hasEntries) {
    return {
      hasEntries: false,
      heroValue: null,
      message: `No entries logged in ${monthLabel}`,
    }
  }
  return {
    hasEntries: true,
    heroValue: total,
    message: `${monthLabel} total`,
  }
}

// ---------------------------------------------------------------------------
// Burst gating (spec §11.2: no burst under `subtle`, no burst on a zero-entry month)
// ---------------------------------------------------------------------------

/** Whether the recap's burst should fire at all. Both conditions are hard suppressions, not
 *  intensity scaling — a zero-entry month gets no burst even under `full`, and `subtle` gets no
 *  burst even on a big month. Only `full` with real entries fires. */
export function shouldFireRecapBurst(intensity: CelebrationIntensity, hasEntries: boolean): boolean {
  return intensity === 'full' && hasEntries
}
