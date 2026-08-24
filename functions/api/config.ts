import type { Env } from '../_lib/env'
import { jsonError, jsonResponse } from '../_lib/http'
import { isValidDateString } from '../_lib/dateFormat'
import { loadPublicConfig } from '../_lib/appConfig'
import { getSessionVersion } from '../_lib/config'
import { derivePbkdf2HashBase64, generateSaltBase64 } from '../_lib/crypto'
import { recordAuditEntry } from '../_lib/audit'
import { compareDates } from '../../src/lib/dates'
import type { AppConfig, UpdateConfigRequest } from '../../src/types'

const BAD_REQUEST_STATUS = 400
const INVALID_BODY_MESSAGE = 'Invalid request body.'
const INVALID_DATE_MESSAGE = 'challenge_start/challenge_end must be YYYY-MM-DD dates.'
const START_AFTER_END_MESSAGE = 'challenge_start must be on or before challenge_end.'
const INVALID_TIMEZONE_MESSAGE = 'timezone must be a valid IANA time zone name.'
const INVALID_NUMBER_MESSAGE = 'backfill_limit_days/future_logging_days must be whole numbers, 0 or greater.'
const SHORT_PASSWORD_MESSAGE = 'New password must be at least 8 characters.'
const ACTING_USER_HEADER = 'X-Acting-User'
const AUDIT_ACTION_CONFIG_UPDATE = 'config.update'
const MIN_PASSWORD_LENGTH = 8

// Every simple string/number app_config key this route can write, alongside its DB key name.
// Deliberately excludes session_version (only ever changed via the sign_out_all_devices flag,
// spec §3.1) and the two secret password keys (written separately, below, only when a new
// password is supplied).
const SIMPLE_CONFIG_KEYS = [
  'challenge_start', 'challenge_end', 'timezone', 'backfill_limit_days',
  'future_logging_days', 'prize_monthly', 'prize_final', 'challenge_title',
] as const

// GET /api/config — spec §9: "password hash never returned." loadPublicConfig already excludes
// both secret keys at the source, so every reader of app_config (this route, bootstrap, PUT
// /api/logs) shares that guarantee from one place.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const config = await loadPublicConfig(context.env.DB)
  return jsonResponse<AppConfig>(config)
}

// PATCH /api/config — spec §4.1/§8.7 "Challenge" section (title, dates, timezone, backfill limit,
// future-logging window, prize strings) and "Password" section (change password, optionally sign
// out every device). Spec §6: "Changing challenge_start or challenge_end in Settings never
// deletes entries that fall outside the new window. It hides them from standings and warns how
// many are affected" — the warn-with-a-count step is a Settings-screen confirm dialog with
// descriptive text rather than an exact row count (Docs/DECISIONS.md, 2026-08-24); this route
// never deletes anything regardless of what the new window is.
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const patch = await readPatchBody(request)
  if (!patch) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_BODY_MESSAGE)
  }

  const validationError = validatePatch(patch)
  if (validationError) {
    return jsonError(BAD_REQUEST_STATUS, validationError)
  }

  const nowIso = new Date().toISOString()
  const statements = buildConfigStatements(env.DB, patch, nowIso)

  if (patch.new_password) {
    const salt = generateSaltBase64()
    const hash = await derivePbkdf2HashBase64(patch.new_password, salt)
    statements.push(
      env.DB.prepare(`UPDATE app_config SET value = ?, updated_at = ? WHERE key = 'family_password_hash'`)
        .bind(hash, nowIso),
      env.DB.prepare(`UPDATE app_config SET value = ?, updated_at = ? WHERE key = 'family_password_salt'`)
        .bind(salt, nowIso),
    )
  }

  if (patch.sign_out_all_devices) {
    const currentVersion = await getSessionVersion(env.DB)
    statements.push(
      env.DB.prepare(`UPDATE app_config SET value = ?, updated_at = ? WHERE key = 'session_version'`)
        .bind(String(currentVersion + 1), nowIso),
    )
  }

  if (statements.length > 0) {
    await env.DB.batch(statements)
  }

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_CONFIG_UPDATE,
    targetUser: '',
    detail: { ...patch, new_password: patch.new_password ? '[redacted]' : undefined },
  })

  const config = await loadPublicConfig(env.DB)
  return jsonResponse<AppConfig>(config)
}

