# Phase 4B — Offline and Sync — Build Log

Resilience file per orchestrator brief: append a timestamped line after every discrete step.
`## Remaining` is rewritten every time so it never lists work already finished.

## Remaining

Nothing outstanding for this track's own scope. All four deliverables (sync endpoint, offline
queue, optimistic UI + pending indicator on the three owned screens, tests) are built and verified
(`npm run build` exit 0, `npm test` exit 0 — 161/161 passing including 9 new offline-queue cases).

Handoff to the orchestrator (belongs to `src/main.tsx`, which this track does not own):

```ts
import { startAutoFlush } from './lib/offline/queue'
// ... after the app is otherwise set up, once, at module scope or inside a top-level effect:
startAutoFlush()
```

`startAutoFlush()` takes no arguments, wires `online`/`visibilitychange` listeners, attempts an
immediate flush in case ops were left queued from a previous session, and returns an unsubscribe
(safe to ignore for a call that lives for the whole app lifetime; safe to call twice — the second
call is a no-op).

## Log

**2026-08-24** — Branch `phase-4b-offline-sync` created off HEAD. Read spec §9/§10 (extracted
slices only, per brief), `src/types.ts`'s already-pinned `SyncOp`/`SyncBatchRequest`/
`SyncBatchResponse`/`SyncBatchOpResult` shapes, `src/api.ts`'s already-pinned `syncBatch`, the
existing single-op routes (`functions/api/logs/[userId]/[date].ts`,
`functions/api/weights/[userId]/[date].ts`) and their `_lib` dependencies (`logs.ts`, `weights.ts`,
`scoring.ts`, `appConfig.ts`, `rules.ts`, `users.ts`, `audit.ts`, `http.ts`, `dateFormat.ts`,
`session.ts`, `functions/api/_middleware.ts`), and the three owned screens
(`Today.tsx`, `Calendar.tsx`, `WeightDetail.tsx`). Key findings before writing anything:

- Auth is already centralized in `functions/api/_middleware.ts` for every non-public `/api/**`
  route — the new batch route needs zero auth code of its own, exactly like every sibling route.
- `upsertScoredEntries` (keyed on `user_id, log_date, rule_key`) and `upsertWeightEntry` (keyed on
  `user_id, log_date`) are both `ON CONFLICT ... DO UPDATE` upserts already — replaying the same
  logical write is naturally idempotent with no dedup table needed, confirming the brief's
  "no new migration" instruction is achievable, not just permitted.
- The weight bounds check (`MIN_PLAUSIBLE_WEIGHT_LB`/`MAX_PLAUSIBLE_WEIGHT_LB` = 1/1000) is a
  private, unexported pair of constants inside `functions/api/weights/[userId]/[date].ts`, a file
  outside this track's ownership list. Rather than editing that route to export them, duplicated
  the same two literal bounds locally in the new `functions/_lib/sync.ts` with a comment pointing
  at the route they mirror — avoids touching a file not on this track's owned-files list, at the
  cost of one small duplicated pair of constants (not a magic-number violation of CLAUDE.md's hard
  rule, which is specifically about the *scoring* denominators 6/181/1086, not this unrelated
  sanity clamp — the existing route's own comment already calls it "a sanity clamp, not a medical
  bound").
- `functions/` is NOT covered by the root `tsconfig.json`'s `npm run build` (`tsc -b` only includes
  `src` + `vite.config.ts` via project references) — it has its own `functions/tsconfig.json`, not
  wired into any npm script. Ran `npx tsc -p functions/tsconfig.json --noEmit` manually (exit 0) as
  an extra check beyond what the brief's two required commands would have caught; flagging this gap
  for the orchestrator/BUILD_STATUS since a change that only breaks `functions/` type-checking would
  currently pass `npm run build` silently.

