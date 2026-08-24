// Phase 3C — POST /api/rules and PATCH /api/rules/:id both reject a config that doesn't match
// its rule type before it ever reaches the DB. A bad counter/threshold config here would silently
// corrupt maxPointsForDate (CLAUDE.md hard rule: never hardcode the daily max, always derive it —
// which only works if every stored rule's config is well-formed).
import { describe, expect, it } from 'vitest'
import { isValidRuleConfig } from './ruleConfig'

describe('isValidRuleConfig — boolean', () => {
  it('accepts an empty config', () => {
    expect(isValidRuleConfig('boolean', {})).toBe(true)
  })

  it('accepts any object, since boolean rules ignore config entirely', () => {
    expect(isValidRuleConfig('boolean', { anything: 'ignored' })).toBe(true)
  })

  it('rejects a non-object config', () => {
    expect(isValidRuleConfig('boolean', null)).toBe(false)
    expect(isValidRuleConfig('boolean', 'nope')).toBe(false)
  })
})

describe('isValidRuleConfig — counter', () => {
  it('accepts a positive integer max', () => {
    expect(isValidRuleConfig('counter', { max: 5 })).toBe(true)
  })

  it('rejects a missing max', () => {
    expect(isValidRuleConfig('counter', {})).toBe(false)
  })

  it('rejects a zero or negative max — a counter with no ceiling has no maxPointsForDate', () => {
    expect(isValidRuleConfig('counter', { max: 0 })).toBe(false)
    expect(isValidRuleConfig('counter', { max: -3 })).toBe(false)
  })

  it('rejects a non-numeric max', () => {
    expect(isValidRuleConfig('counter', { max: '5' })).toBe(false)
  })
})

describe('isValidRuleConfig — threshold', () => {
  it('accepts a complete unit/threshold/compare config', () => {
    expect(isValidRuleConfig('threshold', { unit: 'oz', threshold: 80, compare: 'gte' })).toBe(true)
    expect(isValidRuleConfig('threshold', { unit: 'min', threshold: 30, compare: 'lte' })).toBe(true)
  })

  it('rejects a missing unit', () => {
    expect(isValidRuleConfig('threshold', { threshold: 80, compare: 'gte' })).toBe(false)
  })

  it('rejects an empty unit string', () => {
    expect(isValidRuleConfig('threshold', { unit: '', threshold: 80, compare: 'gte' })).toBe(false)
  })

  it('rejects a compare value outside gte/lte', () => {
    expect(isValidRuleConfig('threshold', { unit: 'oz', threshold: 80, compare: 'eq' })).toBe(false)
  })

  it('rejects a non-numeric threshold', () => {
    expect(isValidRuleConfig('threshold', { unit: 'oz', threshold: '80', compare: 'gte' })).toBe(false)
  })
})
