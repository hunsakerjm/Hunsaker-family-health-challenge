import type { Env } from '../_lib/env'
import { computeServerTodayInTimezone } from '../_lib/dates'
import { loadPublicConfig } from '../_lib/appConfig'
import { parseRuleRow, type RuleRow } from '../_lib/rules'
import { loadAllUsers } from '../_lib/users'
import { loadLogEntriesForRange } from '../_lib/logs'
import { getMonthBoundaries, getMonthKey } from '../../src/lib/dates'
import type { BootstrapResponse, Rule } from '../../src/types'

// Spec §9 / §14 Phase 1 demo: one call on cold start returning config, serverToday, rules
// effective now, users, and the current month's logs. Phase 2a (this pass) filled in the last two
// arrays, which Phase 1b correctly left empty since no logging screen or identity picker existed
// yet to consume them. Response shape matches `src/types.ts` BootstrapResponse exactly — that
// file is the contract, this handler is one of its implementations.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  const config = await loadPublicConfig(env.DB)
  const serverToday = computeServerTodayInTimezone(config.timezone)
  const rules = await loadEffectiveRules(env.DB, serverToday)
  const users = await loadAllUsers(env.DB)
  const { start, end } = getMonthBoundaries(getMonthKey(serverToday))
  const logs = await loadLogEntriesForRange(env.DB, start, end)

  const body: BootstrapResponse = {
    config,
    serverToday,
    rules,
    users,
    logs,
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

async function loadEffectiveRules(db: D1Database, todayIso: string): Promise<Rule[]> {
  const result = await db
    .prepare(
      `SELECT id, key, label, short_label, description, icon, category, type, config, points,
              sort_order, effective_from, effective_to, enabled
       FROM rules
       WHERE enabled = 1
         AND (effective_from IS NULL OR effective_from <= ?)
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY sort_order ASC`,
    )
    .bind(todayIso, todayIso)
    .all<RuleRow>()
  return (result.results ?? []).map(parseRuleRow)
}
