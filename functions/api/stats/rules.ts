import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import { loadPublicConfig } from '../../_lib/appConfig'
import { loadAllUsers } from '../../_lib/users'
import { loadAllRules } from '../../_lib/rules'
import { loadRuleStatsEntries, resolvePeriodRange } from '../../_lib/stats'
import { computeServerTodayInTimezone } from '../../../src/lib/dates'
import type { RuleStatsResponse, StatsPeriod } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const INVALID_PERIOD_MESSAGE = "period must be 'month' or 'all'."
const INVALID_MONTH_MESSAGE = 'month must be YYYY-MM and is required when period=month.'

function parsePeriod(value: string | null): StatsPeriod | null {
  return value === 'month' || value === 'all' ? value : null
}

// GET /api/stats/rules?period=&month= — spec §8.5 #3, §9: "per user × rule: hits, eligible days,
// completion rate. Powers the radar." One spoke per RULE (never per category, spec §8.5) — the
// spoke set is whatever `loadAllRules` returns, so a new rule is a new spoke with no code change.
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

  const serverToday = computeServerTodayInTimezone(config.timezone)
  const [users, rules] = await Promise.all([
    loadAllUsers(context.env.DB),
    loadAllRules(context.env.DB),
  ])
  const entries = await loadRuleStatsEntries(
    context.env.DB,
    users,
    rules,
    periodRange,
    challengeRange,
    serverToday,
  )

  const response: RuleStatsResponse = {
    period,
    month: period === 'month' ? (month as string) : null,
    entries,
  }
  return jsonResponse(response)
}
