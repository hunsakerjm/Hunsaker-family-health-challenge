// Covers the offline write queue's crux behaviors (spec §10, this track's brief): a genuine
// network/offline failure enqueues and reports 'queued'; a real server rejection (4xx) still
// throws and never touches the queue; a flush drains FIFO; a partial batch result only removes the
// ops the server actually accepted or permanently rejected; and replaying the same op (a dropped
// response, then a retry) is safe because the client_op_id — and therefore the server-side
// upsert's natural key — never changes between attempts.
//
// No real IndexedDB exists in this project's `node` test environment (vitest.config.ts), and
// `idb` is not an allowed dependency (package.json is orchestrator-owned) — so `indexedDB` is
// stubbed globally with a small in-memory fake that implements just the surface `src/lib/offline/
// db.ts` actually calls. `../../api` is mocked so no real `fetch` ever happens; `ApiError` is kept
// as the real class since `queue.ts` does `instanceof` checks against it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncBatchResponse, SyncOp } from '../../types'

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>()
  return {
    ...actual,
    putLog: vi.fn(),
    putWeight: vi.fn(),
    syncBatch: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// A minimal in-memory fake of the IndexedDB surface db.ts actually uses: open, a single object
// store keyed by client_op_id, one index over `seq`, put/delete/count, and getAll/openCursor on
// the index. Every call resolves via queueMicrotask so `await`-ing callers behaves like the real,
// asynchronous IndexedDB API.
// ---------------------------------------------------------------------------

interface FakeRecord {
  client_op_id: string
  seq: number
  op: unknown
}

function createFakeIndexedDB() {
  const rows = new Map<string, FakeRecord>()

  class FakeRequest<T> {
    result: T | undefined = undefined
    error: unknown = null
    onsuccess: (() => void) | null = null
    onerror: (() => void) | null = null

    resolve(result: T) {
      this.result = result
      queueMicrotask(() => this.onsuccess?.())
    }
  }

  function sortedRows(): FakeRecord[] {
    return [...rows.values()].sort((a, b) => a.seq - b.seq)
  }

  class FakeIndex {
    getAll() {
      const request = new FakeRequest<FakeRecord[]>()
      request.resolve(sortedRows())
      return request
    }

    openCursor(_range: unknown, direction: 'next' | 'prev') {
      const request = new FakeRequest<{ value: FakeRecord } | null>()
      const ordered = sortedRows()
      const first = direction === 'prev' ? ordered[ordered.length - 1] : ordered[0]
      request.resolve(first ? { value: first } : null)
      return request
    }
  }

  class FakeObjectStore {
    put(record: FakeRecord) {
      rows.set(record.client_op_id, record)
      return new FakeRequest<undefined>()
    }

    delete(id: string) {
      rows.delete(id)
      return new FakeRequest<undefined>()
    }

    count() {
      const request = new FakeRequest<number>()
      request.resolve(rows.size)
      return request
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    index(_name: string) {
      return new FakeIndex()
    }
  }

  class FakeTransaction {
    oncomplete: (() => void) | null = null
    onerror: (() => void) | null = null
    error: unknown = null

    constructor() {
      queueMicrotask(() => this.oncomplete?.())
    }

    objectStore(_name: string) {
      return new FakeObjectStore()
    }
  }

  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => new FakeObjectStore(),
    transaction: (_name: string, _mode: string) => new FakeTransaction(),
  }

  return {
    open(_name: string, _version: number) {
      const request = new FakeRequest<typeof database>()
      request.resolve(database)
      return request
    },
    _rows: rows,
  }
}

// ---------------------------------------------------------------------------
// Test setup — fresh fake IndexedDB and fresh module instances every test, so db.ts's
// module-scoped connection cache and seq counter never leak between cases.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', createFakeIndexedDB())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function loadModules() {
  const api = await import('../../api')
  const db = await import('./db')
  const queue = await import('./queue')
  return { api, db, queue }
}

