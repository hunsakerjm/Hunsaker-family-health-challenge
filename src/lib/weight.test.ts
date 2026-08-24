// Spec §8.6: baseline resolution and percent-lost math. Both are pure and both fail silently if
// wrong (a mis-picked baseline or an inverted sign quietly misreports someone's progress), so they
// earn coverage the same way dates.ts/scoring.ts/maxPointsForDate do (CLAUDE.md "What earns
// automated tests").
import { describe, expect, it } from 'vitest'
import type { WeightEntry } from '../types'
import {
  computePercentLost,
  findMostRecentEntry,
  resolveBaselineEntry,
  sortEntriesByDateAscending,
} from './weight'

function makeEntry(overrides: Partial<WeightEntry> & Pick<WeightEntry, 'log_date' | 'weight_lb'>): WeightEntry {
  return {
    user_id: 'user-1',
    is_baseline: false,
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('sortEntriesByDateAscending', () => {
  it('sorts out of order entries oldest first', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-10', weight_lb: 180 }),
      makeEntry({ log_date: '2026-09-01', weight_lb: 184 }),
      makeEntry({ log_date: '2026-09-05', weight_lb: 182 }),
    ]
    const sorted = sortEntriesByDateAscending(entries)
    expect(sorted.map((entry) => entry.log_date)).toEqual(['2026-09-01', '2026-09-05', '2026-09-10'])
  })

  it('does not mutate the input array', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-10', weight_lb: 180 }),
      makeEntry({ log_date: '2026-09-01', weight_lb: 184 }),
    ]
    const original = [...entries]
    sortEntriesByDateAscending(entries)
    expect(entries).toEqual(original)
  })
})

describe('resolveBaselineEntry', () => {
  it('returns null for an empty series', () => {
    expect(resolveBaselineEntry([])).toBeNull()
  })

  it('defaults to the earliest entry when none is flagged', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-10', weight_lb: 180 }),
      makeEntry({ log_date: '2026-09-01', weight_lb: 184 }),
    ]
    expect(resolveBaselineEntry(entries)?.log_date).toBe('2026-09-01')
  })

  it('prefers the explicitly flagged entry over the earliest one', () => {
    // Spec §8.6: a late joiner sets their real starting weight rather than the first casual
    // weigh-in becoming the denominator — the explicit flag must win even when it's not earliest.
    const entries = [
      makeEntry({ log_date: '2026-09-01', weight_lb: 190 }),
      makeEntry({ log_date: '2026-09-14', weight_lb: 184, is_baseline: true }),
    ]
    expect(resolveBaselineEntry(entries)?.log_date).toBe('2026-09-14')
  })
})

describe('findMostRecentEntry', () => {
  it('returns null for an empty series', () => {
    expect(findMostRecentEntry([])).toBeNull()
  })

  it('returns the latest entry by log_date regardless of array order', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-01', weight_lb: 190 }),
      makeEntry({ log_date: '2026-09-20', weight_lb: 182 }),
      makeEntry({ log_date: '2026-09-10', weight_lb: 186 }),
    ]
    expect(findMostRecentEntry(entries)?.log_date).toBe('2026-09-20')
  })
})

describe('computePercentLost', () => {
  it('is null with no entries at all', () => {
    expect(computePercentLost([])).toBeNull()
  })

  it('is null with a single entry, even though the math would resolve to 0%', () => {
    // A single entry means baseline === most recent, so the raw math below is 0% — but 0% reads
    // as "no progress made" when the truth is "not enough data yet." One entry must report null,
    // same as zero entries, until a second one exists to compare against.
    const entries = [makeEntry({ log_date: '2026-09-01', weight_lb: 190 })]
    expect(computePercentLost(entries)).toBeNull()
  })

  it('computes normally once a second entry exists', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-01', weight_lb: 200 }),
      makeEntry({ log_date: '2026-09-30', weight_lb: 190 }),
    ]
    expect(computePercentLost(entries)).toBeCloseTo(5, 5)
  })

  it('is positive when weight decreased from baseline', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-01', weight_lb: 200 }),
      makeEntry({ log_date: '2026-09-30', weight_lb: 190 }),
    ]
    expect(computePercentLost(entries)).toBeCloseTo(5, 5)
  })

  it('is negative when weight increased from baseline', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-01', weight_lb: 180 }),
      makeEntry({ log_date: '2026-09-30', weight_lb: 189 }),
    ]
    expect(computePercentLost(entries)).toBeCloseTo(-5, 5)
  })

  it('uses the explicit baseline, not the earliest entry, when one is flagged', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-01', weight_lb: 200 }),
      makeEntry({ log_date: '2026-09-14', weight_lb: 184, is_baseline: true }),
      makeEntry({ log_date: '2026-09-28', weight_lb: 180 }),
    ]
    // (184 - 180) / 184 * 100
    expect(computePercentLost(entries)).toBeCloseTo(2.1739, 3)
  })

  it('guards against a zero-weight baseline rather than dividing by zero', () => {
    const entries = [
      makeEntry({ log_date: '2026-09-01', weight_lb: 0, is_baseline: true }),
      makeEntry({ log_date: '2026-09-14', weight_lb: 180 }),
    ]
    expect(computePercentLost(entries)).toBeNull()
  })
})
