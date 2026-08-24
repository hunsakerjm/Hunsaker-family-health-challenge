import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import {
  isColorTakenByActiveUser, loadAllUsers, loadUserById, nextUserSortOrder,
} from '../../_lib/users'
import { recordAuditEntry } from '../../_lib/audit'
import { PALETTE_ORDER } from '../../../src/theme'
import type { CreateUserRequest, User } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const CONFLICT_STATUS = 409
const CREATED_STATUS = 201
const MISSING_NAME_MESSAGE = 'display_name is required.'
const INVALID_COLOR_MESSAGE = 'color_key must be one of the 16 palette colors.'
const COLOR_TAKEN_MESSAGE = 'That color is already claimed by an active person.'
const ACTING_USER_HEADER = 'X-Acting-User'
const AUDIT_ACTION_USER_CREATE = 'user.create'

// GET /api/users — spec §9. Returns every person, active and archived (spec §9's bootstrap
// contract already returns this same shape for cold start; this route exists for callers that
// need a fresh read outside the bootstrap cycle).
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const users = await loadAllUsers(context.env.DB)
  return jsonResponse(users)
}

// POST /api/users — spec §4.1/§8.7 people manager "add." Phase 3C. `active_from` is passed
// through exactly as sent — the "adding mid-challenge sets active_from to that date" rule (§8.7)
// is a Settings-form default (send serverToday when past challenge_start), not server behavior;
// see Docs/DECISIONS.md 2026-08-24.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const body = await readCreateBody(request)
  if (!body) {
    return jsonError(BAD_REQUEST_STATUS, MISSING_NAME_MESSAGE)
  }
  if (!isValidColorKey(body.color_key)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_COLOR_MESSAGE)
  }
  if (await isColorTakenByActiveUser(env.DB, body.color_key, null)) {
    return jsonError(CONFLICT_STATUS, COLOR_TAKEN_MESSAGE)
  }

  const id = crypto.randomUUID()
  const nowIso = new Date().toISOString()
  const sortOrder = await nextUserSortOrder(env.DB)

  await env.DB.prepare(
    `INSERT INTO users (id, display_name, color_key, emoji, sort_order, in_points_challenge,
      in_weight_challenge, claimed_at, active_from, active_to, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'active', ?, ?)`,
  ).bind(
    id,
    body.display_name,
    body.color_key,
    body.emoji ?? null,
    sortOrder,
    body.in_points_challenge === false ? 0 : 1,
    body.in_weight_challenge === true ? 1 : 0,
    body.active_from ?? null,
    nowIso,
    nowIso,
  ).run()

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_USER_CREATE,
    targetUser: id,
    detail: body,
  })

  const created = await loadUserById(env.DB, id)
  return jsonResponse<User>(created as User, CREATED_STATUS)
}

function isValidColorKey(value: string): boolean {
  return (PALETTE_ORDER as readonly string[]).includes(value)
}

async function readCreateBody(request: Request): Promise<CreateUserRequest | null> {
  try {
    const body = (await request.json()) as Partial<CreateUserRequest>
    if (typeof body.display_name !== 'string' || body.display_name.trim().length === 0) return null
    if (typeof body.color_key !== 'string') return null
    return {
      display_name: body.display_name,
      color_key: body.color_key,
      emoji: typeof body.emoji === 'string' ? body.emoji : null,
      in_points_challenge: body.in_points_challenge !== false,
      in_weight_challenge: body.in_weight_challenge === true,
      active_from: typeof body.active_from === 'string' ? body.active_from : null,
    }
  } catch {
    return null
  }
}
