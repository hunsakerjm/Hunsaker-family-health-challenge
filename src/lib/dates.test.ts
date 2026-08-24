// Appendix B, area 1: "month boundaries, the challenge start and end dates, and both DST
// transitions (2026-11-01, 2027-03-08)." Also covers maxPointsForDate (Appendix B, area 3):
// "correct denominators before, during, and after a rule's effective window" — it lives in this
// same module (src/lib/dates.ts), so its tests live in this same file.
//
// A note on the DST dates: per CLAUDE.md and the task brief, this suite tests both 2026-11-01 and
// 2027-03-08. Verified against Node's Intl API (see Docs/PHASE1B_LOG.md): 2026-11-01 is a real
// fall-back transition, but **2027-03-08 is a Monday and is NOT a real DST transition** — the
// actual 2027 spring-forward is the second Sunday, 2027-03-14 (2027-03-08 would have been correct
// for *2026*, not 2027). Both dates are tested below: 2027-03-08 to comply with the literal
// instruction (it is a normal day, so this case is trivial but harmless), and 2027-03-14 to
// actually exercise a spring-forward discontinuity, since that is the bug class DST tests exist
// to catch. Flagged for the owner/orchestrator to correct upstream.

import { describe, expect, it } from 'vitest'
import {
  addDays,
  compareDates,
  computeServerTodayInTimezone,
  daysBetween,
  formatDisplayDate,
  getEditableDateRange,
  getMonthBoundaries,
  getMonthKey,
  isDateEditable,
  isDateInRange,
  maxPointsForDate,
  type RuleForMaxPoints,
} from './dates'

const LA_TIMEZONE = 'America/Los_Angeles'
const CHALLENGE_START = '2026-09-01'
const CHALLENGE_END = '2027-02-28'

describe('addDays / compareDates / daysBetween', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
  })

  it('subtracts days across a year boundary', () => {
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('adds a day across the non-leap February challenge end', () => {
    expect(addDays(CHALLENGE_END, 1)).toBe('2027-03-01')
  })

  it('compares dates correctly regardless of ordering', () => {
    expect(compareDates('2026-09-01', '2026-09-02')).toBe(-1)
    expect(compareDates('2026-09-02', '2026-09-01')).toBe(1)
    expect(compareDates('2026-09-01', '2026-09-01')).toBe(0)
  })

  it('counts inclusive-style day spans, positive and negative', () => {
    expect(daysBetween(CHALLENGE_START, CHALLENGE_END)).toBe(180) // 181 calendar days apart minus 1
    expect(daysBetween(CHALLENGE_END, CHALLENGE_START)).toBe(-180)
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(0)
  })
})

