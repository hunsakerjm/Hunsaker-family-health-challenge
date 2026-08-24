import type { Env } from '../../../_lib/env'
import { jsonError, jsonResponse } from '../../../_lib/http'
import { loadUserById } from '../../../_lib/users'
import { loadWeightSeriesForUser } from '../../../_lib/weights'
import type { WeightEntry } from '../../../../src/types'

const NOT_FOUND_STATUS = 404
const USER_NOT_FOUND_MESSAGE = 'No such person.'

// GET /api/weights/:userId — spec §8.6/§9: the full dated series for exactly one person. This is
// the only weight READ route in the app — there is no bare `/api/weights` and no aggregate
// variant (see functions/_lib/weights.ts's file header for the structural privacy argument). The
// app has no per-device server-side auth (spec §2/§3: one shared password only), so this route
// cannot restrict "who is asking" — the guarantee spec §9 actually asks for is narrower: a
// response about user A can never contain user B's pounds, and no aggregate response can contain
// pounds at all. Spec §8.6 "own page only" is a client routing rule (src/screens/WeightDetail.tsx
// is only ever linked from the viewer's own page), the same pattern §3.4 already uses for logs
// ("everyone can read everything, live").
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context
  const userId = String(params.userId)

  const user = await loadUserById(env.DB, userId)
  if (!user) {
    return jsonError(NOT_FOUND_STATUS, USER_NOT_FOUND_MESSAGE)
  }

  const entries: WeightEntry[] = await loadWeightSeriesForUser(env.DB, userId)
  return jsonResponse(entries)
}
