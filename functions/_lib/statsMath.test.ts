// Appendix B ("what earns automated tests") + this track's brief: aggregate/tie/effective-window
// logic. This file is the DB-free math every stats route builds its SQL date ranges from, and the
// tie-breaking every leaderboard entry goes through — exactly the two categories called out.
import { describe, expect, it } from 'vitest'
import {
  capRangeEnd,
  computeStandardCompetitionRanks,
  inclusiveDayCount,
  intersectRanges,
  ruleEffectiveWindow,
  userActiveWindow,
  type DateRange,
} from './statsMath'

const CHALLENGE: DateRange = { start: '2026-09-01', end: '2027-02-28' }

describe('intersectRanges', () => {
  it('returns the overlap of two overlapping ranges', () => {
    const a: DateRange = { start: '2026-09-01', end: '2026-09-30' }
    const b: DateRange = { start: '2026-09-15', end: '2026-10-15' }
    expect(intersectRanges(a, b)).toEqual({ start: '2026-09-15', end: '2026-09-30' })
  })

  it('returns null for ranges that do not overlap', () => {
    const a: DateRange = { start: '2026-09-01', end: '2026-09-30' }
    const b: DateRange = { start: '2026-10-01', end: '2026-10-31' }
    expect(intersectRanges(a, b)).toBeNull()
  })

  it('handles a range fully containing another', () => {
    const outer: DateRange = { start: '2026-09-01', end: '2027-02-28' }
    const inner: DateRange = { start: '2026-11-01', end: '2026-11-30' }
    expect(intersectRanges(outer, inner)).toEqual(inner)
  })

  it('treats a single shared day as a valid (non-null) overlap', () => {
    const a: DateRange = { start: '2026-09-01', end: '2026-09-10' }
    const b: DateRange = { start: '2026-09-10', end: '2026-09-20' }
    expect(intersectRanges(a, b)).toEqual({ start: '2026-09-10', end: '2026-09-10' })
  })
})

describe('inclusiveDayCount', () => {
  it('counts a same-day range as 1', () => {
    expect(inclusiveDayCount({ start: '2026-09-01', end: '2026-09-01' })).toBe(1)
  })

  it('counts a 30-day September as 30', () => {
    expect(inclusiveDayCount({ start: '2026-09-01', end: '2026-09-30' })).toBe(30)
  })

  it('counts the full challenge window correctly (181 days, per spec §0 — never hardcoded elsewhere)', () => {
    expect(inclusiveDayCount(CHALLENGE)).toBe(181)
  })

  it('returns 0 for a null range', () => {
    expect(inclusiveDayCount(null)).toBe(0)
  })
})

describe('capRangeEnd', () => {
  it('leaves a range untouched when the cap is after its end', () => {
    const range: DateRange = { start: '2026-09-01', end: '2026-09-10' }
    expect(capRangeEnd(range, '2026-09-30')).toEqual(range)
  })

  it('clips the end down to the cap when the cap falls inside the range', () => {
    const range: DateRange = { start: '2026-09-01', end: '2026-09-30' }
    expect(capRangeEnd(range, '2026-09-15')).toEqual({ start: '2026-09-01', end: '2026-09-15' })
  })

  it('returns null when the cap falls before the range starts (nothing has happened yet)', () => {
    const range: DateRange = { start: '2026-09-15', end: '2026-09-30' }
    expect(capRangeEnd(range, '2026-09-01')).toBeNull()
  })

  it('passes through null unchanged', () => {
    expect(capRangeEnd(null, '2026-09-01')).toBeNull()
  })
})

describe('userActiveWindow — spec §5/§9 active_from/active_to', () => {
  it('spans the whole challenge for a user with no window set', () => {
    expect(userActiveWindow({ active_from: null, active_to: null }, CHALLENGE)).toEqual(CHALLENGE)
  })

  it('starts from active_from when set', () => {
    const result = userActiveWindow({ active_from: '2026-10-15', active_to: null }, CHALLENGE)
    expect(result).toEqual({ start: '2026-10-15', end: CHALLENGE.end })
  })

  it('excludes active_to itself — the day they drop out, not the last day they count', () => {
    const result = userActiveWindow({ active_from: null, active_to: '2026-11-01' }, CHALLENGE)
    expect(result).toEqual({ start: CHALLENGE.start, end: '2026-10-31' })
  })

  it('returns null when active_from is after active_to (archived same day they were added, or later)', () => {
    const result = userActiveWindow({ active_from: '2026-11-01', active_to: '2026-11-01' }, CHALLENGE)
    expect(result).toBeNull()
  })

  it('returns null when active_from is after the challenge ends', () => {
    const result = userActiveWindow({ active_from: '2027-03-01', active_to: null }, CHALLENGE)
    expect(result).toBeNull()
  })

  it('clips active_from before the challenge start up to challenge start', () => {
    const result = userActiveWindow({ active_from: '2026-01-01', active_to: null }, CHALLENGE)
    expect(result).toEqual(CHALLENGE)
  })
})

