import { describe, expect, it } from 'vitest'
import { __testables } from './celebration'

// Only the pure math is covered here (no DOM/localStorage) — celebration.ts guards every
// browser API behind `typeof window` checks, so the escalation curve itself, which is the one
// piece spec §11.2 calls "binding," is what earns a deterministic unit test.
const { tierForRatio, burstsForRatio, ratioForTrigger, SUBTLE_RATIO_CAP } = __testables

describe('tierForRatio (§11.2 escalation curve)', () => {
  it('is convex — the step from 0.17 to 0.33 grows less than the step from 0.83 to 1.0', () => {
    const lowStep = tierForRatio(0.33).count - tierForRatio(0.17).count
    const highStep = tierForRatio(1).count - tierForRatio(0.83).count
    expect(highStep).toBeGreaterThan(lowStep)
  })

  it('matches the spec table\'s rough particle counts at each named ratio', () => {
    expect(tierForRatio(0.17).count).toBeGreaterThanOrEqual(6)
    expect(tierForRatio(0.17).count).toBeLessThanOrEqual(8)
    expect(tierForRatio(1).count).toBeGreaterThan(tierForRatio(0.83).count)
  })

  it('only marks the top tier gold at (effectively) a full day', () => {
    expect(tierForRatio(0.83).gold).toBe(false)
    expect(tierForRatio(0.999).gold).toBe(true)
    expect(tierForRatio(1).gold).toBe(true)
  })

  it('steps bursts at the 0.8 and ~1.0 thresholds, never in between', () => {
    expect(burstsForRatio(0.5)).toBe(1)
    expect(burstsForRatio(0.8)).toBe(1)
    expect(burstsForRatio(0.81)).toBe(2)
    expect(burstsForRatio(0.999)).toBe(3)
    expect(burstsForRatio(1)).toBe(3)
  })

  it('spread and velocity both increase monotonically with ratio', () => {
    const ratios = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1]
    for (let i = 1; i < ratios.length; i += 1) {
      const previous = tierForRatio(ratios[i - 1])
      const current = tierForRatio(ratios[i])
      expect(current.spread).toBeGreaterThanOrEqual(previous.spread)
      expect(current.velocity).toBeGreaterThanOrEqual(previous.velocity)
    }
  })
})

describe('ratioForTrigger', () => {
  it('divides pointsAfter by maxPointsForDay', () => {
    expect(ratioForTrigger({ pointsAfter: 3, maxPointsForDay: 6 })).toBeCloseTo(0.5)
  })

  it('clamps to 1 even if pointsAfter somehow exceeds the max', () => {
    expect(ratioForTrigger({ pointsAfter: 9, maxPointsForDay: 6 })).toBe(1)
  })

  it('never divides by zero — a malformed max yields ratio 0, not NaN or Infinity', () => {
    expect(ratioForTrigger({ pointsAfter: 3, maxPointsForDay: 0 })).toBe(0)
  })

  it('is denominator-agnostic: the same ratio yields the same tier for a 6-rule day or an 8-rule day', () => {
    const sixRuleDay = tierForRatio(ratioForTrigger({ pointsAfter: 3, maxPointsForDay: 6 }))
    const eightRuleDay = tierForRatio(ratioForTrigger({ pointsAfter: 4, maxPointsForDay: 8 }))
    expect(sixRuleDay).toEqual(eightRuleDay)
  })
})

describe('SUBTLE_RATIO_CAP', () => {
  it('sits at the top edge of the "barely there" band, below the "small" tier', () => {
    expect(SUBTLE_RATIO_CAP).toBeGreaterThanOrEqual(0.33)
    expect(SUBTLE_RATIO_CAP).toBeLessThan(0.5)
  })
})
