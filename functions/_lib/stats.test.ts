// The DB-free slice of functions/_lib/stats.ts — period/month parsing shared by the leaderboard,
// rules, and ribbon routes. The D1-touching aggregation functions in this file are exercised by
// the spec §15 physical-device walkthrough, the same testing split every other route in this repo
// uses (CLAUDE.md "What earns automated tests" scopes automated coverage to pure logic).
import { describe, expect, it } from 'vitest'
import { isValidMonthString, resolvePeriodRange } from './stats'
import type { DateRange } from './statsMath'

const CHALLENGE: DateRange = { start: '2026-09-01', end: '2027-02-28' }

describe('isValidMonthString', () => {
  it('accepts YYYY-MM', () => {
    expect(isValidMonthString('2026-09')).toBe(true)
  })

  it('rejects a full date', () => {
    expect(isValidMonthString('2026-09-01')).toBe(false)
  })

  it('rejects garbage', () => {
    expect(isValidMonthString('September')).toBe(false)
    expect(isValidMonthString('')).toBe(false)
  })
})

describe('resolvePeriodRange', () => {
  it("returns the challenge window for period='all', ignoring month", () => {
    expect(resolvePeriodRange('all', undefined, CHALLENGE)).toEqual(CHALLENGE)
  })

  it("returns that month's calendar boundaries for period='month'", () => {
    expect(resolvePeriodRange('month', '2026-09', CHALLENGE)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    })
  })

  it('handles a leap-adjacent February correctly (2027 is not a leap year)', () => {
    expect(resolvePeriodRange('month', '2027-02', CHALLENGE)).toEqual({
      start: '2027-02-01',
      end: '2027-02-28',
    })
  })

  it('returns null when period=month but month is missing', () => {
    expect(resolvePeriodRange('month', undefined, CHALLENGE)).toBeNull()
  })

  it('returns null when period=month but month is malformed', () => {
    expect(resolvePeriodRange('month', '09-2026', CHALLENGE)).toBeNull()
  })
})
