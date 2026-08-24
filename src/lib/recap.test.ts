import { describe, expect, it } from 'vitest'
import {
  buildRecapDisplay,
  getRecapEligibility,
  hasAnyEntries,
  monthLongLabel,
  shouldFireRecapBurst,
  sumPointsForMonth,
} from './recap'
import type { LogEntry } from '../types'

const CHALLENGE_START = '2026-09-01'
const CHALLENGE_END = '2027-02-28'

function entry(points: number, date = '2026-09-15'): LogEntry {
  return {
    user_id: 'u1',
    log_date: date,
    rule_key: 'water',
    value: 1,
    points,
    updated_at: '2026-09-15T00:00:00Z',
  }
}

describe('getRecapEligibility', () => {
  it('is suppressed in the challenge\'s first month — there is no prior month to report', () => {
    const result = getRecapEligibility({
      serverToday: '2026-09-15',
      challengeStart: CHALLENGE_START,
      challengeEnd: CHALLENGE_END,
      lastRecapShown: null,
    })
    expect(result.eligible).toBe(false)
    expect(result.recapMonthKey).toBeNull()
  })

  it('fires on the first open of a new month, recapping the month just finished', () => {
    const result = getRecapEligibility({
      serverToday: '2026-10-01',
      challengeStart: CHALLENGE_START,
      challengeEnd: CHALLENGE_END,
      lastRecapShown: null,
    })
    expect(result.eligible).toBe(true)
    expect(result.currentMonthKey).toBe('2026-10')
    expect(result.recapMonthKey).toBe('2026-09')
  })

  it('does not re-fire once lastRecapShown already matches the current month', () => {
    const result = getRecapEligibility({
      serverToday: '2026-10-20',
      challengeStart: CHALLENGE_START,
      challengeEnd: CHALLENGE_END,
      lastRecapShown: '2026-10',
    })
    expect(result.eligible).toBe(false)
    expect(result.recapMonthKey).toBeNull()
  })

  it('fires again on a later open within the same new month if it has not shown yet', () => {
    const result = getRecapEligibility({
      serverToday: '2026-10-20',
      challengeStart: CHALLENGE_START,
      challengeEnd: CHALLENGE_END,
      lastRecapShown: '2026-09',
    })
    expect(result.eligible).toBe(true)
    expect(result.recapMonthKey).toBe('2026-09')
  })

  it('still fires on the first of the month after the challenge ends, recapping the final month', () => {
    const result = getRecapEligibility({
      serverToday: '2027-03-01',
      challengeStart: CHALLENGE_START,
      challengeEnd: CHALLENGE_END,
      lastRecapShown: null,
    })
    expect(result.eligible).toBe(true)
    expect(result.currentMonthKey).toBe('2027-03')
    expect(result.recapMonthKey).toBe('2027-02')
  })

  it('stops firing once a second month has passed since the challenge ended', () => {
    const result = getRecapEligibility({
      serverToday: '2027-04-01',
      challengeStart: CHALLENGE_START,
      challengeEnd: CHALLENGE_END,
      lastRecapShown: '2027-03',
    })
    expect(result.eligible).toBe(false)
    expect(result.recapMonthKey).toBeNull()
  })
})

describe('sumPointsForMonth / hasAnyEntries / buildRecapDisplay', () => {
  it('a zero-entry previous month yields the plain-statement variant with no hero number', () => {
    const entries: LogEntry[] = []
    const total = sumPointsForMonth(entries)
    const withEntries = hasAnyEntries(entries)
    const display = buildRecapDisplay(monthLongLabel('2026-09'), total, withEntries)

    expect(withEntries).toBe(false)
    expect(display.hasEntries).toBe(false)
    expect(display.heroValue).toBeNull()
    expect(display.message).toBe('No entries logged in September')
  })

  it('sums points across entries and produces the hero-number variant when entries exist', () => {
    const entries = [entry(5), entry(3, '2026-09-16')]
    const total = sumPointsForMonth(entries)
    const withEntries = hasAnyEntries(entries)
    const display = buildRecapDisplay(monthLongLabel('2026-09'), total, withEntries)

    expect(total).toBe(8)
    expect(withEntries).toBe(true)
    expect(display.hasEntries).toBe(true)
    expect(display.heroValue).toBe(8)
    expect(display.message).toBe('September total')
  })

  it('treats a logged zero-value entry as "has entries," not as "nothing logged"', () => {
    const entries = [entry(0)]
    expect(hasAnyEntries(entries)).toBe(true)
    expect(sumPointsForMonth(entries)).toBe(0)
  })
})

describe('shouldFireRecapBurst', () => {
  it('fires only under full intensity with real entries', () => {
    expect(shouldFireRecapBurst('full', true)).toBe(true)
  })

  it('never fires under subtle, even with entries', () => {
    expect(shouldFireRecapBurst('subtle', true)).toBe(false)
  })

  it('never fires under off', () => {
    expect(shouldFireRecapBurst('off', true)).toBe(false)
  })

  it('never fires on a zero-entry month, even under full', () => {
    expect(shouldFireRecapBurst('full', false)).toBe(false)
  })
})

describe('monthLongLabel', () => {
  it('formats a YYYY-MM key as a long month name', () => {
    expect(monthLongLabel('2026-09')).toBe('September')
    expect(monthLongLabel('2027-02')).toBe('February')
  })
})