describe('month boundaries', () => {
  it('gets the correct key for a date', () => {
    expect(getMonthKey('2026-09-15')).toBe('2026-09')
  })

  it('resolves a 30-day month', () => {
    expect(getMonthBoundaries('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('resolves a 31-day month', () => {
    expect(getMonthBoundaries('2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
  })

  // The challenge's own end month — 2027 is not a leap year, so this must resolve to the 28th,
  // exactly matching config.challenge_end, not a hardcoded 29th.
  it('resolves February in the challenge end year as 28 days (not a leap year)', () => {
    expect(getMonthBoundaries('2027-02')).toEqual({ start: '2027-02-01', end: '2027-02-28' })
  })

  it('resolves a leap-year February correctly, for contrast', () => {
    expect(getMonthBoundaries('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })
})

describe('challenge start and end dates', () => {
  it('treats the challenge start as inside its own range', () => {
    expect(isDateInRange(CHALLENGE_START, CHALLENGE_START, CHALLENGE_END)).toBe(true)
  })

  it('treats the challenge end as inside its own range', () => {
    expect(isDateInRange(CHALLENGE_END, CHALLENGE_START, CHALLENGE_END)).toBe(true)
  })

  it('treats the day before the challenge start as outside the range', () => {
    const dayBefore = addDays(CHALLENGE_START, -1)
    expect(isDateInRange(dayBefore, CHALLENGE_START, CHALLENGE_END)).toBe(false)
  })

  it('treats the day after the challenge end as outside the range', () => {
    const dayAfter = addDays(CHALLENGE_END, 1)
    expect(isDateInRange(dayAfter, CHALLENGE_START, CHALLENGE_END)).toBe(false)
  })
})

describe('computeServerTodayInTimezone across DST — the trap (spec §6)', () => {
  it('resolves correctly deep in PDT season (no transition nearby)', () => {
    expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2026-10-15T12:00:00Z'))).toBe(
      '2026-10-15',
    )
  })

  it('resolves correctly deep in PST season (no transition nearby)', () => {
    expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2026-12-15T12:00:00Z'))).toBe(
      '2026-12-15',
    )
  })

  describe('2026-11-01 fall-back (real transition, verified via Intl)', () => {
    it('is still Nov 1 just before local midnight, in the old PDT offset', () => {
      // 2026-11-02T07:59:00Z = 2026-11-01 23:59 PDT (UTC-7, pre-transition offset)
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2026-11-02T07:59:00Z'))).toBe(
        '2026-11-01',
      )
    })

    it('rolls to Nov 2 at local midnight, in the new PST offset', () => {
      // 2026-11-02T08:00:00Z = 2026-11-02 00:00 PST (UTC-8, post-transition offset)
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2026-11-02T08:00:00Z'))).toBe(
        '2026-11-02',
      )
    })

    it('stays on Nov 1 through the repeated 1am-2am hour the fall-back creates', () => {
      // 2026-11-01T08:30:00Z lands in the repeated hour (01:30, still ambiguous between PDT/PST)
      // but the calendar date must not move either way.
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2026-11-01T08:30:00Z'))).toBe(
        '2026-11-01',
      )
    })
  })

  describe('2027-03-08 (the literal date named in the task/spec — verified NOT a real transition)', () => {
    it('resolves as an ordinary day with no discontinuity', () => {
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2027-03-08T09:00:00Z'))).toBe(
        '2027-03-08',
      )
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2027-03-09T07:00:00Z'))).toBe(
        '2027-03-08',
      )
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2027-03-09T08:00:00Z'))).toBe(
        '2027-03-09',
      )
    })
  })

  describe('2027-03-14 spring-forward (the REAL 2027 transition, verified via Intl)', () => {
    it('is still Mar 14 just before local midnight, already in the new PDT offset', () => {
      // The 2am->3am jump happens on the morning of Mar 14 itself, so the evening of Mar 14 is
      // already PDT (UTC-7): 23:59 PDT Mar 14 = 06:59 UTC Mar 15.
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2027-03-15T06:59:00Z'))).toBe(
        '2027-03-14',
      )
    })

    it('rolls to Mar 15 at local midnight, still PDT', () => {
      // 2027-03-15T07:00:00Z = 2027-03-15 00:00 PDT (UTC-7)
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2027-03-15T07:00:00Z'))).toBe(
        '2027-03-15',
      )
    })

    it('skips the 2am-3am hour the spring-forward removes without skipping a calendar date', () => {
      // 2027-03-14T09:59:00Z = 01:59 PST, just before the jump to 03:00 PDT — still Mar 14.
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2027-03-14T09:59:00Z'))).toBe(
        '2027-03-14',
      )
      // 2027-03-14T10:00:00Z = 03:00 PDT, immediately after the jump — still Mar 14, same day.
      expect(computeServerTodayInTimezone(LA_TIMEZONE, new Date('2027-03-14T10:00:00Z'))).toBe(
        '2027-03-14',
      )
    })
  })
})

describe('getEditableDateRange / isDateEditable (spec §6)', () => {
  const baseConfig = {
    challenge_start: CHALLENGE_START,
    challenge_end: CHALLENGE_END,
    future_logging_days: 7,
    backfill_limit_days: 0,
  }

  it('caps the future edge at serverToday + future_logging_days when that is before challenge_end', () => {
    const serverToday = '2026-09-10'
    const { min, max } = getEditableDateRange(baseConfig, serverToday)
    expect(min).toBe(CHALLENGE_START)
    expect(max).toBe('2026-09-17')
  })

  it('caps the future edge at challenge_end once the future window would exceed it', () => {
    const serverToday = '2027-02-25'
    const { max } = getEditableDateRange(baseConfig, serverToday)
    expect(max).toBe(CHALLENGE_END)
  })

  it('leaves the past edge at challenge_start when backfill is unlimited', () => {
    const { min } = getEditableDateRange(baseConfig, '2027-01-15')
    expect(min).toBe(CHALLENGE_START)
  })

  it('constrains the past edge when backfill_limit_days is nonzero', () => {
    const config = { ...baseConfig, backfill_limit_days: 5 }
    const { min } = getEditableDateRange(config, '2026-09-10')
    expect(min).toBe('2026-09-05')
  })

  it('rejects 8 days ahead and accepts 3 days ahead (spec §15 acceptance case)', () => {
    const serverToday = '2026-09-10'
    expect(isDateEditable(addDays(serverToday, 8), baseConfig, serverToday)).toBe(false)
    expect(isDateEditable(addDays(serverToday, 3), baseConfig, serverToday)).toBe(true)
  })
})

