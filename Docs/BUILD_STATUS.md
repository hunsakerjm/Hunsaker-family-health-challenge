# Build Status — Family Health Challenge PWA

## Purpose

This is the orchestrator's recovery file. If session context is cleared or tokens run out, a fresh agent reads `CLAUDE.md`, the spec, and this file in order to resume cold without re-derivation. This file is updated whenever a phase starts, a branch is created, an agent is dispatched, work merges, or a blocker appears.

## Current state

**Overall status:** All six phases (0 through 5) COMPLETE — code merged to `main` and deployed to production at `https://hunsaker-family.com`. Every tab is wired (Today, Calendar, Standings, Settings). Offline operation, PWA install, ambient motion, and month recap all working end-to-end. **Phase 5 code is complete and deployed; spec §15 acceptance checklist partially verified on device, remainder outstanding with the owner.** Current state of the data: the database has **1 user (Josh, blue, in both points and weight challenges), 6 rules, 0 log entries, 0 weight entries**. All Phase 4 test entries deleted post-verification per owner request.
**Active branches:** None — all complete phases merged and deployed.
**Last updated:** 2026-08-24 (Phase 5 complete and deployed to production; §15 checklist partially verified on physical iPhone)

## Owner inputs

All four spec §0 inputs are now resolved and recorded. No further owner questions are needed.

| Input | Value |
|-------|-------|
| **Hostname** | `hunsaker-family.com` (apex domain, no subdomain) |
| **Shared family password** | Set via `npx wrangler pages secret put INITIAL_FAMILY_PASSWORD` — not recorded in repo |
| **Repo location** | `https://github.com/hunsakerjm/Hunsaker-family-health-challenge.git` |
| **Challenge window** | 2026-09-01 → 2027-02-28 (181 days) |

## Phase board

