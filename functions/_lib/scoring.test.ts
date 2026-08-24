// Appendix B, area 2: "server-side scoring — given a rule set and a raw values payload, the
// points computed must match expectation for all three rule types, including a date where a rule
// is outside its effective window."

import { describe, expect, it } from 'vitest'
import type { Rule } from '../../src/types'
import { computeDayScore } from './scoring'

let nextRuleId = 0

function makeRule(overrides: Partial<Rule> & Pick<Rule, 'key' | 'type'>): Rule {
  nextRuleId += 1
  return {
    id: `rule-${nextRuleId}`,
    label: overrides.key,
    short_label: null,
    description: null,
    icon: null,
    category: 'General',
    config: {},
    points: 1,
    sort_order: nextRuleId,
    effective_from: null,
    effective_to: null,
    enabled: true,
    ...overrides,
  }
}

describe('computeDayScore — boolean rules', () => {
  it('awards full points when checked', () => {
    const rule = makeRule({ key: 'water', type: 'boolean', points: 1 })
    const result = computeDayScore([rule], '2026-09-05', { water: 1 })
    expect(result.points.water).toBe(1)
    expect(result.values.water).toBe(1)
    expect(result.points_total).toBe(1)
  })

  it('awards zero when unchecked', () => {
    const rule = makeRule({ key: 'water', type: 'boolean', points: 1 })
    const result = computeDayScore([rule], '2026-09-05', { water: 0 })
    expect(result.points.water).toBe(0)
    expect(result.points_total).toBe(0)
  })

  it('clamps a malformed value to 0 rather than trusting it', () => {
    const rule = makeRule({ key: 'water', type: 'boolean', points: 1 })
    const result = computeDayScore([rule], '2026-09-05', { water: 7 })
    expect(result.values.water).toBe(0)
    expect(result.points.water).toBe(0)
  })
})

describe('computeDayScore — counter rules', () => {
  it('multiplies value by the per-unit point value', () => {
    const rule = makeRule({ key: 'pushups', type: 'counter', points: 1, config: { max: 3 } })
    const result = computeDayScore([rule], '2026-09-05', { pushups: 2 })
    expect(result.values.pushups).toBe(2)
    expect(result.points.pushups).toBe(2)
  })

  it('clamps a value above the configured max', () => {
    const rule = makeRule({ key: 'pushups', type: 'counter', points: 1, config: { max: 3 } })
    const result = computeDayScore([rule], '2026-09-05', { pushups: 9 })
    expect(result.values.pushups).toBe(3)
    expect(result.points.pushups).toBe(3)
  })

  it('clamps a negative value to zero', () => {
    const rule = makeRule({ key: 'pushups', type: 'counter', points: 1, config: { max: 3 } })
    const result = computeDayScore([rule], '2026-09-05', { pushups: -4 })
    expect(result.values.pushups).toBe(0)
    expect(result.points.pushups).toBe(0)
  })
})

describe('computeDayScore — threshold rules', () => {
  it('awards points when a gte comparison holds', () => {
    const rule = makeRule({
      key: 'water_oz',
      type: 'threshold',
      points: 1,
      config: { unit: 'oz', threshold: 80, compare: 'gte' },
    })
    const result = computeDayScore([rule], '2026-09-05', { water_oz: 96 })
    expect(result.points.water_oz).toBe(1)
  })

  it('awards nothing when a gte comparison fails', () => {
    const rule = makeRule({
      key: 'water_oz',
      type: 'threshold',
      points: 1,
      config: { unit: 'oz', threshold: 80, compare: 'gte' },
    })
    const result = computeDayScore([rule], '2026-09-05', { water_oz: 40 })
    expect(result.points.water_oz).toBe(0)
  })

  it('awards points when an lte comparison holds', () => {
    const rule = makeRule({
      key: 'screen_time',
      type: 'threshold',
      points: 1,
      config: { unit: 'min', threshold: 60, compare: 'lte' },
    })
    const result = computeDayScore([rule], '2026-09-05', { screen_time: 45 })
    expect(result.points.screen_time).toBe(1)
  })

  it('awards nothing when an lte comparison fails', () => {
    const rule = makeRule({
      key: 'screen_time',
      type: 'threshold',
      points: 1,
      config: { unit: 'min', threshold: 60, compare: 'lte' },
    })
    const result = computeDayScore([rule], '2026-09-05', { screen_time: 90 })
    expect(result.points.screen_time).toBe(0)
  })
})

describe('computeDayScore — effective window (spec §4.3)', () => {
  it('drops a submitted value for a rule not yet effective on that date', () => {
    const rule = makeRule({ key: 'stretch', type: 'boolean', points: 1, effective_from: '2026-11-01' })
    const result = computeDayScore([rule], '2026-10-31', { stretch: 1 })
    expect(result.values.stretch).toBeUndefined()
    expect(result.points.stretch).toBeUndefined()
    expect(result.points_total).toBe(0)
  })

  it('drops a submitted value for a rule whose effective window already ended', () => {
    const rule = makeRule({
      key: 'winter_challenge',
      type: 'boolean',
      points: 1,
      effective_from: '2026-12-01',
      effective_to: '2026-12-31',
    })
    const result = computeDayScore([rule], '2027-01-15', { winter_challenge: 1 })
    expect(result.values.winter_challenge).toBeUndefined()
    expect(result.points_total).toBe(0)
  })

  it('still scores a co-submitted, currently-effective rule when another is out of window', () => {
    const activeRule = makeRule({ key: 'water', type: 'boolean', points: 1 })
    const futureRule = makeRule({ key: 'stretch', type: 'boolean', points: 1, effective_from: '2026-11-01' })
    const result = computeDayScore([activeRule, futureRule], '2026-10-31', { water: 1, stretch: 1 })
    expect(result.points.water).toBe(1)
    expect(result.values.stretch).toBeUndefined()
    expect(result.points_total).toBe(1)
  })
})

describe('computeDayScore — whole-day aggregation', () => {
  it('sums points across all three rule types and reports the correct max for the date', () => {
    const rules: Rule[] = [
      makeRule({ key: 'water', type: 'boolean', points: 1 }),
      makeRule({ key: 'pushups', type: 'counter', points: 1, config: { max: 3 } }),
      makeRule({
        key: 'water_oz',
        type: 'threshold',
        points: 2,
        config: { unit: 'oz', threshold: 80, compare: 'gte' },
      }),
    ]
    const result = computeDayScore(rules, '2026-09-05', { water: 1, pushups: 2, water_oz: 96 })
    expect(result.points_total).toBe(1 + 2 + 2)
    expect(result.max_points_for_date).toBe(1 + 3 * 1 + 2)
  })

  it('ignores a rule key with no submitted value at all', () => {
    const rules: Rule[] = [
      makeRule({ key: 'water', type: 'boolean', points: 1 }),
      makeRule({ key: 'sleep', type: 'boolean', points: 1 }),
    ]
    const result = computeDayScore(rules, '2026-09-05', { water: 1 })
    expect(result.values.sleep).toBeUndefined()
    expect(result.points_total).toBe(1)
  })
})