**2026-08-24** — Built `functions/_lib/sync.ts` (`buildSyncContext`, `parseSyncOp`, `applySyncOp`)
and `functions/api/sync/batch.ts`. Design: load `config`/`serverToday`/`rules` once per request
(shared across every op in the batch, since none of it varies per op) via `buildSyncContext`;
`parseSyncOp` runtime-validates one arbitrary JSON value into a `SyncLogOp`/`SyncWeightOp` (the
wire contract in `types.ts` is trusted for *shape* but this endpoint receives real client JSON, so
every field is checked, same as the single-op routes' own body validation); `applySyncOp` calls
straight into the existing `_lib` functions (`computeDayScore`, `upsertScoredEntries`,
`upsertWeightEntry`, `recordAuditEntry`) and never throws — a `SyncOpError` (validation/not-found)
or any unexpected error both become a `{ok:false, error:{code,message}}` result, so one bad op in a
batch can never abort the rest (spec §10's whole point of a mixed-op batch endpoint). The route
handler itself just parses the envelope and loops, sequentially (not `Promise.all` — ops can target
the same `(user, date)`, and a family's real offline queue is small, so there's no throughput reason
to risk two upserts for the same row racing). `npx tsc -p functions/tsconfig.json --noEmit` exits 0.

**2026-08-24** — Built the offline queue. `src/lib/offline/db.ts`: raw `indexedDB` (no dependency
added), one object store keyed by `client_op_id`, a `seq` index for FIFO ordering seeded from the
highest existing `seq` on open (so ordering survives a reload with ops still queued from an earlier
session). `src/lib/offline/queue.ts`: implements the six pinned exports exactly. The one real
judgment call is `isRetryableFailure` — the crux the brief calls out: `putLog`/`putWeight` throw
`ApiError` for any non-2xx response (server reached and answered), and a 4xx there is validation or
auth the client can't fix by waiting, so it must still throw and let the screen roll back, exactly
as today. Everything else — a thrown non-`ApiError` (real network/transport failure: offline, DNS,
CORS-preflight failure) **or a 5xx** (transient server trouble) — queues instead, since a retry can
plausibly fix either. This means the queueing boundary is "4xx vs. everything else," not strictly
"network failure vs. HTTP response" — re-read the brief's "not a 4xx" phrasing closely and concluded
a 5xx should queue too, since a 5xx is exactly the kind of failure a later retry is meant to paper
over, and treating it like a 4xx would surface a scary, unactionable error for what's often a
transient blip. `flushQueue` mirrors this on the way back: a per-op result with a 4xx code is
dropped (will never succeed on replay); anything else (5xx, or the whole batch request failing to
complete) stays queued. `flushQueue` collapses concurrent calls into the one in flight and never
retries in a loop — one attempt, then return — so it can't hot-spin; `startAutoFlush` is purely
event-driven (`online` + `visibilitychange`), no polling interval, and idempotent (a second call
while already active is a no-op returning a no-op unsubscribe).

**2026-08-24** — Wired the three owned screens. `Today.tsx`: `submitRuleValue` now calls
`queuedPutLog`; a `{status:'queued'}` result keeps the already-applied optimistic cache entry and
returns early (no rollback, no celebration); a thrown `ApiError` still rolls back and shows
`saveError`, unchanged from before. `handleSaveWeight` calls `queuedPutWeight` the same way — it
never cached weight values locally to begin with, so a queued result needs no extra reconciliation
beyond dismissing the sheet. `Calendar.tsx` and `WeightDetail.tsx`'s weight-save handlers now call
`queuedPutWeight`; since a queued result has no server-confirmed row, both build the optimistic
entry from what the person just typed (a small local helper in `WeightDetail.tsx`,
`buildOptimisticWeightEntry`, preserves the date's existing `is_baseline` flag, matching
`upsertWeightEntry`'s own "never touches `is_baseline` on conflict" behavior) rather than leaving
the UI stale until the next successful sync. `deleteWeight`/`setWeightBaseline` were left exactly
as they were, per the brief — those stay online-only. Added `src/components/PendingIndicator.tsx`
(a quiet pill: `CloudOff` icon + mono count, `theme.surfaceAlt`/`theme.hairline`/`theme.muted`
tokens, `RADIUS.full` — matches `Card`/`Banner`'s existing idioms; renders `null` at zero pending,
never a spinner) and mounted it on all three owned screens near their existing error notices, since
the pending count is a single global signal (one IndexedDB store) and a person could reach any of
the three screens first after going offline.

**2026-08-24** — Celebration decision (deliberate, documented inline in `Today.tsx` next to
`celebrateIfNewTier` too): a queued/offline write **never** celebrates, not even later once the
queue flushes. `celebrateIfNewTier` needs a real server-returned `DayLogState` to compute the
points ratio from; fabricating one from the optimistic client-side estimate risks celebrating a
write the server later rejects or scores differently. And there is no "later" moment where this
function runs for that op on the server's behalf either — `flushQueue` talks to
`/api/sync/batch` directly and never re-enters `Today.tsx`'s code, so a flushed celebration was
never a case this design could support without a much larger change (e.g. the flush path pushing
results back into whichever screen is mounted). Scope call: no celebration is a small, honest gap
for a family habit-tracking app going momentarily offline, and not one worth the complexity of
routing flush results back into a possibly-unmounted screen.

**2026-08-24** — Tests: `src/lib/offline/queue.test.ts`, a small in-memory fake of the exact
IndexedDB surface `db.ts` uses (`open`/`transaction`/`objectStore`/`index`/`put`/`delete`/`count`/
`getAll`/`openCursor`), stubbed onto the global via `vi.stubGlobal` per test with `vi.resetModules`
so `db.ts`'s module-scoped connection cache and seq counter never leak between cases. `../../api`
is mocked (`putLog`/`putWeight`/`syncBatch` as `vi.fn()`s, `ApiError` kept as the real class since
`queue.ts` does `instanceof` checks against it). Nine cases: network failure queues; a 4xx (and,
separately, a 401) throws and never enqueues; a successful write returns `synced` untouched; FIFO
drain order; a partial batch result removes only the accepted/permanently-rejected ops and keeps
the transient (5xx) one queued; an empty-queue flush never calls `syncBatch`; replaying a
dropped-response op reuses the same `client_op_id` on the second attempt and only removes it once
the server actually accepts it; and `subscribePendingCount` fires immediately with the current
count and again after an enqueue. `npm run build` exit 0, `npm test` exit 0 (161/161).

**2026-08-24** — Final verification pass: `npm run build` → 0. `npm test` → 0. Manually also ran
`npx tsc -p functions/tsconfig.json --noEmit` → 0 (not part of the brief's required two commands,
but the only way to typecheck `functions/_lib/sync.ts` / `functions/api/sync/batch.ts`, since
`npm run build` doesn't cover `functions/` at all — see the first log entry). Did not touch
`src/types.ts` — the pinned `SyncOp`/`SyncBatchRequest`/`SyncBatchResponse`/`SyncBatchOpResult`
shapes were sufficient as published, no additive change was needed.
