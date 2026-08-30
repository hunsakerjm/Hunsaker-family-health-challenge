// Covers `mergeMonthCache`, the pure reconcile step behind the Today screen's disappearing-
// checkbox fix (see the long comment above it in Today.tsx and Docs/DECISIONS.md). The bug: a
// server revalidate used to replace the cache outright, which both (a) discarded whatever was on
// screen while the fetch was in flight and (b) erased any write still sitting in the offline queue,
// since the server's answer necessarily can't contain it yet. `mergeMonthCache` fixes both by
// merging the server's answer with any still-queued local values, queued values winning per
// `(log_date, rule_key)`.
//
// Pure function, no React/DOM — the merge case in the task brief:
//   1. a server entry with no queued op yields the server value
//   2. a queued op for the same (date, rule) beats the server's older value
//   3. a queued op for a date the server has no row for still appears
import { describe, expect, it } from 'vitest'
import { mergeMonthCache } from './Today'
import type { LogEntry, Rule } from '../types'

const USER_ID = 'alice'
const CACHE_KEY = 'alice:2026-09'

const WATER_RULE: Rule = {
  id: 'rule-water',
  key: 'water',
  label: 'Water',
  short_label: null,
  description: null,
  icon: null,
  category: 'health',
  type: 'boolean',
  config: {},
  points: 1,
  sort_order: 0,
  effective_from: null,
  effective_to: null,
  enabled: true,
}

const STEPS_RULE: Rule = {
  id: 'rule-steps',
  key: 'steps',
  label: 'Steps',
  short_label: null,
  description: null,
  icon: null,
  category: 'health',
  type: 'counter',
  config: { max: 3 },
  points: 1,
  sort_order: 1,
  effective_from: null,
  effective_to: null,
  enabled: true,
}

const RULES: Rule[] = [WATER_RULE, STEPS_RULE]

function serverEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    user_id: USER_ID,
    log_date: '2026-09-05',
    rule_key: 'water',
    value: 1,
    points: 1,
    updated_at: '2026-09-05T12:00:00.000Z',
    ...overrides,
  }
}

describe('mergeMonthCache', () => {
  it('keeps the server value when there is no queued op for that (date, rule)', () => {
    const server = [serverEntry({})]
    const result = mergeMonthCache(new Map(), CACHE_KEY, USER_ID, RULES, server, new Map())

    const entries = result.get(CACHE_KEY) ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ log_date: '2026-09-05', rule_key: 'water', value: 1, points: 1 })
  })

  it('a queued op for the same (date, rule) beats the server’s older value', () => {
    // The server still thinks this rule is unchecked (stale relative to a write still queued
    // offline); the queued write says it's now checked. The queued write must win, and it must
    // carry the client-side estimate rather than the server's stale points.
    const server = [serverEntry({ value: 0, points: 0 })]
    const pending = new Map([['2026-09-05', { water: 1 }]])

    const result = mergeMonthCache(new Map(), CACHE_KEY, USER_ID, RULES, server, pending)

    const entries = result.get(CACHE_KEY) ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      log_date: '2026-09-05',
      rule_key: 'water',
      value: 1,
      points: 1, // estimateRulePoints(WATER_RULE, 1) === WATER_RULE.points
    })
  })

  it('a queued op for a date the server has no row for still appears', () => {
    const server: LogEntry[] = [] // server has nothing at all for this month yet
    const pending = new Map([['2026-09-06', { steps: 2 }]])

    const result = mergeMonthCache(new Map(), CACHE_KEY, USER_ID, RULES, server, pending)

    const entries = result.get(CACHE_KEY) ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      log_date: '2026-09-06',
      rule_key: 'steps',
      value: 2,
      points: 2, // estimateRulePoints(STEPS_RULE, 2) === value * rule.points === 2
    })
  })

  it('merges multiple rules and dates from both sources without dropping anything', () => {
    const server = [
      serverEntry({ log_date: '2026-09-01', rule_key: 'water', value: 1, points: 1 }),
      serverEntry({ log_date: '2026-09-02', rule_key: 'water', value: 1, points: 1 }),
    ]
    const pending = new Map<string, Record<string, number>>([
      ['2026-09-02', { steps: 3 }], // additional rule on a date the server already has a row for
      ['2026-09-03', { water: 1 }], // a whole new date
    ])

    const result = mergeMonthCache(new Map(), CACHE_KEY, USER_ID, RULES, server, pending)

    const entries = result.get(CACHE_KEY) ?? []
    expect(entries).toHaveLength(4)
    const byDateAndRule = new Map(entries.map((entry) => [`${entry.log_date}:${entry.rule_key}`, entry]))
    expect(byDateAndRule.get('2026-09-01:water')).toMatchObject({ value: 1, points: 1 })
    expect(byDateAndRule.get('2026-09-02:water')).toMatchObject({ value: 1, points: 1 })
    expect(byDateAndRule.get('2026-09-02:steps')).toMatchObject({ value: 3, points: 3 })
    expect(byDateAndRule.get('2026-09-03:water')).toMatchObject({ value: 1, points: 1 })
  })

  it('preserves other cache keys untouched (only the reconciled month/person is replaced)', () => {
    const otherKey = 'bob:2026-09'
    const otherEntries = [serverEntry({ user_id: 'bob', log_date: '2026-09-01' })]
    const existing = new Map([[otherKey, otherEntries]])

    const result = mergeMonthCache(existing, CACHE_KEY, USER_ID, RULES, [serverEntry({})], new Map())

    expect(result.get(otherKey)).toBe(otherEntries)
    expect(result.get(CACHE_KEY)).toHaveLength(1)
  })

  it('falls back to 0 points for a queued rule that no longer matches any known rule', () => {
    // Simulates a rule whose effective window ended between when the write was queued and now
    // (client-side `rules` reflects "today," per Today.tsx's own documented Phase 2a limitation) —
    // there is no rule to estimate from, and no prior server points for this slot either.
    const pending = new Map([['2026-09-07', { 'retired-rule': 1 }]])

    const result = mergeMonthCache(new Map(), CACHE_KEY, USER_ID, RULES, [], pending)

    const entries = result.get(CACHE_KEY) ?? []
    expect(entries[0]).toMatchObject({ rule_key: 'retired-rule', value: 1, points: 0 })
  })
})
