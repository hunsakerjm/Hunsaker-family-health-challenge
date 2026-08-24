// All date math for the challenge, in the challenge timezone (spec §6). This is the single
// implementation shared by the client (via `src/`) and the server (Pages Functions import this
// same file — see `functions/_lib/dates.ts`), so "today," month boundaries, and the daily point
// maximum are computed identically everywhere and never drift.
//
// The rule that makes this file safe: every date here is a calendar-date string, `YYYY-MM-DD`,
// never a `Date` built from that string directly. `new Date('2026-09-01')` parses as UTC midnight
// and renders as 2026-08-31 in any timezone west of UTC — the exact bug spec §6 calls out. Every
// function below either takes a `YYYY-MM-DD` string and does integer arithmetic on it, or takes a
// real instant (a `Date`) and asks `Intl.DateTimeFormat` to render it in a named timezone. Neither
// path ever round-trips through the ambiguous `Date` string parser.

import type { Rule, CounterRuleConfig } from '../types'

const MS_PER_DAY = 86_400_000
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface DateParts {
  year: number
  month: number // 1-indexed, matches the string
  day: number
}

function assertValidDateString(date: string): void {
  if (!DATE_STRING_PATTERN.test(date)) {
    throw new RangeError(`Expected a YYYY-MM-DD date string, got: ${date}`)
  }
}

