import type { Env } from '../../_lib/env'
import { jsonResponse } from '../../_lib/http'
import { loadAllUsers } from '../../_lib/users'

// GET /api/users — spec §9. Returns every person, active and archived (spec §9's bootstrap
// contract already returns this same shape for cold start; this route exists for callers that
// need a fresh read outside the bootstrap cycle). Full create/update (POST, PATCH) belong to
// Phase 3C's Settings people-manager and are intentionally not built yet — see Docs/PHASE2A_LOG.md.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const users = await loadAllUsers(context.env.DB)
  return jsonResponse(users)
}
