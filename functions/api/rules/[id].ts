import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import { isValidDateString } from '../../_lib/dateFormat'
import { loadRuleById } from '../../_lib/rules'
import { isValidRuleConfig } from '../../_lib/ruleConfig'
import { recordAuditEntry } from '../../_lib/audit'
import type { RuleType, UpdateRuleRequest, Rule } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const RULE_NOT_FOUND_MESSAGE = 'No such rule.'
const INVALID_BODY_MESSAGE = 'Invalid request body.'
const INVALID_TYPE_MESSAGE = "type must be 'boolean', 'counter', or 'threshold'."
const INVALID_CONFIG_MESSAGE = 'config does not match the fields that rule type requires.'
const INVALID_DATE_MESSAGE = 'effective_from/effective_to must be YYYY-MM-DD dates.'
const ACTING_USER_HEADER = 'X-Acting-User'
const AUDIT_ACTION_RULE_UPDATE = 'rule.update'
const RULE_TYPES: readonly RuleType[] = ['boolean', 'counter', 'threshold']

// PATCH /api/rules/:id — spec §4.3/§4.4/§8.7 rules editor: edit, reorder (`sort_order`),
// enable/disable, set effective dates. `key` is intentionally not editable — UpdateRuleRequest
// (src/types.ts) already excludes it (spec §5: "never reuse a retired key"). Points are
// snapshotted into log_entries at write time (CLAUDE.md hard rule), so changing `points`/`config`
// here never rewrites history; only future scoring sees the new value.
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const ruleId = String(params.id)

  const existing = await loadRuleById(env.DB, ruleId)
  if (!existing) {
    return jsonError(NOT_FOUND_STATUS, RULE_NOT_FOUND_MESSAGE)
  }

  const patch = await readPatchBody(request)
  if (!patch) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_BODY_MESSAGE)
  }
  const nextType = patch.type ?? existing.type
  if (!RULE_TYPES.includes(nextType)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_TYPE_MESSAGE)
  }
  const nextConfig = patch.config ?? existing.config
  if (!isValidRuleConfig(nextType, nextConfig)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_CONFIG_MESSAGE)
  }
  if (!isValidOptionalDateField(patch.effective_from) || !isValidOptionalDateField(patch.effective_to)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_DATE_MESSAGE)
  }

  await env.DB.prepare(
    `UPDATE rules SET label = ?, short_label = ?, description = ?, icon = ?, category = ?,
       type = ?, config = ?, points = ?, sort_order = ?, effective_from = ?, effective_to = ?,
       enabled = ?
     WHERE id = ?`,
  ).bind(
    patch.label ?? existing.label,
    patch.short_label !== undefined ? patch.short_label : existing.short_label,
    patch.description !== undefined ? patch.description : existing.description,
    patch.icon !== undefined ? patch.icon : existing.icon,
    patch.category ?? existing.category,
    nextType,
    JSON.stringify(nextConfig),
    patch.points ?? existing.points,
    patch.sort_order ?? existing.sort_order,
    patch.effective_from !== undefined ? patch.effective_from : existing.effective_from,
    patch.effective_to !== undefined ? patch.effective_to : existing.effective_to,
    boolToInt(patch.enabled ?? existing.enabled),
    ruleId,
  ).run()

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_RULE_UPDATE,
    targetUser: '',
    detail: { ruleId, ...patch },
  })

  const updated = await loadRuleById(env.DB, ruleId)
  return jsonResponse<Rule>(updated as Rule)
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0
}

function isValidOptionalDateField(value: string | null | undefined): boolean {
  if (value === undefined || value === null) return true
  return isValidDateString(value)
}

async function readPatchBody(request: Request): Promise<UpdateRuleRequest | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const patch: UpdateRuleRequest = {}

    if ('label' in body) {
      if (typeof body.label !== 'string' || body.label.trim().length === 0) return null
      patch.label = body.label
    }
    if ('short_label' in body) {
      if (body.short_label !== null && typeof body.short_label !== 'string') return null
      patch.short_label = body.short_label as string | null
    }
    if ('description' in body) {
      if (body.description !== null && typeof body.description !== 'string') return null
      patch.description = body.description as string | null
    }
    if ('icon' in body) {
      if (body.icon !== null && typeof body.icon !== 'string') return null
      patch.icon = body.icon as string | null
    }
    if ('category' in body) {
      if (typeof body.category !== 'string' || body.category.trim().length === 0) return null
      patch.category = body.category
    }
    if ('type' in body) {
      if (typeof body.type !== 'string') return null
      patch.type = body.type as UpdateRuleRequest['type']
    }
    if ('config' in body) {
      if (typeof body.config !== 'object' || body.config === null) return null
      patch.config = body.config as UpdateRuleRequest['config']
    }
    if ('points' in body) {
      if (typeof body.points !== 'number' || !Number.isFinite(body.points)) return null
      patch.points = body.points
    }
    if ('sort_order' in body) {
      if (typeof body.sort_order !== 'number') return null
      patch.sort_order = body.sort_order
    }
    if ('effective_from' in body) {
      if (body.effective_from !== null && typeof body.effective_from !== 'string') return null
      patch.effective_from = body.effective_from as string | null
    }
    if ('effective_to' in body) {
      if (body.effective_to !== null && typeof body.effective_to !== 'string') return null
      patch.effective_to = body.effective_to as string | null
    }
    if ('enabled' in body) {
      if (typeof body.enabled !== 'boolean') return null
      patch.enabled = body.enabled
    }
    return patch
  } catch {
    return null
  }
}
