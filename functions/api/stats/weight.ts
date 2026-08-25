import type { Env } from '../../_lib/env'
import { jsonResponse } from '../../_lib/http'
import { loadAllUsers } from '../../_lib/users'
import { loadWeightStatsEntries } from '../../_lib/stats'
import type { WeightStatsResponse } from '../../../src/types'

// GET /api/stats/weight — spec §8.5 #5, §9, §13#9: "percentages only — pounds never appear in
// this response." Structural, not discipline: `loadWeightStatsEntries` builds `WeightStatsEntry`
// object literals (no `weight_lb` field exists on that type at all), and the one function that
// reads a pound value (`computeWeightPercentChange` in functions/_lib/stats.ts) returns a bare
// `number | null` percentage — there is no object shape anywhere in this path a pound value could
// ride along in, even by accident.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const users = await loadAllUsers(context.env.DB)
  const entries = await loadWeightStatsEntries(context.env.DB, users)
  const response: WeightStatsResponse = { entries }
  return jsonResponse(response)
}
