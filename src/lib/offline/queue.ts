// The offline write queue (spec §10). PINNED public interface — Track 4A and the orchestrator
// code against these exact exports (see repo CLAUDE.md's parallelism contract and this track's
// brief). Internals (storage shape, id generation, flush strategy) are free to change; the six
// exports below are not.
//
// The crux of this module: distinguishing a network/offline failure (queue it, resolve later)
// from a real server rejection (surface it now). `putLog`/`putWeight` in `src/api.ts` throw
// `ApiError` for any non-2xx HTTP response — that means the server was reached and answered, even
// if the answer was "no." A 4xx there is validation or auth the client can't fix by waiting, so it
// must still throw and let the screen roll back its optimistic update, exactly as it does today.
// Anything else — a thrown non-`ApiError` (fetch rejected: offline, DNS, CORS-preflight failure)
// or a 5xx (transient server trouble) — is exactly the case retrying later can fix, so those queue
// instead. Queuing a genuinely invalid write would hide the error forever; that is the one mistake
// this module cannot make.
import { ApiError, putLog, putWeight, syncBatch } from '../../api'
import type {
  DayLogState,
  SyncBatchRequest,
  SyncLogOp,
  SyncOp,
  SyncWeightOp,
  WeightEntry,
} from '../../types'
import {
  countQueuedOps,
  deleteQueuedOps,
  getAllQueuedOps,
  putQueuedOp,
} from './db'

export type QueuedWriteResult<T> =
  | { status: 'synced'; data: T }
  | { status: 'queued'; opId: string }

const CLIENT_ERROR_STATUS_MIN = 400
const CLIENT_ERROR_STATUS_MAX = 499

function isClientErrorCode(code: number): boolean {
  return code >= CLIENT_ERROR_STATUS_MIN && code <= CLIENT_ERROR_STATUS_MAX
}

/** True when `error` is the kind of failure a later retry can plausibly fix: a network/transport
 * failure (not an `ApiError` at all — the request never got a response), or a 5xx from the server.
 * False for a 4xx `ApiError`, which is a rejection the client needs to see now, not hide in a
 * queue. */
function isRetryableFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return !isClientErrorCode(error.code)
}

function generateClientOpId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID (older WebViews, some test runners).
  return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ---------------------------------------------------------------------------
// Queued writes
// ---------------------------------------------------------------------------

export async function queuedPutLog(
  userId: string,
  date: string,
  values: Record<string, number>,
  actingUserId?: string,
): Promise<QueuedWriteResult<DayLogState>> {
  try {
    const data = await putLog(userId, date, values, actingUserId)
    return { status: 'synced', data }
  } catch (error) {
    if (!isRetryableFailure(error)) throw error
    const opId = generateClientOpId()
    const op: SyncLogOp = {
      op_type: 'log',
      client_op_id: opId,
      user_id: userId,
      log_date: date,
      values,
    }
    await putQueuedOp(opId, op)
    void broadcastPendingCount()
    return { status: 'queued', opId }
  }
}

export async function queuedPutWeight(
  userId: string,
  date: string,
  weightLb: number,
  actingUserId?: string,
): Promise<QueuedWriteResult<WeightEntry>> {
  try {
    const data = await putWeight(userId, date, weightLb, actingUserId)
    return { status: 'synced', data }
  } catch (error) {
    if (!isRetryableFailure(error)) throw error
    const opId = generateClientOpId()
    const op: SyncWeightOp = {
      op_type: 'weight',
      client_op_id: opId,
      user_id: userId,
      log_date: date,
      weight_lb: weightLb,
    }
    await putQueuedOp(opId, op)
    void broadcastPendingCount()
    return { status: 'queued', opId }
  }
}

// ---------------------------------------------------------------------------
// Pending count subscription
// ---------------------------------------------------------------------------

const pendingCountListeners = new Set<(count: number) => void>()

async function broadcastPendingCount(): Promise<void> {
  if (pendingCountListeners.size === 0) return
  const count = await countQueuedOps()
  for (const listener of pendingCountListeners) listener(count)
}

/** Registers `listener` for pending-count changes and fires it once immediately with the current
 * count, so a newly mounted indicator never shows a stale value. Returns an unsubscribe. */
export function subscribePendingCount(listener: (count: number) => void): () => void {
  pendingCountListeners.add(listener)
  countQueuedOps()
    .then(listener)
    .catch(() => {
      // Best-effort initial read — a transient IndexedDB failure here just means the indicator
      // waits for the next successful mutation to report a count.
    })
  return () => {
    pendingCountListeners.delete(listener)
  }
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

let flushInFlight: Promise<void> | null = null

/** Sends every queued op through `/api/sync/batch` in one round trip (spec §10), removes ops the
 * server accepted, and drops ops the server rejected with a 4xx (they will never succeed on
 * replay — see `isRetryableFailure`'s mirror image below). Ops that fail for transport reasons
 * (the whole batch request itself couldn't complete, or an individual op came back queued for
 * retry) are left in place for the next flush. Concurrent calls collapse into the one in flight —
 * this function does exactly one attempt and returns; it is never a retry loop, so it can't
 * hot-spin. */
export async function flushQueue(): Promise<void> {
  if (flushInFlight) return flushInFlight
  flushInFlight = performFlush().finally(() => {
    flushInFlight = null
  })
  return flushInFlight
}

async function performFlush(): Promise<void> {
  const records = await getAllQueuedOps<SyncOp>()
  if (records.length === 0) return

  const request: SyncBatchRequest = { ops: records.map((record) => record.op) }

  let response
  try {
    response = await syncBatch(request)
  } catch {
    // The batch request itself never got a response (offline, or the server 5xx'd the whole
    // request before per-op results existed) — leave everything queued for the next trigger.
    return
  }

  const idsToRemove: string[] = []
  for (const result of response.results) {
    if (result.ok || isClientErrorCode(result.error?.code ?? 0)) {
      idsToRemove.push(result.client_op_id)
    }
    // Anything else (a 5xx-shaped per-op error) stays queued for the next flush attempt.
  }

  if (idsToRemove.length > 0) {
    await deleteQueuedOps(idsToRemove)
  }
  await broadcastPendingCount()
}

// ---------------------------------------------------------------------------
// Auto-flush wiring
// ---------------------------------------------------------------------------

let autoFlushUnsubscribe: (() => void) | null = null

/** Flushes on `online` and whenever the tab becomes visible again — the two moments connectivity
 * is most likely to have just returned. Idempotent: a second call while already active is a no-op
 * that returns a no-op unsubscribe, so callers never have to track whether they already started
 * it. No polling interval — only event-driven, so there is nothing to hot-spin. */
export function startAutoFlush(): () => void {
  if (autoFlushUnsubscribe) {
    return () => {}
  }

  function handleOnline() {
    void flushQueue()
  }
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void flushQueue()
  }

  window.addEventListener('online', handleOnline)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // Covers the case where ops were left queued from a previous session and the device is already
  // online by the time this runs (e.g. app reopened after connectivity was restored).
  void flushQueue()

  autoFlushUnsubscribe = () => {
    window.removeEventListener('online', handleOnline)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    autoFlushUnsubscribe = null
  }
  return autoFlushUnsubscribe
}
