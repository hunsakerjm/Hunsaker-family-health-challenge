import type { Env } from '../../../_lib/env'
import { jsonError, jsonResponse } from '../../../_lib/http'
import { loadUserById } from '../../../_lib/users'
import type { ClaimUserResponse } from '../../../../src/types'

const NOT_FOUND_STATUS = 404
const USER_NOT_FOUND_MESSAGE = 'No such person.'

// POST /api/users/:id/claim — spec §3.2: "Tapping writes activeUserId to that device's
// localStorage and sets users.claimed_at server-side so other devices see the updated state."
// This is a SOFT SIGNAL ONLY (spec §3.2, §3.3) — it never gates any write, and re-claiming an
// already-claimed person (the confirmation flow for "Set up on another device") is allowed and
// simply refreshes claimed_at rather than being rejected.
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, params } = context
  const userId = String(params.id)

  const existing = await loadUserById(env.DB, userId)
  if (!existing) {
    return jsonError(NOT_FOUND_STATUS, USER_NOT_FOUND_MESSAGE)
  }

  const nowIso = new Date().toISOString()
  await env.DB
    .prepare(`UPDATE users SET claimed_at = ?, updated_at = ? WHERE id = ?`)
    .bind(nowIso, nowIso, userId)
    .run()

  const updated = await loadUserById(env.DB, userId)
  return jsonResponse<ClaimUserResponse>(updated as ClaimUserResponse)
}
