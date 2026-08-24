// POST /api/sync/batch (spec §9, §10) — the one endpoint the offline queue flushes through. It
// accepts a mix of log and weight operations so a queue holding both kinds empties in a single
// round trip. Session auth and the host lock are already enforced by
// `functions/api/_middleware.ts` / `functions/_middleware.ts` for every non-public /api/** route,
// exactly like every sibling route under functions/api/ — nothing route-specific is added here.
//
// All scoring, validation, and upsert logic lives in `functions/_lib/sync.ts`, which itself calls
// straight into the same `_lib/logs.ts`, `_lib/weights.ts`, and `_lib/scoring.ts` functions the
// single-op routes use. This file's only job is: parse the envelope, apply each op in isolation,
// and report one result per `client_op_id` (spec §10: a single bad op must never abort the rest).
import type { Env } from '../../_lib/env'
import { jsonError, jsonResponse } from '../../_lib/http'
import { applySyncOp, buildSyncContext, parseSyncOp } from '../../_lib/sync'
import type { SyncBatchRequest, SyncBatchOpResult, SyncBatchResponse } from '../../../src/types'

const BAD_REQUEST_STATUS = 400
const INVALID_BODY_MESSAGE = 'Expected {ops: SyncOp[]}.'
const ACTING_USER_HEADER = 'X-Acting-User'

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context

  const body = await readSubmittedBatch(request)
  if (body === null) {
    return jsonError(BAD_REQUEST_STATUS, INVALID_BODY_MESSAGE)
  }

  const actingUser = request.headers.get(ACTING_USER_HEADER)
  const ctx = await buildSyncContext(env.DB, actingUser)

  // Sequential, not Promise.all: ops in one batch can target the same (user, date), and D1's
  // per-statement batching inside upsertScoredEntries already gives per-op atomicity — running ops
  // concurrently here would only risk two upserts for the same row racing for no benefit, since a
  // family's real offline queue is small.
  const results: SyncBatchOpResult[] = []
  for (const rawOp of body.ops) {
    const parsed = parseSyncOp(rawOp)
    if (!parsed.ok) {
      results.push(parsed.result)
      continue
    }
    results.push(await applySyncOp(ctx, parsed.op))
  }

  return jsonResponse<SyncBatchResponse>({ results })
}

async function readSubmittedBatch(request: Request): Promise<SyncBatchRequest | null> {
  try {
    const body = (await request.json()) as Partial<SyncBatchRequest>
    if (!Array.isArray(body.ops)) return null
    return { ops: body.ops }
  } catch {
    return null
  }
}