function parseDateString(date: string): DateParts {
  assertValidDateString(date)
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

function formatDateParts({ year, month, day }: DateParts): string {
  const yyyy = String(year).padStart(4, '0')
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Calendar dates as "days since the epoch," so addition/subtraction/comparison is plain integer
// math with no timezone or DST involved — a calendar date is not an instant, and shouldn't be
// treated like one just because a `Date` object is convenient for the day-count arithmetic.
function toEpochDay(date: string): number {
  const { year, month, day } = parseDateString(date)
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

function fromEpochDay(epochDay: number): string {
  const instant = new Date(epochDay * MS_PER_DAY)
  return formatDateParts({
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  })
}

/** Adds (or subtracts, for a negative `days`) whole days to a calendar date string. */
export function addDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days)
}

/** -1 if `a` is earlier, 1 if later, 0 if the same calendar date. */
export function compareDates(a: string, b: string): number {
  const diff = toEpochDay(a) - toEpochDay(b)
  return Math.sign(diff)
}

/** Inclusive whole-day count from `a` to `b`. Negative when `b` is before `a`. */
export function daysBetween(a: string, b: string): number {
  return toEpochDay(b) - toEpochDay(a)
}

function earlierOf(a: string, b: string): string {
  return compareDates(a, b) <= 0 ? a : b
}

function laterOf(a: string, b: string): string {
  return compareDates(a, b) >= 0 ? a : b
}

/** True when `date` falls within `[min, max]`, inclusive on both ends. */
export function isDateInRange(date: string, min: string, max: string): boolean {
  return compareDates(date, min) >= 0 && compareDates(date, max) <= 0
}

/** The `YYYY-MM` calendar-month key a date falls in. */
export function getMonthKey(date: string): string {
  const { year, month } = parseDateString(date)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

export interface MonthBoundaries {
  start: string // YYYY-MM-DD, the 1st
  end: string // YYYY-MM-DD, the last calendar day of that month
}

/** Calendar-month start/end for a `YYYY-MM` key, in the challenge timezone (spec §6). */
export function getMonthBoundaries(monthKey: string): MonthBoundaries {
  const [yearString, monthString] = monthKey.split('-')
  const year = Number(yearString)
  const month = Number(monthString)
  const start = formatDateParts({ year, month, day: 1 })
  // Day 0 of "next month" is the last day of this month — a standard, DST-immune trick because
  // it's pure calendar arithmetic (UTC-based epoch days), not an elapsed-time calculation.
  const lastDayInstant = new Date(Date.UTC(year, month, 0))
  const end = formatDateParts({
    year: lastDayInstant.getUTCFullYear(),
    month: lastDayInstant.getUTCMonth() + 1,
    day: lastDayInstant.getUTCDate(),
  })
  return { start, end }
}

// ---------------------------------------------------------------------------
// "Today," computed server-side (spec §6)
// ---------------------------------------------------------------------------

// WARNING: this function exists to let the SERVER compute `serverToday` for the
// `/api/bootstrap` response (spec §6). The client must never call this with its own clock — it
// must always read `serverToday` from bootstrap. A phone with a wrong clock, or a traveling family
// member, must still log to the same day as everyone else, which only works if "today" has exactly
// one source of truth: the server, in the challenge timezone.
//
// Never a hand-rolled UTC offset (e.g. "UTC-8") — that breaks across DST every year, which is
// exactly why `America/Los_Angeles` shifts on 2026-11-01 and 2027-03-08/2027-03-14 (see
// `Docs/PHASE1B_LOG.md` for the discrepancy between those last two dates). `Intl.DateTimeFormat`
// with a named IANA zone resolves the correct offset for any instant automatically.
export function computeServerTodayInTimezone(timezone: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA renders as YYYY-MM-DD, exactly the log_date shape spec §6 requires — no manual
  // reassembly of formatToParts() needed.
  return formatter.format(now)
}

// ---------------------------------------------------------------------------
// Editable range (spec §6)
// ---------------------------------------------------------------------------

export interface EditableRangeConfig {
  challenge_start: string
  challenge_end: string
  future_logging_days: number
  backfill_limit_days: number // 0 = unlimited past editing
}

const UNLIMITED_BACKFILL = 0

/**
 * Spec §6: "Editable range: [challenge_start, min(challenge_end, serverToday +
 * future_logging_days)], further constrained by backfill_limit_days when nonzero."
 */
export function getEditableDateRange(
  config: EditableRangeConfig,
  serverToday: string,
): { min: string; max: string } {
  const futureLimit = addDays(serverToday, config.future_logging_days)
  const max = earlierOf(config.challenge_end, futureLimit)

  const min =
    config.backfill_limit_days === UNLIMITED_BACKFILL
      ? config.challenge_start
      : laterOf(config.challenge_start, addDays(serverToday, -config.backfill_limit_days))

  return { min, max }
}

export function isDateEditable(
  date: string,
  config: EditableRangeConfig,
  serverToday: string,
): boolean {
  const { min, max } = getEditableDateRange(config, serverToday)
  return isDateInRange(date, min, max)
}

// ---------------------------------------------------------------------------
// maxPointsForDate (spec §4.3) — never hardcode 6, 181, or 1086 (CLAUDE.md)
// ---------------------------------------------------------------------------

// Only the fields maxPointsForDate actually needs, so callers (server routes, tests, future
// screens showing an "out of N" label) can pass a full `Rule` or a minimal fixture interchangeably.
export type RuleForMaxPoints = Pick<
  Rule,
  'type' | 'points' | 'config' | 'effective_from' | 'effective_to' | 'enabled'
>

function isRuleEffectiveOnDate(rule: RuleForMaxPoints, date: string): boolean {
  if (!rule.enabled) return false
  if (rule.effective_from !== null && compareDates(date, rule.effective_from) < 0) return false
  if (rule.effective_to !== null && compareDates(date, rule.effective_to) > 0) return false
  return true
}

function maxPointsForRule(rule: RuleForMaxPoints): number {
  // boolean: full points or nothing. threshold: full points if the comparison holds, else
  // nothing. Either way the ceiling is just the rule's point value — only `counter` scales.
  if (rule.type === 'counter') {
    const config = rule.config as CounterRuleConfig
    return config.max * rule.points
  }
  return rule.points
}

/**
 * The sum of maximum achievable points across every rule effective on `date` (spec §4.3). This is
 * the ONLY place a daily denominator may be computed — every "out of N" label, calendar pip
 * meter, and completion-percentage calculation must call this rather than assume any fixed number.
 */
export function maxPointsForDate(rules: readonly RuleForMaxPoints[], date: string): number {
  return rules
    .filter((rule) => isRuleEffectiveOnDate(rule, date))
    .reduce((total, rule) => total + maxPointsForRule(rule), 0)
}