describe('ruleEffectiveWindow — spec §4.3 effective_from/effective_to (effective_to INCLUSIVE)', () => {
  it('spans the whole challenge for a rule with no window set', () => {
    expect(ruleEffectiveWindow({ effective_from: null, effective_to: null }, CHALLENGE)).toEqual(CHALLENGE)
  })

  it('includes effective_to itself, unlike a user active_to', () => {
    const result = ruleEffectiveWindow({ effective_from: null, effective_to: '2026-11-01' }, CHALLENGE)
    expect(result).toEqual({ start: CHALLENGE.start, end: '2026-11-01' })
  })

  it('starts from effective_from when set (a mid-challenge new rule, spec §4.4)', () => {
    const result = ruleEffectiveWindow({ effective_from: '2026-12-01', effective_to: null }, CHALLENGE)
    expect(result).toEqual({ start: '2026-12-01', end: CHALLENGE.end })
  })

  it('returns null when the rule never overlaps the challenge', () => {
    const result = ruleEffectiveWindow({ effective_from: '2025-01-01', effective_to: '2025-12-31' }, CHALLENGE)
    expect(result).toBeNull()
  })
})

describe('computeStandardCompetitionRanks — spec §8.5/§13#2 ties, never auto-broken', () => {
  it('ranks distinct totals 1, 2, 3 with no ties', () => {
    const ranked = computeStandardCompetitionRanks([
      { user_id: 'a', points_total: 30 },
      { user_id: 'b', points_total: 20 },
      { user_id: 'c', points_total: 10 },
    ])
    expect(ranked.find((r) => r.user_id === 'a')).toMatchObject({ rank: 1, tied: false })
    expect(ranked.find((r) => r.user_id === 'b')).toMatchObject({ rank: 2, tied: false })
    expect(ranked.find((r) => r.user_id === 'c')).toMatchObject({ rank: 3, tied: false })
  })

  it('gives a leader tie shared rank 1 and skips rank 2 for the next person (T1, T1, 3)', () => {
    const ranked = computeStandardCompetitionRanks([
      { user_id: 'a', points_total: 30 },
      { user_id: 'b', points_total: 30 },
      { user_id: 'c', points_total: 10 },
    ])
    expect(ranked.find((r) => r.user_id === 'a')).toMatchObject({ rank: 1, tied: true })
    expect(ranked.find((r) => r.user_id === 'b')).toMatchObject({ rank: 1, tied: true })
    expect(ranked.find((r) => r.user_id === 'c')).toMatchObject({ rank: 3, tied: false })
  })

  it('handles a tie NOT at the leader position (spec text is general, not leader-only)', () => {
    const ranked = computeStandardCompetitionRanks([
      { user_id: 'a', points_total: 30 },
      { user_id: 'b', points_total: 20 },
      { user_id: 'c', points_total: 20 },
      { user_id: 'd', points_total: 5 },
    ])
    expect(ranked.find((r) => r.user_id === 'a')).toMatchObject({ rank: 1, tied: false })
    expect(ranked.find((r) => r.user_id === 'b')).toMatchObject({ rank: 2, tied: true })
    expect(ranked.find((r) => r.user_id === 'c')).toMatchObject({ rank: 2, tied: true })
    expect(ranked.find((r) => r.user_id === 'd')).toMatchObject({ rank: 4, tied: false })
  })

  it('gives everyone rank 1 and tied:true when the whole field ties (e.g. all-zero, pre-launch)', () => {
    const ranked = computeStandardCompetitionRanks([
      { user_id: 'a', points_total: 0 },
      { user_id: 'b', points_total: 0 },
    ])
    expect(ranked).toHaveLength(2)
    for (const entry of ranked) {
      expect(entry.rank).toBe(1)
      expect(entry.tied).toBe(true)
    }
  })

  it('handles a single entrant with no tie', () => {
    const ranked = computeStandardCompetitionRanks([{ user_id: 'a', points_total: 12 }])
    expect(ranked).toEqual([{ user_id: 'a', points_total: 12, rank: 1, tied: false }])
  })

  it('handles an empty list', () => {
    expect(computeStandardCompetitionRanks([])).toEqual([])
  })
})
