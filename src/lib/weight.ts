// Pure weight math shared by the client (WeightDetail and Calendar screens) — spec §8.6. Nothing
// here performs I/O; every function operates on a `WeightEntry[]` already loaded from a
// single-user query (functions/_lib/weights.ts's structural privacy note explains why that's the
// only shape this data ever arrives in). All date comparisons go through `compareDates` from
// `src/lib/dates.ts` (CLAUDE.md hard rule: date math never uses raw string/`Date` comparison).
import { compareDates } from './dates'
import type { WeightEntry } from '../types'

function compareByLogDate(a: WeightEntry, b: WeightEntry): number {
  return compareDates(a.log_date, b.log_date)
}

/** Oldest first. The sparkline, the baseline default, and "most recent" all derive from this one
 * sort rather than trusting array order from the API. */
export function sortEntriesByDateAscending(entries: readonly WeightEntry[]): WeightEntry[] {
  return [...entries].sort(compareByLogDate)
}

/**
 * Spec §8.6: "Baseline defaults to the earliest entry" whenever nothing is explicitly flagged.
 * Returns null for an empty series — there's nothing to measure against yet.
 */
export function resolveBaselineEntry(entries: readonly WeightEntry[]): WeightEntry | null {
  if (entries.length === 0) return null
  const explicit = entries.find((entry) => entry.is_baseline)
  if (explicit) return explicit
  return sortEntriesByDateAscending(entries)[0]
}

/** The latest dated entry, by `log_date` — not by array or fetch order. Null for an empty series. */
export function findMostRecentEntry(entries: readonly WeightEntry[]): WeightEntry | null {
  if (entries.length === 0) return null
  const sorted = sortEntriesByDateAscending(entries)
  return sorted[sorted.length - 1]
}

/**
 * Spec §8.6: "Percentage lost = (baseline − most recent) ÷ baseline × 100." Positive means lost
 * weight, negative means gained (spec §8.5 sorts a negative result to the bottom of the weight
 * standings — this function only computes the number, callers decide how to display it). Null
 * when there's nothing to compute from, including the divide-by-zero guard on a corrupt baseline.
 */
export function computePercentLost(entries: readonly WeightEntry[]): number | null {
  const baseline = resolveBaselineEntry(entries)
  const mostRecent = findMostRecentEntry(entries)
  if (!baseline || !mostRecent || baseline.weight_lb === 0) return null
  return ((baseline.weight_lb - mostRecent.weight_lb) / baseline.weight_lb) * 100
}
