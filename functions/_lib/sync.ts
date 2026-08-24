// Shared logic for POST /api/sync/batch (spec §9, §10). This file does NOT reimplement scoring,
// validation, or upsert SQL — every actual write goes through the exact same `_lib` functions the
// single-op routes (`functions/api/logs/[userId]/[date].ts`,
// `functions/api/weights/[userId]/[date].ts`) already call. This file only adds the bit those
// routes don't need: turning one op out of a batch into a `SyncBatchOpResult` without letting a
// single bad op abort the rest, per spec §10 "queue holding a mix of the two flushes in a single
// round trip."
//
// Idempotency (spec §9: "Idempotent"): `upsertScoredEntries` and `upsertWeightEntry` are both
// upserts keyed by `(user_id, log_date, rule_key)` and `(user_id, log_date)` respectively — the
// same natural key a replayed op would carry. Replaying an op after a dropped response is
// therefore safe by construction: it just re-runs the same upsert with the same (or newer)
// values. No dedup table, no migration — CLAUDE.md's parallelism contract keeps `migrations/`
// frozen for this phase, and none is needed here.
import type { AppConfig, Rule, SyncBatchOpResult, SyncLogOp, SyncOp, SyncWeightOp } from '../../src/types'
import { computeServerTodayInTimezone, getEditableDateRange, isDateEditable } from '../../src/lib/dates'
import { isValidDateString } from './dateFormat'
import { loadPublicConfig } from './appConfig'
import { loadAllRules } from './rules'
import { loadUserById } from './users'
import { upsertScoredEntries } from './logs'
import { upsertWeightEntry } from './weights'
import { recordAuditEntry } from './audit'
import { computeDayScore } from './scoring'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const UNEXPECTED_ERROR_STATUS = 500
const USER_NOT_FOUND_MESSAGE = 'No such person.'
const MALFORMED_OP_MESSAGE = 'Malformed sync op.'
const INVALID_WEIGHT_MESSAGE = 'Expected {weight_lb: number}.'
const UNEXPECTED_ERROR_MESSAGE = 'Something went wrong. Try again.'
const AUDIT_ACTION_LOG_UPSERT = 'log.upsert'
const AUDIT_ACTION_WEIGHT_UPSERT = 'weight.upsert'
const UNKNOWN_OP_ID = 'unknown'

// Mirrors the "sanity clamp, not a medical bound" in
// functions/api/weights/[userId]/[date].ts — same bounds, kept local here rather than importing a
// private route constant, so this file has no dependency on that route's internals.
const MIN_PLAUSIBLE_WEIGHT_LB = 1
const MAX_PLAUSIBLE_WEIGHT_LB = 1000

class SyncOpError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'SyncOpError'
    this.code = code
  }
}

export interface SyncContext {
  db: D1Database
  config: AppConfig
  serverToday: string
  rules: Rule[]
  actingUser: string | null
}

/** Loaded once per request — config, serverToday, and the full rule set never vary between ops in
 * the same batch, so there is no reason to reload them per op. */
export async function buildSyncContext(db: D1Database, actingUser: string | null): Promise<SyncContext> {
  const config = await loadPublicConfig(db)
  const serverToday = computeServerTodayInTimezone(config.timezone)
  const rules = await loadAllRules(db)
  return { db, config, serverToday, rules, actingUser }
}

export type ParsedSyncOp =
  | { ok: true; op: SyncOp }
  | { ok: false; result: SyncBatchOpResult }

/**
 * Validates one raw JSON value from the request body into a `SyncOp`. The wire contract in
 * `src/types.ts` is trusted for shape, but a batch endpoint receives arbitrary client JSON, so
 * every field is checked at runtime here — the same way the single-op routes validate their body
 * before calling into scoring/upsert code.
 */
export function parseSyncOp(raw: unknown): ParsedSyncOp {
  if (typeof raw !== 'object' || raw === null) {
    return invalidOp(UNKNOWN_OP_ID)
  }
  const candidate = raw as Record<string, unknown>
  const clientOpId = typeof candidate.client_op_id === 'string' ? candidate.client_op_id : UNKNOWN_OP_ID

  if (candidate.op_type === 'log') {
    return parseLogOp(candidate, clientOpId)
  }
  if (candidate.op_type === 'weight') {
    return parseWeightOp(candidate, clientOpId)
  }
  return invalidOp(clientOpId)
}

function invalidOp(clientOpId: string): ParsedSyncOp {
  return {
    ok: false,
    result: { client_op_id: clientOpId, ok: false, error: { code: BAD_REQUEST_STATUS, message: MALFORMED_OP_MESSAGE } },
  }
}

