import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import { isValidDateString } from '../../_lib/dateFormat'
import { loadLogEntriesForUserRange } from '../../_lib/logs'
import type { LogEntry } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const MISSING_PARAMS_MESSAGE = 'user_id, from, and to are all required.'
const INVALID_DATE_MESSAGE = 'from and to must be YYYY-MM-DD dates.'

// GET /api/logs?user_id=&from=&to= — spec §9: "inclusive range." Session-gated by
// functions/api/_middleware.ts; every family member can read every other member's log (spec §3.4:
// "Everyone can read everything, live"), so there is no ownership check on the read path.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)
  const userId = url.searchParams.get('user_id')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!userId || !from || !to) {
    return jsonError(BAD_REQUEST_STATUS, MISSING_PARAMS_MESSAGE)
  }
  if (!isValidDateString(from) || !isValidDateString(to)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_DATE_MESSAGE)
  }

  const entries: LogEntry[] = await loadLogEntriesForUserRange(env.DB, userId, from, to)
  return jsonResponse(entries)
}