function okResult(clientOpId: string) {
  return { client_op_id: clientOpId, ok: true }
}

function failResult(clientOpId: string, code: number, message = 'failed') {
  return { client_op_id: clientOpId, ok: false, error: { code, message } }
}

/** Flushes both the microtask queue and one macrotask tick — enough for any chain of awaited fake
 * IndexedDB requests (each of which resolves via `queueMicrotask`) plus any fire-and-forget
 * `.then()` this module doesn't await to have fully settled. */
function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('queuedPutLog / queuedPutWeight — network failure vs. server rejection', () => {
  it('enqueues and returns queued on a network/offline failure', async () => {
    const { api, db, queue } = await loadModules()
    vi.mocked(api.putLog).mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await queue.queuedPutLog('alice', '2026-09-05', { water: 1 })

    expect(result.status).toBe('queued')
    const stored = await db.getAllQueuedOps()
    expect(stored).toHaveLength(1)
    expect(stored[0].op).toMatchObject({ op_type: 'log', user_id: 'alice', log_date: '2026-09-05' })
  })

  it('throws on a 4xx and never enqueues', async () => {
    const { api, db, queue } = await loadModules()
    vi.mocked(api.putLog).mockRejectedValue(new api.ApiError(400, 'That date is outside the editable range.'))

    await expect(
      queue.queuedPutLog('alice', '2026-09-05', { water: 1 }),
    ).rejects.toMatchObject({ message: 'That date is outside the editable range.' })

    const stored = await db.getAllQueuedOps()
    expect(stored).toHaveLength(0)
  })

  it('throws on a 401 (auth) exactly like a 4xx and never enqueues', async () => {
    const { api, db, queue } = await loadModules()
    vi.mocked(api.putWeight).mockRejectedValue(new api.ApiError(401, 'Unauthorized.'))

    await expect(queue.queuedPutWeight('alice', '2026-09-05', 150)).rejects.toThrow('Unauthorized.')

    const stored = await db.getAllQueuedOps()
    expect(stored).toHaveLength(0)
  })

  it('enqueues a weight write on a network failure and returns synced on success otherwise', async () => {
    const { api, queue } = await loadModules()
    const savedEntry = {
      user_id: 'alice', log_date: '2026-09-05', weight_lb: 150, is_baseline: false, updated_at: 'now',
    }
    vi.mocked(api.putWeight).mockResolvedValue(savedEntry)

    const result = await queue.queuedPutWeight('alice', '2026-09-05', 150)

    expect(result).toEqual({ status: 'synced', data: savedEntry })
  })
})

