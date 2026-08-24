// Server-side scoring (spec §4.3, §9). This is what `PUT /api/logs/:userId/:date` (Phase 2) will
// call to turn a raw `{values: {rule_key: number}}` payload into the canonical, server-computed
// point snapshot — built now, ahead of that route, because Appendix B requires this exact
// behavior to be under test before Phase 2 opens: "given a rule set and a raw values payload,
// computed points must match expectation for all three rule types, including a date where a rule
// falls outside its effective window."
//
// Hard rule this file exists to enforce (CLAUDE.md, spec §4.3): points are snapshotted at write
// time and are ALWAYS server-computed — a client can send any `value` it wants, but it can never
// send `points` directly, and this function is the only place that turns one into the other.

import type { Rule, RuleConfig, CounterRuleConfig, ThresholdRuleConfig, DayLogState } from '../../src/types'
import { maxPointsForDate, compareDates } from '../../src/lib/dates'

export type DayScoreResult = Pick<DayLogState, 'values' | 'points' | 'points_total' | 'max_points_for_date'>

const BOOLEAN_CHECKED = 1
const BOOLEAN_UNCHECKED = 0
const MIN_COUNTER_VALUE = 0

/**
 * Scores a raw `values` payload against the rules in effect on `date`. A value submitted for a
 * rule that either doesn't exist or isn't effective on that date is silently dropped — spec §4.3:
 * "a given date only offers the rules effective on that date," so a stale or out-of-window
 * submission never produces a log entry, points, or a denominator contribution.
 */
export function computeDayScore(
  rules: readonly Rule[],
  date: string,
  rawValues: Readonly<Record<string, number>>,
): DayScoreResult {
  const values: Record<string, number> = {}
  const points: Record<string, number> = {}
  let pointsTotal = 0

  for (const rule of rules) {
    if (!isSubmittedFor(rawValues, rule.key)) continue
    if (!isRuleEffectiveOnDate(rule, date)) continue

    const clampedValue = clampValueForRule(rule, rawValues[rule.key])
    const awardedPoints = pointsForRule(rule, clampedValue)

    values[rule.key] = clampedValue
    points[rule.key] = awardedPoints
    pointsTotal += awardedPoints
  }

  return {
    values,
    points,
    points_total: pointsTotal,
    max_points_for_date: maxPointsForDate(rules, date),
  }
}

function isSubmittedFor(rawValues: Readonly<Record<string, number>>, ruleKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(rawValues, ruleKey)
}

function isRuleEffectiveOnDate(rule: Rule, date: string): boolean {
  if (!rule.enabled) return false
  if (rule.effective_from !== null && compareDates(date, rule.effective_from) < 0) return false
  if (rule.effective_to !== null && compareDates(date, rule.effective_to) > 0) return false
  return true
}

// Spec §9: "Validate value against rule type — boolean → 0|1, counter → 0..max." Out-of-range
// input is clamped rather than rejected outright, so a slightly-off client (a double-tap race, a
// stale max after a rule edit) degrades to the nearest valid value instead of losing the write.
function clampValueForRule(rule: Rule, rawValue: number): number {
  if (rule.type === 'boolean') {
    return rawValue === BOOLEAN_CHECKED ? BOOLEAN_CHECKED : BOOLEAN_UNCHECKED
  }
  if (rule.type === 'counter') {
    const config = rule.config as CounterRuleConfig
    const rounded = Math.round(rawValue)
    return Math.min(Math.max(rounded, MIN_COUNTER_VALUE), config.max)
  }
  // threshold: the raw value is a real-world measurement (minutes, ounces, pounds) against a
  // unit — there is no valid range to clamp to, only a comparison to evaluate.
  return rawValue
}

function pointsForRule(rule: Rule, value: number): number {
  if (rule.type === 'boolean') {
    return value === BOOLEAN_CHECKED ? rule.points : 0
  }
  if (rule.type === 'counter') {
    return value * rule.points
  }
  return thresholdPoints(rule, value)
}

function thresholdPoints(rule: Rule & { config: RuleConfig }, value: number): number {
  const config = rule.config as ThresholdRuleConfig
  const comparisonHolds =
    config.compare === 'gte' ? value >= config.threshold : value <= config.threshold
  return comparisonHolds ? rule.points : 0
}