function parseLogOp(candidate: Record<string, unknown>, clientOpId: string): ParsedSyncOp {
  const { user_id: userId, log_date: logDate, values } = candidate
  if (typeof userId !== 'string' || typeof logDate !== 'string' || !isValidDateString(logDate)) {
    return invalidOp(clientOpId)
  }
  if (typeof values !== 'object' || values === null) {
    return invalidOp(clientOpId)
  }
  const entries = Object.entries(values as Record<string, unknown>)
  if (!entries.every(([, value]) => typeof value === 'number' && Number.isFinite(value))) {
    return invalidOp(clientOpId)
  }

  const op: SyncLogOp = {
    op_type: 'log',
    client_op_id: clientOpId,
    user_id: userId,
    log_date: logDate,
    values: values as Record<string, number>,
  }
  return { ok: true, op }
}

function parseWeightOp(candidate: Record<string, unknown>, clientOpId: string): ParsedSyncOp {
  const { user_id: userId, log_date: logDate, weight_lb: weightLb } = candidate
  if (typeof userId !== 'string' || typeof logDate !== 'string' || !isValidDateString(logDate)) {
    return invalidOp(clientOpId)
  }
  if (typeof weightLb !== 'number' || !Number.isFinite(weightLb)) {
    return invalidOp(clientOpId)
  }

  const op: SyncWeightOp = {
    op_type: 'weight',
    client_op_id: clientOpId,
    user_id: userId,
    log_date: logDate,
    weight_lb: weightLb,
  }
  return { ok: true, op }
}

/** Applies one already-parsed op and reports its outcome. Never throws — a failure (validation,
 * not-found, or an unexpected error) becomes a `{ok: false}` result so it can't abort the rest of
 * the batch (spec §10: "one endpoint... a queue holding a mix of the two flushes in a single round
 * trip," which only works if per-op failures are isolated). */
export async function applySyncOp(ctx: SyncContext, op: SyncOp): Promise<SyncBatchOpResult> {
  try {
    if (op.op_type === 'log') {
      await applyLogOp(ctx, op)
    } else {
      await applyWeightOp(ctx, op)
    }
    return { client_op_id: op.client_op_id, ok: true }
  } catch (error) {
    if (error instanceof SyncOpError) {
      return { client_op_id: op.client_op_id, ok: false, error: { code: error.code, message: error.message } }
    }
    return {
      client_op_id: op.client_op_id,
      ok: false,
      error: { code: UNEXPECTED_ERROR_STATUS, message: UNEXPECTED_ERROR_MESSAGE },
    }
  }
}

function dateOutOfRangeMessage(ctx: SyncContext): string {
  const { min, max } = getEditableDateRange(ctx.config, ctx.serverToday)
  return `That date is outside the editable range (${min} to ${max}).`
}

async function requireUser(ctx: SyncContext, userId: string): Promise<void> {
  const user = await loadUserById(ctx.db, userId)
  if (!user) throw new SyncOpError(NOT_FOUND_STATUS, USER_NOT_FOUND_MESSAGE)
}

function requireEditableDate(ctx: SyncContext, date: string): void {
  if (!isDateEditable(date, ctx.config, ctx.serverToday)) {
    throw new SyncOpError(BAD_REQUEST_STATUS, dateOutOfRangeMessage(ctx))
  }
}

// Same rules PUT /api/logs/:userId/:date enforces (CLAUDE.md hard rule): points are always
// recomputed server-side from the rule definition via `computeDayScore`, never trusted from the
// client, and the editable-date window and challenge/backfill/future-logging policy apply exactly
// as they do to the single-op route.
async function applyLogOp(ctx: SyncContext, op: SyncLogOp): Promise<void> {
  await requireUser(ctx, op.user_id)
  requireEditableDate(ctx, op.log_date)

  const score = computeDayScore(ctx.rules, op.log_date, op.values)
  const nowIso = new Date().toISOString()
  const scoredEntries = Object.keys(score.values).map((ruleKey) => ({
    ruleKey,
    value: score.values[ruleKey],
    points: score.points[ruleKey],
  }))
  await upsertScoredEntries(ctx.db, op.user_id, op.log_date, scoredEntries, nowIso)

  await recordAuditEntry(ctx.db, {
    actingUser: ctx.actingUser,
    action: AUDIT_ACTION_LOG_UPSERT,
    targetUser: op.user_id,
    detail: { date: op.log_date, values: score.values },
  })
}

async function applyWeightOp(ctx: SyncContext, op: SyncWeightOp): Promise<void> {
  if (op.weight_lb < MIN_PLAUSIBLE_WEIGHT_LB || op.weight_lb > MAX_PLAUSIBLE_WEIGHT_LB) {
    throw new SyncOpError(BAD_REQUEST_STATUS, INVALID_WEIGHT_MESSAGE)
  }
  await requireUser(ctx, op.user_id)
  requireEditableDate(ctx, op.log_date)

  const nowIso = new Date().toISOString()
  await upsertWeightEntry(ctx.db, op.user_id, op.log_date, op.weight_lb, nowIso)

  await recordAuditEntry(ctx.db, {
    actingUser: ctx.actingUser,
    action: AUDIT_ACTION_WEIGHT_UPSERT,
    targetUser: op.user_id,
    detail: { date: op.log_date, weight_lb: op.weight_lb },
  })
}