function buildConfigStatements(
  db: D1Database,
  patch: UpdateConfigRequest,
  nowIso: string,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = []
  for (const key of SIMPLE_CONFIG_KEYS) {
    const value = patch[key]
    if (value === undefined) continue
    statements.push(
      db.prepare(`UPDATE app_config SET value = ?, updated_at = ? WHERE key = ?`)
        .bind(String(value), nowIso, key),
    )
  }
  return statements
}

function validatePatch(patch: UpdateConfigRequest): string | null {
  if (patch.challenge_start !== undefined && !isValidDateString(patch.challenge_start)) {
    return INVALID_DATE_MESSAGE
  }
  if (patch.challenge_end !== undefined && !isValidDateString(patch.challenge_end)) {
    return INVALID_DATE_MESSAGE
  }
  if (
    patch.challenge_start !== undefined
    && patch.challenge_end !== undefined
    && compareDates(patch.challenge_start, patch.challenge_end) > 0
  ) {
    return START_AFTER_END_MESSAGE
  }
  if (patch.timezone !== undefined && !isValidTimezone(patch.timezone)) {
    return INVALID_TIMEZONE_MESSAGE
  }
  if (patch.backfill_limit_days !== undefined && !isNonNegativeInteger(patch.backfill_limit_days)) {
    return INVALID_NUMBER_MESSAGE
  }
  if (patch.future_logging_days !== undefined && !isNonNegativeInteger(patch.future_logging_days)) {
    return INVALID_NUMBER_MESSAGE
  }
  if (patch.new_password !== undefined && patch.new_password.length < MIN_PASSWORD_LENGTH) {
    return SHORT_PASSWORD_MESSAGE
  }
  return null
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function isValidTimezone(timezone: string): boolean {
  try {
    // Constructing is the validation: Intl throws RangeError on an unrecognized IANA zone name,
    // which is exactly what this needs to detect.
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return formatter.resolvedOptions().timeZone.length > 0
  } catch {
    return false
  }
}

async function readPatchBody(request: Request): Promise<UpdateConfigRequest | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const patch: UpdateConfigRequest = {}

    if ('challenge_start' in body) {
      if (typeof body.challenge_start !== 'string') return null
      patch.challenge_start = body.challenge_start
    }
    if ('challenge_end' in body) {
      if (typeof body.challenge_end !== 'string') return null
      patch.challenge_end = body.challenge_end
    }
    if ('timezone' in body) {
      if (typeof body.timezone !== 'string') return null
      patch.timezone = body.timezone
    }
    if ('backfill_limit_days' in body) {
      if (typeof body.backfill_limit_days !== 'number') return null
      patch.backfill_limit_days = body.backfill_limit_days
    }
    if ('future_logging_days' in body) {
      if (typeof body.future_logging_days !== 'number') return null
      patch.future_logging_days = body.future_logging_days
    }
    if ('prize_monthly' in body) {
      if (typeof body.prize_monthly !== 'string') return null
      patch.prize_monthly = body.prize_monthly
    }
    if ('prize_final' in body) {
      if (typeof body.prize_final !== 'string') return null
      patch.prize_final = body.prize_final
    }
    if ('challenge_title' in body) {
      if (typeof body.challenge_title !== 'string' || body.challenge_title.trim().length === 0) return null
      patch.challenge_title = body.challenge_title
    }
    if ('new_password' in body) {
      if (typeof body.new_password !== 'string') return null
      patch.new_password = body.new_password
    }
    if ('sign_out_all_devices' in body) {
      if (typeof body.sign_out_all_devices !== 'boolean') return null
      patch.sign_out_all_devices = body.sign_out_all_devices
    }
    return patch
  } catch {
    return null
  }
}
