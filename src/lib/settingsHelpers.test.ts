// Phase 3C — spec §4.4 (rule backdating fairness) and §8.7 (adding a person mid-challenge).
// CLAUDE.md/Appendix B calls out effective-date and scoring-window logic as code that fails
// silently if wrong; these are the pure helpers behind Settings' two confirm-dialog warnings.
import { describe, expect, it } from 'vitest'
import {
  computeDefaultActiveFrom, daysRuleWouldOpen, defaultRuleEffectiveFrom, isRuleBackdated,
} from './settingsHelpers'

const CHALLENGE_START = '2026-09-01'
const CHALLENGE_END = '2027-02-28'

describe('computeDefaultActiveFrom', () => {
  it('is null (since challenge start) when added on the challenge start date itself', () => {
    expect(computeDefaultActiveFrom(CHALLENGE_START, CHALLENGE_START)).toBeNull()
  })

  it('is null when added before the challenge has started (pre-launch roster setup)', () => {
    expect(computeDefaultActiveFrom('2026-08-15', CHALLENGE_START)).toBeNull()
  })

  it('is serverToday when added after the challenge has already started', () => {
    expect(computeDefaultActiveFrom('2026-10-01', CHALLENGE_START)).toBe('2026-10-01')
  })

  it('is serverToday exactly one day after challenge_start', () => {
    expect(computeDefaultActiveFrom('2026-09-02', CHALLENGE_START)).toBe('2026-09-02')
  })
})

describe('defaultRuleEffectiveFrom', () => {
  it('is always tomorrow relative to serverToday (spec §4.4)', () => {
    expect(defaultRuleEffectiveFrom('2026-09-09')).toBe('2026-09-10')
  })

  it('crosses a month boundary correctly', () => {
    expect(defaultRuleEffectiveFrom('2026-09-30')).toBe('2026-10-01')
  })

  it('crosses the true DST spring-forward date (2027-03-14) without drift', () => {
    expect(defaultRuleEffectiveFrom('2027-03-13')).toBe('2027-03-14')
  })
})

describe('isRuleBackdated', () => {
  it('is false when effective_from is today', () => {
    expect(isRuleBackdated('2026-09-09', '2026-09-09')).toBe(false)
  })

  it('is false when effective_from is in the future (the safe default)', () => {
    expect(isRuleBackdated('2026-09-10', '2026-09-09')).toBe(false)
  })

  it('is true when effective_from is any day before serverToday', () => {
    expect(isRuleBackdated('2026-09-08', '2026-09-09')).toBe(true)
  })

  it('is true for a backdate all the way to the challenge start', () => {
    expect(isRuleBackdated(CHALLENGE_START, CHALLENGE_END)).toBe(true)
  })
})

describe('daysRuleWouldOpen', () => {
  it('is 0 for a non-backdated (today or future) effective date', () => {
    expect(daysRuleWouldOpen('2026-09-09', '2026-09-09')).toBe(0)
    expect(daysRuleWouldOpen('2026-09-10', '2026-09-09')).toBe(0)
  })

  it('is 1 for a backdate to yesterday — exactly one past day opened', () => {
    expect(daysRuleWouldOpen('2026-09-08', '2026-09-09')).toBe(1)
  })

  it('never counts today itself: backdating all the way to challenge_start opens 180 past days', () => {
    // Same 180 src/lib/dates.test.ts already asserts for daysBetween(start, end) on this exact
    // pair — "today" (here, the challenge's last day) is never one of the opened days.
    expect(daysRuleWouldOpen(CHALLENGE_START, CHALLENGE_END)).toBe(180)
  })

  it('never returns a value for a same-day effective date other than 0', () => {
    expect(daysRuleWouldOpen('2026-09-09', '2026-09-09')).toBe(0)
  })
})