| Phase | Owns | Depends on | Branch | Status | Notes |
|-------|------|-----------|--------|--------|-------|
| **Phase 0** Design system | `src/theme.ts`, `src/components/` (primitives), demo route | Nothing | `phase-0-design` | **DONE — merged + deployed** | Vite + React scaffold, fonts, theme provider, palette, `mix`/`tint`/`desat`. Demo: every primitive + 16 colors in both themes. |
| **Phase 1** Foundation | `migrations/0001_schema.sql`, `migrations/0002_seed.sql`, `/api/auth/**`, `/api/bootstrap`, `/api/health`, date utilities, `src/types.ts`, `src/api.ts`, custom domain | Nothing (parallel with Phase 0) | `phase-1-foundation` + `phase-1b-contract` | **DONE — merged to `main` + deployed** | Pages project + D1 bindings + schema + seed (6 rules, config, no users) all live. PBKDF2 auth gate, HMAC session cookie, D1-backed rate limiting, host-lock middleware, `/api/bootstrap` all built and deployed to `hunsaker-family.pages.dev`. On `phase-1b-contract` (this pass): `src/types.ts` (full §9 request/response contract) and `src/api.ts` (one client fn per §9 endpoint) published; `src/lib/dates.ts` implements `serverToday`/date math/`maxPointsForDate`, shared by client and server (`functions/_lib/dates.ts` now re-exports it); `functions/_lib/scoring.ts` implements server-side scoring ahead of Phase 2's write route; `functions/api/bootstrap.ts` updated to emit the typed contract (parsed rule config, real booleans/numbers) — re-verified end-to-end locally, demo unaffected. 53 tests across the three Appendix B areas, all passing; `npx tsc --noEmit` and `npm run build` both clean. Custom domain, secrets, and production verification are all COMPLETE — see the infrastructure checklist. Deployed and verified at `https://hunsaker-family.com`. See `Docs/PHASE1_LOG.md` and `Docs/PHASE1B_LOG.md`. |
| **Phase 2** Logging | Identity picker, Today screen, day nav, `/api/logs/:userId/:date`, own-vs-other treatment, celebration engine (§11.2) | Phase 0 + 1 | `phase-2-logging` | **DONE — merged + deployed**| **Critical path: MVP.** Identity picker with claimed/unclaimed states. Server-side scoring. Celebration escalation and settings. Splittable into 2a (screens/identity) and 2b (celebrations). |
| **Phase 3A** Calendar + weight | Calendar month grid, pip meters, weight entry/correction, baseline, per-date weight screen | Phase 2 | `phase-3a-calendar-weight` | **DONE — merged + deployed** | Per-date pip meters, unlogged vs. zero distinction, weight glyph, weight entry and correction, baseline designation. |
| **Phase 3B** Standings | Leaderboard, ribbon, completion radar, consistency chart, weight-% tab, month filter, person toggles | Phase 2 | `phase-3b-standings` | **DONE — merged + deployed** | Lazy-loaded route; Recharts isolated in a 96.23 kB gzip chunk, not touching Today screen. Tie handling and ribbon signature element working. |
| **Phase 3C** Settings | People manager, identity editor, rule editor with effective dates, config editor, password change, CSV export | Phase 2 | `phase-3c-settings` | **DONE — merged + deployed** | People manager, rule editor with effective dates, config editor, password change, CSV export all deployed. No redeploy needed to add people or rules. |
| **Phase 4** Offline / PWA | Manifest, icons, service worker, IndexedDB queue, `/api/sync/batch`, optimistic UI, safe areas, install hint, CSP/headers | Phase 2 (may start after 3A/3B/3C begin) | `phase-4-offline`, `phase-4a-pwa-shell`, `phase-4b-offline-sync` | **DONE — merged + deployed** | Service worker: GET-only interception, app shell precache (required/optional split), network-first `/api/**` with fallback, cache-first hashed `/assets/**`, `/api/export.csv` and `/api/auth/**` never cached. `POST /api/sync/batch`: mixed log+weight ops, sequential, reusing scoring/validation, idempotent. IndexedDB offline queue with FIFO flush on `online` and `visibilitychange`. Optimistic UI + `PendingIndicator` on Today, Calendar, WeightDetail. Manifest, maskable icons, CSP `default-src 'self'` + specific directives. Weight sheet: numeric input + steppers. Single-weigh-in people drop from weight standings (baseline = most recent = 0%). Verified: full day in airplane mode syncs correctly on reconnect, writes queued and flushed in one `/api/sync/batch` round trip. |
| **Phase 5** Launch readiness | Ambient motion, month recap, D1 → R2 backup procedure, README, acceptance checklist | Phase 3 + 4 | `phase-5-launch`, `phase-5a-recap-motion`, `phase-5b-backup-readme` | **DONE — merged + deployed** | Month recap (first-open-of-month screen, per-device via `lastRecapShown` localStorage), ambient motion (calendar pips stagger in, leaderboard bars grow from zero, ribbon wipes), D1 → R2 backup and restore procedure verified. Scheduled automated backups declined by owner (Cloudflare Pages cannot run cron; manually-triggered export at Settings → Export remains). §15 acceptance checklist partially verified on physical iPhone; full checklist outstanding with owner. Code complete and deployed v0.9.1. |

## Verification snapshot — Phase 4 complete and deployed

**Test coverage:** 152 tests passing across 8 files (dates, server-side scoring, maxPointsForDate, and app integration suites).

**Typecheck:** `npx tsc --noEmit` exits 0; `npx tsc -p functions/tsconfig.json --noEmit` exits 0. Build change (v0.8.1): root tsconfig now includes `functions/` to catch server-side type errors at compile time, not runtime.

**Build:** `npm run build` (now `tsc -b && tsc -p functions/tsconfig.json --noEmit && vite build`) exits 0.

**Main bundle:** 78.93 kB gzip (31% of the 250KB §12 budget).

**Recharts:** confirmed **0 references** in the main chunk; isolated in a lazy `HabitRadar-*.js` chunk at 96.23 kB gzip.

**Canvas confetti:** in its own 4.20 kB gzip chunk.

**Service worker:** GET-only interception, app shell precache, network-first `/api/**`, cache-first hashed `/assets/**`. Verified: writes queued in airplane mode, flushed on reconnect in ~350ms via one `/api/sync/batch` round trip.

**Production API verification:**
- Login: 200
- `/api/bootstrap`: 200 (returns typed contract with correct `serverToday`)
- `/api/users`: 200
- `/api/rules`: 200
- `/api/config`: 200
- `/api/export.csv`: 200
- `/api/sync/batch`: 200 (mixed log+weight ops, idempotent)
- All four `/api/stats/*` (with required params): 200
- Stats without required `period`: clear 400 message
- Stats with `period=month` without `month` param: clear 400 message
- Unauthenticated stats requests: correctly 401
- `/manifest.webmanifest`: 200
- `/sw.js`: 200
- All icon endpoints: 200
- CSP and three baseline security headers present
- `hunsaker-family.pages.dev`: still 404 via host lock (correct)

