// Validates that a rule's `config` JSON actually has the fields its `type` requires (spec §4.3):
// boolean takes none, counter needs a positive integer `max`, threshold needs a `unit` string, a
// numeric `threshold`, and a `compare` of 'gte' | 'lte'. Shared by POST /api/rules and
// PATCH /api/rules/:id so both accept or reject the same shapes.
import type { RuleConfig, RuleType } from '../../src/types'

export function isValidRuleConfig(type: RuleType, config: unknown): config is RuleConfig {
  if (typeof config !== 'object' || config === null) return false
  const record = config as Record<string, unknown>

  if (type === 'boolean') return true

  if (type === 'counter') {
    return typeof record.max === 'number' && Number.isFinite(record.max) && record.max > 0
  }

  // threshold
  const hasUnit = typeof record.unit === 'string' && record.unit.trim().length > 0
  const hasThreshold = typeof record.threshold === 'number' && Number.isFinite(record.threshold)
  const hasCompare = record.compare === 'gte' || record.compare === 'lte'
  return hasUnit && hasThreshold && hasCompare
}
