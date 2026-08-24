// A small, typed IndexedDB wrapper for the offline write queue (spec §10). One database, one
// object store of queued ops keyed by a caller-generated `client_op_id`, with a `seq` index for
// insertion order so `queue.ts` can flush FIFO regardless of how IndexedDB itself would order the
// string keys.
//
// Deliberately raw `indexedDB` — no `idb` or any other dependency (CLAUDE.md, this track's brief:
// "Add no npm dependency"; `package.json` is orchestrator-owned). Every function here reads the
// ambient global `indexedDB`, which is what lets `queue.test.ts` swap in an in-memory fake via
// `vi.stubGlobal('indexedDB', ...)` without this module needing any test-only seam.

const DATABASE_NAME = 'fhc-offline'
const DATABASE_VERSION = 1
const STORE_NAME = 'queued-ops'
const SEQ_INDEX_NAME = 'by-seq'

export interface QueuedOpRecord<T = unknown> {
  client_op_id: string
  seq: number
  op: T
}

let databasePromise: Promise<IDBDatabase> | null = null
let seqCounter: number | null = null

/** Opens (and caches) the one database connection this tab needs. Cached at module scope so every
 * call in a page session reuses the same connection rather than re-opening per operation. */
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'client_op_id' })
        store.createIndex(SEQ_INDEX_NAME, 'seq', { unique: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return databasePromise
}

/** Monotonic insertion-order counter, seeded from the highest `seq` already on disk so ordering
 * survives a page reload with ops still queued from an earlier session. */
async function nextSeq(db: IDBDatabase): Promise<number> {
  if (seqCounter !== null) {
    seqCounter += 1
    return seqCounter
  }
  const highestExisting = await getHighestSeq(db)
  seqCounter = highestExisting + 1
  return seqCounter
}

function getHighestSeq(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const index = transaction.objectStore(STORE_NAME).index(SEQ_INDEX_NAME)
    const request = index.openCursor(null, 'prev')
    request.onsuccess = () => {
      const cursor = request.result
      resolve(cursor ? (cursor.value as QueuedOpRecord).seq : 0)
    }
    request.onerror = () => reject(request.error)
  })
}

/** Adds (or replaces) one queued op. `clientOpId` doubles as the caller's idempotency key and the
 * IndexedDB primary key, so re-enqueuing the same id overwrites rather than duplicates. */
export async function putQueuedOp<T>(clientOpId: string, op: T): Promise<void> {
  const db = await openDatabase()
  const seq = await nextSeq(db)
  const record: QueuedOpRecord<T> = { client_op_id: clientOpId, seq, op }

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/** Every queued op, oldest first — the FIFO order `flushQueue` sends them to the server in. */
export async function getAllQueuedOps<T>(): Promise<QueuedOpRecord<T>[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const index = transaction.objectStore(STORE_NAME).index(SEQ_INDEX_NAME)
    const request = index.getAll()
    request.onsuccess = () => resolve(request.result as QueuedOpRecord<T>[])
    request.onerror = () => reject(request.error)
  })
}

/** Removes a batch of ops by id — used after a flush to drop the ones the server accepted or
 * permanently rejected. A no-op id (already removed, e.g. by a concurrent flush) is silently
 * ignored, matching IDBObjectStore.delete's own semantics. */
export async function deleteQueuedOps(clientOpIds: readonly string[]): Promise<void> {
  if (clientOpIds.length === 0) return
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    for (const id of clientOpIds) store.delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function countQueuedOps(): Promise<number> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