**Current state of the data:** The database has **1 user (Josh, blue, in both points and weight challenges)**. Seed deliberately creates no users (spec §5); Josh was added during Phase 4 verification and remains as baseline user. Phase 4 test entries (2026-08-24) were deleted post-verification per owner request.

## Phase 5 — Complete

Phase 5 delivered ambient motion, month recap, backup and restore documentation, and the acceptance checklist infrastructure. **Code is complete, merged to `main`, and deployed as v0.9.1.**

**What shipped:**
- **Month recap** (`src/screens/MonthRecap.tsx`, `src/lib/recap.ts`): Full-screen panel on first open of a new calendar month showing the previous month's total as the hero number. Tap to dismiss. Per-device via `lastRecapShown` localStorage key. Suppressed in the challenge's first month. No burst under the `subtle` intensity setting. Plain-statement variant for a month with no entries. Fires the month after the challenge ends. Eligibility decided before any network call — adds no request overhead on ordinary app open.
- **Ambient motion** (`src/lib/useAmbientMotion.ts`): Calendar pips stagger in, leaderboard bars grow from zero, ribbon wipes left to right. One hook, reusing `getCelebrationIntensity()` so `prefers-reduced-motion` is inherited. See `Docs/PHASE5A_LOG.md` for removability documentation per spec §11.2.
- **Backup and restore documentation** in `README.md`: Verified `wrangler d1 export` procedure plus restore procedure targeting a fresh database (exports lack `IF NOT EXISTS`, so they fail over a populated database).

