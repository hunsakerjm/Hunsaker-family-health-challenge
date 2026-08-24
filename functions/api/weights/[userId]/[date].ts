import type { Env } from '../../../_lib/env'
import { jsonError, jsonResponse } from '../../../_lib/http'
import { isValidDateString } from '../../../_lib/dateFormat'
import { loadPublicConfig } from '../../../_lib/appConfig'
import { loadUserById } from '../../../_lib/users'
import { deleteWeightEntry, loadWeightEntry, upsertWeightEntry } from '../../../_lib/weights'
import { recordAuditEntry } from '../../../_lib/audit'
import {
  computeServerTodayInTimezone,
  getEditableDateRange,
  isDateEditable,
  type EditableRangeConfig,
} from '../../../../src/lib/dates'
import type { DeleteWeightResponse, PutWeightRequest, WeightEntry } from '../../../../src/types'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const INVALID_DATE_MESSAGE = 'date must be YYYY-MM-DD.'
const INVALID_BODY_MESSAGE = 'Expected {weight_lb: number}.'
const USER_NOT_FOUND_MESSAGE = 'No such person.'
const ENTRY_NOT_FOUND_MESSAGE = 'No weight entry for that date.'
const ACTING_USER_HEADER = 'X-Acting-User'
const AUDIT_ACTION_WEIGHT_UPSERT = 'weight.upsert'
const AUDIT_ACTION_WEIGHT_DELETE = 'weight.delete'

// A sanity clamp, not a medical bound — rejects obviously-malformed payloads (e.g. a stray extra
// digit, or a unit mix-up) before they ever reach D1. Spec §5 only says `weight_lb REAL NOT NULL`.
const MIN_PLAUSIBLE_WEIGHT_LB = 1
const MAX_PLAUSIBLE_WEIGHT_LB = 1000

function dateOutOfRangeMessage(config: EditableRangeConfig, serverToday: string): string {
  const { min, max } = getEditableDateRange(config, serverToday)
  return `That date is outside the editable range (${min} to ${max}).`
}

// PUT /api/weights/:userId/:date — spec §8.6/§9: upsert, and "the primary way to correct a
// mistyped or missed weigh-in." Same editable-window rule as PUT /api/logs/:userId/:date — spec
// §9's "validate log_date against the challenge window, backfill policy, and future-logging
// window" is written as a general server rule, not a logs-only one, and weight rows share the
// same log_date concept.
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const userId = String(params.userId)
  const date = String(params.date)

  if (!isValidDateString(date)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_DATE_MESSAGE)
  }

  const weightLb = await readSubmittedWeight(request)
  if (weightLb === null) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_BODY_MESSAGE)
  }

  const user = await loadUserById(env.DB, userId)
  if (!user) {
    return jsonError(NOT_FOUND_STATUS, USER_NOT_FOUND_MESSAGE)
  }

  const config = await loadPublicConfig(env.DB)
  const serverToday = computeServerTodayInTimezone(config.timezone)
  if (!isDateEditable(date, config, serverToday)) {
    return jsonError(BAD_REQUEST_STATUS, dateOutOfRangeMessage(config, serverToday))
  }

  const nowIso = new Date().toISOString()
  await upsertWeightEntry(env.DB, userId, date, weightLb, nowIso)

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_WEIGHT_UPSERT,
    targetUser: userId,
    detail: { date, weight_lb: weightLb },
  })

  const saved = await loadWeightEntry(env.DB, userId, date)
  return jsonResponse<WeightEntry>(saved as WeightEntry)
}

// DELETE /api/weights/:userId/:date — spec §8.6: "each editable or deletable." Gated by the same
// editable window as the PUT above, for consistency — a date the family can no longer *edit* under
// the backfill policy shouldn't be silently removable either.
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const userId = String(params.userId)
  const date = String(params.date)

  if (!isValidDateString(date)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_DATE_MESSAGE)
  }

  const existing = await loadWeightEntry(env.DB, userId, date)
  if (!existing) {
    return jsonError(NOT_FOUND_STATUS, ENTRY_NOT_FOUND_MESSAGE)
  }

  const config = await loadPublicConfig(env.DB)
  const serverToday = computeServerTodayInTimezone(config.timezone)
  if (!isDateEditable(date, config, serverToday)) {
    return jsonError(BAD_REQUEST_STATUS, dateOutOfRangeMessage(config, serverToday))
  }

  await deleteWeightEntry(env.DB, userId, date)

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_WEIGHT_DELETE,
    targetUser: userId,
    detail: { date },
  })

  return jsonResponse<DeleteWeightResponse>({ ok: true })
}

async function readSubmittedWeight(request: Request): Promise<number | null> {
  try {
    const body = (await request.json()) as Partial<PutWeightRequest>
    if (typeof body.weight_lb !== 'number' || !Number.isFinite(body.weight_lb)) return null
    if (body.weight_lb < MIN_PLAUSIBLE_WEIGHT_LB || body.weight_lb > MAX_PLAUSIBLE_WEIGHT_LB) {
      return null
    }
    return body.weight_lb
  } catch {
    return null
  }
}