describe('flushQueue', () => {
  it('drains the queue in FIFO order', async () => {
    const { api, queue } = await loadModules()
    vi.mocked(api.putLog).mockRejectedValue(new TypeError('offline'))

    const first = await queue.queuedPutLog('alice', '2026-09-01', { water: 1 })
    const second = await queue.queuedPutLog('alice', '2026-09-02', { water: 1 })
    const third = await queue.queuedPutLog('alice', '2026-09-03', { water: 1 })
    if (first.status !== 'queued' || second.status !== 'queued' || third.status !== 'queued') {
      throw new Error('expected all three writes to queue')
    }

    let sentOpIds: string[] = []
    vi.mocked(api.syncBatch).mockImplementation(async (request) => {
      sentOpIds = request.ops.map((op) => op.client_op_id)
      const results = request.ops.map((op) => okResult(op.client_op_id))
      return { results } satisfies SyncBatchResponse
    })

    await queue.flushQueue()

    expect(sentOpIds).toEqual([first.opId, second.opId, third.opId])
  })

  it('removes only the ok ops on a partial batch result, keeping the rest queued', async () => {
    const { api, db, queue } = await loadModules()
    vi.mocked(api.putLog).mockRejectedValue(new TypeError('offline'))

    const succeeds = await queue.queuedPutLog('alice', '2026-09-01', { water: 1 })
    const serverRejects = await queue.queuedPutLog('alice', '2026-09-02', { water: 1 })
    const serverErrors = await queue.queuedPutLog('alice', '2026-09-03', { water: 1 })
    if (succeeds.status !== 'queued' || serverRejects.status !== 'queued' || serverErrors.status !== 'queued') {
      throw new Error('expected all three writes to queue')
    }

    vi.mocked(api.syncBatch).mockResolvedValue({
      results: [
        okResult(succeeds.opId),
        failResult(serverRejects.opId, 400, 'That date is outside the editable range.'),
        failResult(serverErrors.opId, 500, 'Something went wrong. Try again.'),
      ],
    })

    await queue.flushQueue()

    const remaining = await db.getAllQueuedOps<SyncOp>()
    const remainingIds = remaining.map((record) => record.client_op_id)
    // `succeeds` (ok) and `serverRejects` (4xx — will never succeed on replay) are both gone;
    // `serverErrors` (5xx — transient) is the only one left for the next flush attempt.
    expect(remainingIds).toEqual([serverErrors.opId])
  })

  it('is a no-op when the queue is empty', async () => {
    const { api, queue } = await loadModules()

    await queue.flushQueue()

    expect(api.syncBatch).not.toHaveBeenCalled()
  })
})

describe('replay idempotency', () => {
  it('reuses the same client_op_id across a dropped-response retry, and only removes it once accepted', async () => {
    const { api, db, queue } = await loadModules()
    vi.mocked(api.putLog).mockRejectedValue(new TypeError('offline'))

    const queued = await queue.queuedPutLog('alice', '2026-09-05', { water: 1 })
    if (queued.status !== 'queued') throw new Error('expected the write to queue')

    // First flush attempt: the whole batch request itself fails to complete (e.g. the response is
    // dropped after the server already applied it) — the op must stay queued, unchanged.
    vi.mocked(api.syncBatch).mockRejectedValueOnce(new TypeError('network dropped'))
    await queue.flushQueue()

    const afterFirstAttempt = await db.getAllQueuedOps()
    expect(afterFirstAttempt).toHaveLength(1)
    expect(afterFirstAttempt[0].client_op_id).toBe(queued.opId)

    // Second flush attempt: same op, same client_op_id — replaying it is exactly what the
    // server's (user_id, log_date, rule_key) upsert key makes idempotent (functions/_lib/sync.ts).
    let replayedOpId: string | undefined
    vi.mocked(api.syncBatch).mockImplementationOnce(async (request) => {
      replayedOpId = request.ops[0]?.client_op_id
      return { results: [okResult(request.ops[0].client_op_id)] }
    })
    await queue.flushQueue()

    expect(replayedOpId).toBe(queued.opId)
    const afterSecondAttempt = await db.getAllQueuedOps()
    expect(afterSecondAttempt).toHaveLength(0)
  })
})

describe('subscribePendingCount', () => {
  it('fires immediately with the current count and again after an enqueue', async () => {
    const { api, queue } = await loadModules()
    vi.mocked(api.putLog).mockRejectedValue(new TypeError('offline'))

    const seen: number[] = []
    const unsubscribe = queue.subscribePendingCount((count) => seen.push(count))

    // Let the initial async read fire before triggering the change we actually care about.
    // `broadcastPendingCount` is fire-and-forget from `queuedPutLog`'s point of view, and chains
    // several awaits of its own (open the fake db, then count()), so a macrotask tick is needed to
    // flush all of it — a couple of bare microtask ticks isn't reliably enough.
    await flushAsyncWork()

    await queue.queuedPutLog('alice', '2026-09-05', { water: 1 })
    await flushAsyncWork()

    expect(seen[0]).toBe(0)
    expect(seen[seen.length - 1]).toBe(1)
    unsubscribe()
  })
})
