import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import { isValidDateString } from '../../_lib/dateFormat'
import { isRuleKeyTaken, loadAllRules, loadRuleById, nextRuleSortOrder } from '../../_lib/rules'
import { loadPublicConfig } from '../../_lib/appConfig'
import { recordAuditEntry } from '../../_lib/audit'
import { addDays, computeServerTodayInTimezone } from '../../../src/lib/dates'
import { isValidRuleConfig } from '../../_lib/ruleConfig'
import type { CreateRuleRequest, Rule, RuleType } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409
const CREATED_STATUS = 201
const INVALID_BODY_MESSAGE = 'label, category, type, and points are required.'
const INVALID_TYPE_MESSAGE = "type must be 'boolean', 'counter', or 'threshold'."
const INVALID_CONFIG_MESSAGE = 'config does not match the fields that rule type requires.'
const INVALID_DATE_MESSAGE = 'effective_from/effective_to must be YYYY-MM-DD dates.'
const KEY_TAKEN_MESSAGE = 'That rule key is already in use.'
const ACTING_USER_HEADER = 'X-Acting-User'
const AUDIT_ACTION_RULE_CREATE = 'rule.create'
const RULE_TYPES: readonly RuleType[] = ['boolean', 'counter', 'threshold']

// GET /api/rules — spec §9. Every rule regardless of `enabled`/effective window (Settings' rules
// editor needs to show disabled and future/past rules too, unlike bootstrap's "effective now" set).
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const rules = await loadAllRules(context.env.DB)
  return jsonResponse(rules)
}

// POST /api/rules — spec §4.3/§4.4/§8.7 rules editor "add." New rules default to
// effective_from = tomorrow when omitted (§4.4: "New rules default to effective_from = tomorrow").
// Backdating is accepted here without a server-side block — spec §4.4 puts the confirm-and-warn
// step in the UI ("requires confirming a warning"), and CreateRuleRequest's own doc comment says
// the server trusts the caller already showed that warning.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const body = await readCreateBody(request)
  if (!body) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_BODY_MESSAGE)
  }
  if (!RULE_TYPES.includes(body.type)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_TYPE_MESSAGE)
  }
  if (!isValidRuleConfig(body.type, body.config ?? {})) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_CONFIG_MESSAGE)
  }
  if (!isValidOptionalDateField(body.effective_from) || !isValidOptionalDateField(body.effective_to)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_DATE_MESSAGE)
  }
  const key = slugify(body.key)
  if (key.length === 0) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_BODY_MESSAGE)
  }
  if (await isRuleKeyTaken(env.DB, key)) {
    return jsonError(CONFLICT_STATUS, KEY_TAKEN_MESSAGE)
  }

  const config = await loadPublicConfig(env.DB)
  const serverToday = computeServerTodayInTimezone(config.timezone)
  const defaultEffectiveFrom = addDays(serverToday, 1)

  const id = crypto.randomUUID()
  const sortOrder = body.sort_order ?? await nextRuleSortOrder(env.DB)

  await env.DB.prepare(
    `INSERT INTO rules (id, key, label, short_label, description, icon, category, type, config,
      points, sort_order, effective_from, effective_to, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    key,
    body.label,
    body.short_label ?? null,
    body.description ?? null,
    body.icon ?? null,
    body.category,
    body.type,
    JSON.stringify(body.config ?? {}),
    body.points,
    sortOrder,
    body.effective_from !== undefined ? body.effective_from : defaultEffectiveFrom,
    body.effective_to ?? null,
    body.enabled === false ? 0 : 1,
  ).run()

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_RULE_CREATE,
    targetUser: '',
    detail: { ruleId: id, ...body },
  })

  const created = await loadRuleById(env.DB, id)
  return jsonResponse<Rule>(created as Rule, CREATED_STATUS)
}

function isValidOptionalDateField(value: string | null | undefined): boolean {
  if (value === undefined || value === null) return true
  return isValidDateString(value)
}

const SLUG_DISALLOWED_CHARS = /[^a-z0-9_]+/g

function slugify(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(SLUG_DISALLOWED_CHARS, '')
}

async function readCreateBody(request: Request): Promise<CreateRuleRequest | null> {
  try {
    const body = (await request.json()) as Partial<CreateRuleRequest>
    if (typeof body.key !== 'string' || body.key.trim().length === 0) return null
    if (typeof body.label !== 'string' || body.label.trim().length === 0) return null
    if (typeof body.category !== 'string' || body.category.trim().length === 0) return null
    if (typeof body.type !== 'string') return null
    if (typeof body.points !== 'number' || !Number.isFinite(body.points)) return null
    return body as CreateRuleRequest
  } catch {
    return null
  }
}
