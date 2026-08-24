import type { Env } from '../../../_lib/env'
import { jsonError, jsonResponse } from '../../../_lib/http'
import { isValidDateString } from '../../../_lib/dateFormat'
import { loadPublicConfig } from '../../../_lib/appConfig'
import { loadAllRules } from '../../../_lib/rules'
import { loadUserById } from '../../../_lib/users'
import { loadLogEntriesForUserDate, upsertScoredEntries } from '../../../_lib/logs'
import { recordAuditEntry } from '../../../_lib/audit'
import { computeDayScore } from '../../../_lib/scoring'
import {
  computeServerTodayInTimezone,
  getEditableDateRange,
  isDateEditable,
  maxPointsForDate,
  type EditableRangeConfig,
} from '../../../../src/lib/dates'
import type { DayLogState, PutLogRequest, Rule } from '../../../../src/types'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const INVALID_DATE_MESSAGE = 'date must be YYYY-MM-DD.'
const INVALID_BODY_MESSAGE = 'Expected {values: {rule_key: number}}.'
const USER_NOT_FOUND_MESSAGE = 'No such person.'
const ACTING_USER_HEADER = 'X-Acting-User'
const AUDIT_ACTION_LOG_UPSERT = 'log.upsert'

function dateOutOfRangeMessage(config: EditableRangeConfig, serverToday: string): string {
  const { min, max } = getEditableDateRange(config, serverToday)
  return `That date is outside the editable range (${min} to ${max}).`
}

// PUT /api/logs/:userId/:date — spec §4.3/§9: "Server computes points. Returns canonical day
// state including that date's max." Points are never accepted from the client (CLAUDE.md hard
// rule) — only raw `value`s are, and computeDayScore turns those into points server-side.
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const userId = String(params.userId)
  const date = String(params.date)

  if (!isValidDateString(date)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_DATE_MESSAGE)
  }

  const rawValues = await readSubmittedValues(request)
  if (rawValues === null) {
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

  const rules = await loadAllRules(env.DB)
  const score = computeDayScore(rules, date, rawValues)

  const nowIso = new Date().toISOString()
  const scoredEntries = Object.keys(score.values).map((ruleKey) => ({
    ruleKey,
    value: score.values[ruleKey],
    points: score.points[ruleKey],
  }))
  await upsertScoredEntries(env.DB, userId, date, scoredEntries, nowIso)

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_LOG_UPSERT,
    targetUser: userId,
    detail: { date, values: score.values },
  })

  const canonicalState = await buildCanonicalDayState(env.DB, userId, date, rules)
  return jsonResponse<DayLogState>(canonicalState)
}

async function readSubmittedValues(request: Request): Promise<Record<string, number> | null> {
  try {
    const body = (await request.json()) as Partial<PutLogRequest>
    if (!body.values || typeof body.values !== 'object') return null
    const entries = Object.entries(body.values)
    if (!entries.every(([, value]) => typeof value === 'number' && Number.isFinite(value))) {
      return null
    }
    return body.values as Record<string, number>
  } catch {
    return null
  }
}

async function buildCanonicalDayState(
  db: D1Database,
  userId: string,
  date: string,
  rules: readonly Rule[],
): Promise<DayLogState> {
  const entries = await loadLogEntriesForUserDate(db, userId, date)
  const values: Record<string, number> = {}
  const points: Record<string, number> = {}
  let pointsTotal = 0
  for (const entry of entries) {
    values[entry.rule_key] = entry.value
    points[entry.rule_key] = entry.points
    pointsTotal += entry.points
  }

  return {
    user_id: userId,
    log_date: date,
    values,
    points,
    points_total: pointsTotal,
    max_points_for_date: maxPointsForDate(rules, date),
  }
}
