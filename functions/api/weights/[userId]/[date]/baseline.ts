import type { Env } from '../../../../_lib/env'
import { jsonError, jsonResponse } from '../../../../_lib/http'
import { isValidDateString } from '../../../../_lib/dateFormat'
import { loadWeightEntry, setBaselineEntry } from '../../../../_lib/weights'
import { recordAuditEntry } from '../../../../_lib/audit'
import type { WeightEntry } from '../../../../../src/types'

const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404
const INVALID_DATE_MESSAGE = 'date must be YYYY-MM-DD.'
const ENTRY_NOT_FOUND_MESSAGE = 'No weight entry for that date — log a weight before setting it as baseline.'
const ACTING_USER_HEADER = 'X-Acting-User'
const AUDIT_ACTION_WEIGHT_BASELINE = 'weight.baseline'

// POST /api/weights/:userId/:date/baseline — spec §8.6: "A `Set as starting weight` control on
// any entry moves it, enforced unique by ux_weight_baseline." This is a MOVE, not an add —
// setBaselineEntry always clears any prior baseline for this user first inside one D1 batch, so
// the unique index is never violated and no reader sees zero or two baselines mid-flight.
//
// Deliberately not gated by the editable date window (unlike PUT/DELETE on the sibling route):
// designating a baseline doesn't create or change any data, it only flags an entry that already
// passed that check when it was written. Spec §8.6's late-joiner use case — "if someone joins the
// challenge two weeks late, they set their real starting weight" — needs this to work on an entry
// from before backfill_limit_days would otherwise allow editing.
export const onRequestPost: PagesFunction<Env> = async (context) => {
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

  const nowIso = new Date().toISOString()
  await setBaselineEntry(env.DB, userId, date, nowIso)

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  await recordAuditEntry(env.DB, {
    actingUser,
    action: AUDIT_ACTION_WEIGHT_BASELINE,
    targetUser: userId,
    detail: { date },
  })

  const updated = await loadWeightEntry(env.DB, userId, date)
  return jsonResponse<WeightEntry>(updated as WeightEntry)
}
