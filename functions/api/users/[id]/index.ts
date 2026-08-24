import type { Env } from '../../../_lib/env'
import { jsonError, jsonResponse } from '../../../_lib/http'
import { isColorTakenByActiveUser, loadUserById } from '../../../_lib/users'
import { loadPublicConfig } from '../../../_lib/appConfig'
import { recordAuditEntry } from '../../../_lib/audit'
import { isValidDateString } from '../../../_lib/dateFormat'
import { computeServerTodayInTimezone } from '../../../../src/lib/dates'
import { PALETTE_ORDER } from '../../../../src/theme'
import type { UpdateUserRequest, User, UserStatus } from '../../../../src/types'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const CONFLICT_STATUS = 409
const USER_NOT_FOUND_MESSAGE = 'No such person.'
const INVALID_BODY_MESSAGE = 'Invalid request body.'
const INVALID_COLOR_MESSAGE = 'color_key must be one of the 16 palette colors.'
const COLOR_TAKEN_MESSAGE = 'That color is already claimed by an active person.'
const INVALID_DATE_MESSAGE = 'active_from/active_to must be YYYY-MM-DD dates.'
const ACTING_USER_HEADER = 'X-Acting-User'

// PATCH /api/users/:id — spec §4.1/§8.7 people manager: rename, recolor, re-emoji, reorder,
// toggle participation flags, archive/unarchive. Archiving (spec §8.7, §9): "preserves all
// history, removes them from standings from that date forward, and frees their color" — achieved
// entirely by `status`/`active_to`, never a delete, so every aggregate that already respects
// `active_from`/`active_to`/`status` (CLAUDE.md hard rule) picks this up for free.
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context
  const userId = String(params.id)

  const existing = await loadUserById(env.DB, userId)
  if (!existing) {
    return jsonError(NOT_FOUND_STATUS, USER_NOT_FOUND_MESSAGE)
  }

  const patch = await readPatchBody(request)
  if (!patch) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_BODY_MESSAGE)
  }
  if (patch.color_key !== undefined && !isValidColorKey(patch.color_key)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_COLOR_MESSAGE)
  }
  if (!isValidOptionalDateField(patch.active_from) || !isValidOptionalDateField(patch.active_to)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_DATE_MESSAGE)
  }
  if (patch.color_key !== undefined && patch.color_key !== existing.color_key) {
    if (await isColorTakenByActiveUser(env.DB, patch.color_key, userId)) {
      return jsonError(CONFLICT_STATUS, COLOR_TAKEN_MESSAGE)
    }
  }

  const nextStatus: UserStatus = patch.status ?? existing.status
  const isArchiving = nextStatus === 'archived' && existing.status === 'active'
  const isUnarchiving = nextStatus === 'active' && existing.status === 'archived'
  const nextActiveTo = await resolveNextActiveTo(env, patch, existing.active_to, isArchiving, isUnarchiving)

  const nowIso = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE users SET display_name = ?, color_key = ?, emoji = ?, sort_order = ?,
       in_points_challenge = ?, in_weight_challenge = ?, active_from = ?, active_to = ?,
       status = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(
    patch.display_name ?? existing.display_name,
    patch.color_key ?? existing.color_key,
    patch.emoji !== undefined ? patch.emoji : existing.emoji,
    patch.sort_order ?? existing.sort_order,
    boolToInt(patch.in_points_challenge ?? existing.in_points_challenge),
    boolToInt(patch.in_weight_challenge ?? existing.in_weight_challenge),
    patch.active_from !== undefined ? patch.active_from : existing.active_from,
    nextActiveTo,
    nextStatus,
    nowIso,
    userId,
  ).run()

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: isArchiving ? 'user.archive' : isUnarchiving ? 'user.unarchive' : 'user.update',
    targetUser: userId,
    detail: patch,
  })

  const updated = await loadUserById(env.DB, userId)
  return jsonResponse<User>(updated as User)
}

function isValidColorKey(value: string): boolean {
  return (PALETTE_ORDER as readonly string[]).includes(value)
}

function isValidOptionalDateField(value: string | null | undefined): boolean {
  if (value === undefined || value === null) return true
  return isValidDateString(value)
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0
}

// Archiving without an explicit active_to defaults it to serverToday; un-archiving without an
// explicit active_to clears it. An explicit value in the patch always wins. Docs/DECISIONS.md
// 2026-08-24.
async function resolveNextActiveTo(
  env: Env,
  patch: UpdateUserRequest,
  existingActiveTo: string | null,
  isArchiving: boolean,
  isUnarchiving: boolean,
): Promise<string | null> {
  if (patch.active_to !== undefined) return patch.active_to
  if (isArchiving) {
    const config = await loadPublicConfig(env.DB)
    return computeServerTodayInTimezone(config.timezone)
  }
  if (isUnarchiving) return null
  return existingActiveTo
}

async function readPatchBody(request: Request): Promise<UpdateUserRequest | null> {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const patch: UpdateUserRequest = {}

    if ('display_name' in body) {
      if (typeof body.display_name !== 'string' || body.display_name.trim().length === 0) return null
      patch.display_name = body.display_name
    }
    if ('color_key' in body) {
      if (typeof body.color_key !== 'string') return null
      patch.color_key = body.color_key
    }
    if ('emoji' in body) {
      if (body.emoji !== null && typeof body.emoji !== 'string') return null
      patch.emoji = body.emoji as string | null
    }
    if ('sort_order' in body) {
      if (typeof body.sort_order !== 'number') return null
      patch.sort_order = body.sort_order
    }
    if ('in_points_challenge' in body) {
      if (typeof body.in_points_challenge !== 'boolean') return null
      patch.in_points_challenge = body.in_points_challenge
    }
    if ('in_weight_challenge' in body) {
      if (typeof body.in_weight_challenge !== 'boolean') return null
      patch.in_weight_challenge = body.in_weight_challenge
    }
    if ('active_from' in body) {
      if (body.active_from !== null && typeof body.active_from !== 'string') return null
      patch.active_from = body.active_from as string | null
    }
    if ('active_to' in body) {
      if (body.active_to !== null && typeof body.active_to !== 'string') return null
      patch.active_to = body.active_to as string | null
    }
    if ('status' in body) {
      if (body.status !== 'active' && body.status !== 'archived') return null
      patch.status = body.status
    }
    return patch
  } catch {
    return null
  }
}
