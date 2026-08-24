import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import { loadPublicConfig } from '../../_lib/appConfig'
import { loadAllUsers } from '../../_lib/users'
import { loadAllRules } from '../../_lib/rules'
import { isValidMonthString, loadRibbonRows } from '../../_lib/stats'
import { getMonthBoundaries } from '../../../src/lib/dates'
import type { RibbonResponse } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const INVALID_MONTH_MESSAGE = 'month must be YYYY-MM.'

// GET /api/stats/ribbon?month=YYYY-MM — spec §8.5 #2, §9. The signature element: one row per
// person, one cell per calendar day of the month.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const month = url.searchParams.get('month')
  if (month === null || !isValidMonthString(month)) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_MONTH_MESSAGE)
  }

  const config = await loadPublicConfig(context.env.DB)
  const challengeRange = { start: config.challenge_start, end: config.challenge_end }
  const monthRange = getMonthBoundaries(month)

  const [users, rules] = await Promise.all([
    loadAllUsers(context.env.DB),
    loadAllRules(context.env.DB),
  ])
  const usersRows = await loadRibbonRows(context.env.DB, users, rules, monthRange, challengeRange)

  const response: RibbonResponse = { month, users: usersRows }
  return jsonResponse(response)
}