describe('maxPointsForDate (spec §4.3) — never hardcode 6, 181, or 1086', () => {
  function booleanRule(overrides: Partial<RuleForMaxPoints> = {}): RuleForMaxPoints {
    return {
      type: 'boolean',
      points: 1,
      config: {},
      effective_from: null,
      effective_to: null,
      enabled: true,
      ...overrides,
    }
  }

  it('sums simple boolean rules with no effective-date restriction', () => {
    const rules = [booleanRule(), booleanRule(), booleanRule()]
    expect(maxPointsForDate(rules, '2026-09-01')).toBe(3)
  })

  it('scales a counter rule by its configured max', () => {
    const rules: RuleForMaxPoints[] = [
      { type: 'counter', points: 2, config: { max: 3 }, effective_from: null, effective_to: null, enabled: true },
    ]
    expect(maxPointsForDate(rules, '2026-09-01')).toBe(6)
  })

  it('counts a threshold rule at its flat point value, met-or-not', () => {
    const rules: RuleForMaxPoints[] = [
      {
        type: 'threshold',
        points: 1,
        config: { unit: 'oz', threshold: 80, compare: 'gte' },
        effective_from: null,
        effective_to: null,
        enabled: true,
      },
    ]
    expect(maxPointsForDate(rules, '2026-09-01')).toBe(1)
  })

  it('excludes a disabled rule entirely', () => {
    const rules = [booleanRule({ enabled: false }), booleanRule()]
    expect(maxPointsForDate(rules, '2026-09-01')).toBe(1)
  })

  it('excludes a rule before its effective_from', () => {
    const rule = booleanRule({ effective_from: '2026-10-01' })
    expect(maxPointsForDate([rule], '2026-09-30')).toBe(0)
  })

  it('includes a rule exactly on its effective_from', () => {
    const rule = booleanRule({ effective_from: '2026-10-01' })
    expect(maxPointsForDate([rule], '2026-10-01')).toBe(1)
  })

  it('includes a rule during its effective window', () => {
    const rule = booleanRule({ effective_from: '2026-10-01', effective_to: '2026-10-31' })
    expect(maxPointsForDate([rule], '2026-10-15')).toBe(1)
  })

  it('includes a rule exactly on its effective_to', () => {
    const rule = booleanRule({ effective_from: '2026-10-01', effective_to: '2026-10-31' })
    expect(maxPointsForDate([rule], '2026-10-31')).toBe(1)
  })

  it('excludes a rule after its effective_to', () => {
    const rule = booleanRule({ effective_from: '2026-10-01', effective_to: '2026-10-31' })
    expect(maxPointsForDate([rule], '2026-11-01')).toBe(0)
  })

  it('keeps a historical day\'s denominator honest across a later rule addition (spec §4.4)', () => {
    // A November day out of 7 and an October day out of 6 must both display honestly.
    const sixLaunchRules = [booleanRule(), booleanRule(), booleanRule(), booleanRule(), booleanRule(), booleanRule()]
    const newRule = booleanRule({ effective_from: '2026-11-01' })
    const allRules = [...sixLaunchRules, newRule]
    expect(maxPointsForDate(allRules, '2026-10-31')).toBe(6)
    expect(maxPointsForDate(allRules, '2026-11-01')).toBe(7)
  })
})

describe('formatDisplayDate (spec §8.3 banner date)', () => {
  it('renders the exact written date, never shifted by a day', () => {
    expect(formatDisplayDate('2026-09-09')).toBe('Wednesday, Sep 9')
  })

  it('renders correctly at a month boundary', () => {
    expect(formatDisplayDate('2026-08-31')).toBe('Monday, Aug 31')
  })

  it('renders correctly at a year boundary', () => {
    expect(formatDisplayDate('2027-01-01')).toBe('Friday, Jan 1')
  })
})
