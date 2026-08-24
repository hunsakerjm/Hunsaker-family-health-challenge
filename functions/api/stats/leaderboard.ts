import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import { loadPublicConfig } from '../../_lib/appConfig'
import { loadAllUsers } from '../../_lib/users'
import { loadLeaderboardEntries, resolvePeriodRange } from '../../_lib/stats'
import type { LeaderboardResponse, StatsPeriod } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const INVALID_PERIOD_MESSAGE = "period must be 'month' or 'all'."
const INVALID_MONTH_MESSAGE = 'month must be YYYY-MM and is required when period=month.'

function parsePeriod(value: string | null): StatsPeriod | null {
  return value === 'month' || value === 'all' ? value : null
}

// GET /api/stats/leaderboard?period=month|all&month=YYYY-MM — spec §8.5 #1, §9. Also backs the
// Consistency widget (§8.5 #4): `LeaderboardEntry` already carries days_logged and
// avg_points_per_logged_day from the same per-person query, no second endpoint needed.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const period = parsePeriod(url.searchParams.get('period'))
  if (period === null) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_PERIOD_MESSAGE)
  }
  const month = url.searchParams.get('month') ?? undefined

  const config = await loadPublicConfig(context.env.DB)
  const challengeRange = { start: config.challenge_start, end: config.challenge_end }
  const periodRange = resolvePeriodRange(period, month, challengeRange)
  if (periodRange === null) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_MONTH_MESSAGE)
  }

  const users = await loadAllUsers(context.env.DB)
  const entries = await loadLeaderboardEntries(context.env.DB, users, periodRange, challengeRange)

  const response: LeaderboardResponse = {
    period,
    month: period === 'month' ? (month as string) : null,
    entries,
  }
  return jsonResponse(response)
}