**Owner decision on backups (supersedes earlier Phase 5B notes):** Scheduled/automated backups were **declined**. Cloudflare Pages projects cannot run cron triggers, so a scheduled D1→R2 export would have required a separate standalone Worker plus an R2 bucket. The Worker was written, reviewed, and **deleted** (v0.9.1) rather than left dormant. Two on-demand paths remain: the session-protected CSV export at Settings → Export (`/api/export.csv`, spec §9's "load-bearing" export), and manual `wrangler d1 export` for disaster recovery. Spec §12's "or at minimum" clause sanctions this. Reversible — git history retains the Worker.

**Outstanding (all owner tasks, no code work outstanding):**
- Finish the spec §15 acceptance checklist on a physical iPhone. Note: both DST transitions to test are `2026-11-01` and `2027-03-14` (spec's `2027-03-08` is a Monday and is wrong).
- Add the remaining family members through Settings → People.
- Distribute the URL and the shared password to the family.

**Note:** `challenge_start` was reset to `2026-09-01` by the owner and verified in production D1 on 2026-08-24. With `backfill_limit_days = 0` (unlimited) and `future_logging_days = 7`, the editable date window is currently empty (min = challenge start = Sept 1; max = today + 7 = Aug 31). Checkboxes are therefore inert until 2026-09-01. This is correct behavior, not a defect, and resolves itself on Sept 1. **No further reset action needed.**

## The shared contract

Before Phase 2 opens, Phase 1 must publish three files. Track agents (3A, 3B, 3C) code against these and never against each other:

- [x] `src/types.ts` — every API request/response shape (§9) — published on `phase-1b-contract`
- [x] `src/api.ts` — typed client with one function per endpoint (§9) — published on `phase-1b-contract`
- [x] `src/theme.ts` — tokens, palette, `mix`/`tint`/`desat` (§11.1) — Phase 0, in progress on `phase-0-design`

## Infrastructure checklist

One-time Cloudflare setup from spec Appendix B:

- [x] `npx wrangler login` — **DONE**, verified 2026-08-23. Account `8603be88d3c34c2040688eaed3ca595b`, scopes include `d1 (write)`, `pages (write)`, `workers_kv (write)`.
- [x] Create D1 database `health-challenge` — production. `database_id = 3f848810-e935-4796-aefe-1d3dce54ab49`
- [x] Create D1 database `health-challenge-preview` — preview environment. `database_id = 22e69832-9957-4499-b4db-1f1b16b92c77`
- [x] Record both `database_id` values into `wrangler.toml`
- [x] Create Pages project — `hunsaker-family`, created and deployed via CLI (`wrangler pages project create` / `wrangler pages deploy`). Live at `https://hunsaker-family.pages.dev` (host-locked, returns 404 — confirmed).
- [x] Apply migrations locally: `npx wrangler d1 migrations apply health-challenge --local` (and `health-challenge-preview --env preview --local`)
- [x] Apply migrations remotely: `npx wrangler d1 migrations apply health-challenge --remote` (and `health-challenge-preview --env preview --remote`)
- [x] Set secret `INITIAL_FAMILY_PASSWORD` — **DONE** 2026-08-23, production environment. Verified via `wrangler pages secret list`.
- [x] Set secret `SESSION_SECRET` — **DONE** 2026-08-23, 32 random bytes via `openssl rand -base64 32`, production environment. Secrets bind at deploy time, so a redeploy was required after setting them.
- [x] Add apex custom domain `hunsaker-family.com` via Pages → Custom domains
- [x] Verify domain resolves and the real URL serves the gate — **DONE**. Full test matrix passed: root 200, `/api/health` 200, wrong password 401, correct password 200 + session cookie, `/api/bootstrap` 401 without cookie and 200 with, rate limit 429 at 10 attempts/IP, `pages.dev` 404, HSTS + nosniff + referrer-policy + noindex all present.

## Blockers / open questions

**All infrastructure blockers are retired.** Kept below for the record.

- ~~**Cloudflare nameserver propagation.**~~ RETIRED — delegation live, apex A records now resolve (`104.21.56.177`, `172.67.187.92`).
- ~~**Token lacks `zone (write)`.**~~ RETIRED — owner added the apex custom domain via the dashboard. Note for the future: the CLI still cannot write DNS, so any further DNS change is an owner dashboard task.
- ~~**Wrangler version drift.**~~ RETIRED — upgraded to 4.125.0.

### Open decisions, non-blocking

- **Rate limit counts successful logins and is per-household-IP.** A correct password is refused once an IP hits 10 attempts in 15 minutes. Rate limit is per-household-IP (not per-person). Both behaviors are flagged as worth tuning before launch day. Two-line change in `functions/_lib/rateLimit.ts` if either needs adjustment.
- **Preview deployments remain unviewable.** The host lock 404s every hostname except `hunsaker-family.com`, so branch previews cannot be opened on a phone. Workaround: merge to `main` frequently (nobody uses the app until 2026-09-01, so broken intermediate states cost nothing). Not yet decided whether to relax the host lock in the preview environment only.
- ~~**CSP header deferred.**~~ RESOLVED in Phase 4 — `Content-Security-Policy` applied with `default-src 'self'`, `script-src 'self'` (no unsafe-inline), `style-src 'self' 'unsafe-inline'` (283 inline style attributes carry per-user color ramps), plus full directive set. Decision: strict CSP with inline styles whitelisted via `'unsafe-inline'` for the color system.

## Log

**2026-08-23 21:45** — **Phase 2 COMPLETE, merged and deployed.** 2a (identity + Today + logging API) and 2b (celebrations) ran in isolated worktrees with no collisions. Merge had exactly one conflict, `src/lib/celebration.ts` (2a's stub vs 2b's real 373-line implementation — 2b won). Verified in production: login 200, bootstrap returns 6 rules + correct serverToday, `/api/users` 200, `/`, `/design-system`, `/celebration-demo` all 200, pages.dev still 404. 66/66 tests, both typechecks exit 0, `canvas-confetti` confirmed in a separate 4.20 kB gzip lazy chunk. Main bundle 62.74 kB gzip.

**Orchestrator error corrected:** the Phase 2a brief said celebrations must "never fire on a backfilled date." Spec §11.2 says the opposite — "Backfilling a past day plays the full sequence; it's the same accomplishment." The agent followed the literal brief and flagged the contradiction instead of silently choosing, which was right. Gate removed in `c3f2422`; celebration now fires on any own-page score increase, with per-date tier dedup preventing replay farming.

**Verification lesson:** `npx tsc --noEmit | tail -5 && echo clean` reports success even when tsc fails, because `tail` exits 0. Always check `$?` directly.

**2026-08-23 17:55** — **Phase 2 interrupted by session limit (resets 9pm PT). All work committed as WIP, nothing lost.** Both tracks ran in isolated git worktrees, which worked correctly — no cross-contamination this time.

Accurate resume state, derived from the actual commits (both agents' own `## Remaining` sections are STALE and list work already finished — do not trust them):

**`phase-2a-logging` @ `e78d0df`** — 646 insertions across 15 files.
DONE: `functions/_lib/{appConfig,audit,dateFormat,http,logs,rules,users}.ts`; `functions/api/logs/index.ts`; `functions/api/logs/[userId]/[date].ts`; `functions/api/users/index.ts`; `functions/api/users/[id]/claim.ts`; `src/lib/identity.ts`; `src/lib/celebration.ts` (local no-op STUB — must be replaced by 2b's real 373-line implementation at merge); `functions/api/bootstrap.ts` rewritten to return real users + current month logs.
REMAINING: `src/screens/Whoami.tsx`; `src/screens/Today.tsx`; routing in `src/App.tsx`; manually seed local D1 test users (never via migration); tests, typecheck, build, gzip check.

**`phase-2b-celebration` @ `918f71b`** — 753 insertions across 6 files.
DONE: `src/lib/celebration.ts` (373 lines, the real implementation); `src/components/CelebrationBanner.tsx`; `src/screens/CelebrationDemo.tsx`; `canvas-confetti` added to package.json.
REMAINING: verify `canvas-confetti` splits into a lazy chunk and does not enter the main bundle; verify `prefers-reduced-motion` degradation; run tests/typecheck/build; report the exact route path + import line 2a must add to `App.tsx`.

**Known merge conflicts to resolve:** `src/lib/celebration.ts` (2a's stub vs 2b's real implementation — 2b wins) and `package.json` (both added dependencies).

**2026-08-23 17:50** — Phases 0 and 1b merged to `main` (fast-forward) and deployed. Production verified: root/health/login 200, `/design-system` 200, `/api/bootstrap` returns the typed contract with correct `serverToday`, fonts served as `font/woff2`, `pages.dev` still 404. 53/53 tests pass; both typechecks clean; bundle 53.35 kB gzip.

**2026-08-23 17:45** — **Process fix needed.** Phases 0 and 1b ran as parallel agents sharing ONE working directory and `.git`. The second agent's `git checkout` moved the first agent's HEAD mid-run. No work was lost — file-ownership boundaries held and the two sets were cleanly separable — but future parallel agents MUST use `isolation: "worktree"` so each gets its own checkout. Do not run parallel agents in a shared tree again.

**2026-08-23 17:44** — **Spec error found and corrected.** The spec and CLAUDE.md both named `2027-03-08` as a DST transition. It is a Monday. The real spring-forward is `2027-03-14` (second Sunday in March). CLAUDE.md corrected; tests cover both dates.

**2026-08-24 02:45** — **Phase 3 COMPLETE, merged and deployed.** All three tracks (3A/3B/3C) ran in isolated worktrees with no collisions. Calendar + weight (3A), Standings with Recharts lazy-loaded (3B), and Settings with people/rule/config management (3C) all verified in production. 152 tests passing across 8 files. Main bundle 78.93 kB gzip (31% of budget). Recharts confirmed in separate 96.23 kB chunk; canvas-confetti in 4.20 kB chunk. Production API: login 200, all `/api/*` endpoints 200 with correct auth and validation. Standings and Calendar render empty (zero users in database — expected). All verification items recorded in snapshot above. Ready for Phase 4 (offline/PWA).

**2026-08-24 01:30** — `phase-1b-contract` branch: published the spec §14 parallelism contract
(`src/types.ts`, `src/api.ts`), the full `src/lib/dates.ts` (serverToday, challenge-timezone date
math, `maxPointsForDate`, shared client/server via `functions/_lib/dates.ts` re-export), and
`functions/_lib/scoring.ts` (server-side scoring, ahead of Phase 2's write route). Updated
`functions/api/bootstrap.ts` to emit the typed contract instead of raw DB rows. 53 automated
tests across all three Appendix B areas (date math + DST, server-side scoring, maxPointsForDate),
all passing. `npx tsc --noEmit` (root and `functions/`) and `npm run build` both clean.
Re-verified the §14 Phase 1 demo end-to-end locally (temporary `.dev.vars`, deleted after) —
login, bootstrap with correct `serverToday` and 6 rules, 401 without a session — unaffected.
Added `vitest` devDependency and `test` script to `package.json`, additive-only (working
alongside the concurrent Phase 0 agent in the same tree; did not touch `src/theme.ts`,
`src/components/`, `src/screens/**`, `src/App.tsx`, or `src/index.css`). Found and flagged a
spec/CLAUDE.md date error: 2027-03-08 is not a real DST transition (real one is 2027-03-14). See
`Docs/PHASE1B_LOG.md` for full detail. Not committed — per instructions, orchestrator merges.

**2026-08-23 17:25** — Slice 0 verified in production. Gate tests all pass: root 200, health 200, wrong password 401, correct password 200 + session cookie, bootstrap 401 without / 200 with cookie, rate limit 429 at 10 attempts per IP, pages.dev 404, all security headers present. Two deploys made (`415365d5` broken by the PBKDF2 cap, `61e38a5f` fixed). Branch `phase-1-foundation` pushed to origin, NOT merged to main.

**2026-08-23 17:05** — PBKDF2 iterations reduced 600k to 100k (Workers platform cap threw NotSupportedError on every login). Owner approved. See DECISIONS.md.

**2026-08-23 16:55** — Zone security configured by owner: SSL Full (strict), Always Use HTTPS, HSTS 6mo (no preload, no includeSubDomains), nosniff, Bot Fight Mode. WAF managed rules and edge rate limiting unavailable on the free plan — app-level rate limit carries that load.

**2026-08-23 16:40** — Verified live environment: wrangler authenticated, `hunsaker-family.com` NS delegated to Cloudflare with no A/MX records. NS blocker retired; two new blockers logged (`zone (write)` scope, wrangler version).

**2026-08-23 16:15** — Setup complete. All four spec §0 owner inputs resolved. DECISIONS.md entry added. BUILD_STATUS.md created. CLAUDE.md reconciled. Ready to brief Phase 0 agent.

---

**2026-08-24 14:30** — **Phase 4 COMPLETE, merged and deployed to production.** Two tracks (`phase-4a-pwa-shell` and `phase-4b-offline-sync`) ran in isolated worktrees with no collisions. All infrastructure delivered:

**Service worker & PWA:**
- GET-only interception; POST/PUT/DELETE pass through untouched.
- App shell precache: required bundle (`dist/index.html`, main JS/CSS, fonts) and optional chunks.
- Network-first for `/api/**` with cache fallback; cache-first for hashed `/assets/**`.
- `/api/export.csv` and `/api/auth/**` never cached.
- Web manifest, full-bleed opaque maskable icons, apple touch icon. Icons generated by pure-Python `scripts/generate-icons.py` (Pillow unusable on this machine — native `_imaging` is x86_64 on arm64 Mac).

**Sync infrastructure:**
- `POST /api/sync/batch` (functions/api/sync/batch.ts, functions/_lib/sync.ts): mixed log + weight ops, sequential, idempotent through existing upsert keys. Reuses scoring/validation/upsert helpers so points stay server-computed.
- IndexedDB offline queue (src/lib/offline/): transport failures and 5xx queue for retry; 4xx throws so the screen rolls back.
- FIFO flush on `online` and `visibilitychange` events.

**UI:**
- Optimistic UI + `PendingIndicator` wired into Today, Calendar, WeightDetail.
- CSP header applied: `default-src 'self'`, `script-src 'self'` (no unsafe-inline), `style-src 'self' 'unsafe-inline'` (283 inline style attributes carry per-user color ramps), plus worker-src, img-src (data: allowed), font-src, connect-src, object-src 'none', base-uri, frame-ancestors 'none'. Replaces the deferred note from earlier; decision made during implementation.

**On-device verification (2026-08-24, physical iPhone):**
- Logged a day in airplane mode; writes queued to IndexedDB.
- Reconnected; batch sync round-trip completed in ~350ms.
- Confirmed in production D1: five rule entries landed within ~350ms of each other in one `/api/sync/batch` call.

**Production deployment (2026-08-24):** `npx wrangler pages deploy dist --project-name hunsaker-family --branch main`. All endpoints verified: `/`, `/api/health`, `/manifest.webmanifest`, `/sw.js`, icons all 200; CSP and baseline security headers present; host lock still 404 on `pages.dev`.

**Build change recorded (v0.8.1):** Root `tsconfig.json` now includes `functions/` for compilation; build command changed to `tsc -b && tsc -p functions/tsconfig.json --noEmit && vite build`. Before this, `functions/` was never typechecked — server-side type errors only surfaced at runtime. Exit-code verification: `npm run build` exits 0; `$?` checked directly (not piped through tail).

**Post-Phase-4 fixes (both deployed):**
- **v0.8.2:** Weight entry sheet was stepper-only (0.5 lb/tap). Now has direct numeric input (`inputMode="decimal"`) with steppers for fine adjustment. Matches spec §8.5 "numeric sheet" requirement.
- **v0.8.3:** Weight percentage now requires ≥2 entries. With one entry, baseline = most recent = 0% (misleading). Applied in `src/lib/weight.ts` and `functions/_lib/stats.ts`. Single-weigh-in people drop from weight standings via existing null filter.

**Database state:** Added Josh (blue, both challenges) for Phase 4 testing. All test entries (2026-08-24) deleted post-verification per owner request. Seed still creates no users (spec §5).

**Decisions recorded as closed (owner decision — not outstanding work):**
- *First-run dead end:* App gates behind `showWhoami || !activeUserId`; identity picker's empty state directs to Settings (only reachable through gate). **Owner decision: not fixing** — owner is seeded in database, empty state no longer reachable.
- *Offline marker treatment:* Spec describes per-entry "Saved on this device" marker; shipped as single `PendingIndicator` count at top. **Owner decision: count stands.**
- *Challenge start deadline:* ~~`challenge_start` in production config was 2026-08-24 (temporary, for Phase 4 on-device testing). Must be reset to 2026-09-01 before family launch.~~ **DONE** — Owner reset to `2026-09-01` and verified in production D1 on 2026-08-24.

**2026-08-24 00:00** — **Phase 5 COMPLETE, merged and deployed to production as v0.9.1.** Three tracks (`phase-5-launch`, `phase-5a-recap-motion`, `phase-5b-backup-readme`) ran in isolated worktrees with no collisions. Delivered:

**Ambient motion:** Calendar pips stagger in, leaderboard bars grow from zero, ribbon wipes left to right via `src/lib/useAmbientMotion.ts`. Reuses `getCelebrationIntensity()` so `prefers-reduced-motion` is inherited. Removability documented in `Docs/PHASE5A_LOG.md` per spec §11.2.

**Month recap:** Full-screen panel showing previous month's total, fires on first open of a new calendar month. Per-device via `lastRecapShown` localStorage. Suppressed in challenge's first month, no burst under `subtle` intensity, plain-statement variant for months with no entries. Eligibility determined before any network call — zero overhead on ordinary app open. Implemented in `src/screens/MonthRecap.tsx` and `src/lib/recap.ts`.

**Backup and restore:** `wrangler d1 export` procedure verified + restore procedure targeting fresh database documented in `README.md`. Scheduled automated backup to R2 **declined by owner** — Cloudflare Pages cannot run cron triggers, and a standalone Worker + R2 would require additional infrastructure. The Worker was written, reviewed, and deleted. Two on-demand paths remain: session-protected CSV export at Settings → Export (`/api/export.csv`) and manual `wrangler d1 export` for disaster recovery.

**Production deployment (2026-08-24):** `npx wrangler pages deploy dist --project-name hunsaker-family --branch main`. All endpoints verified. Database state: 1 user (Josh), 6 rules, 0 log entries, 0 weight entries.

**Spec §15 acceptance checklist:** Partially verified on physical iPhone. Both DST transitions to test are `2026-11-01` (fall back) and `2027-03-14` (spring forward) — spec's `2027-03-08` is incorrect (Monday, not a transition). Full checklist outstanding with owner.

**Owner decision:** `challenge_start` reset to `2026-09-01` (verified in production D1 on 2026-08-24). With `backfill_limit_days = 0` and `future_logging_days = 7`, editable date window is currently empty (min = Sept 1, max = Aug 31). Checkboxes inert until Sept 1 — correct behavior. **All six phases complete.** No Phase 6 exists — spec §14 defines exactly six.
