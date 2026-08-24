# Build Status — Family Health Challenge PWA

## Purpose

This is the orchestrator's recovery file. If session context is cleared or tokens run out, a fresh agent reads `CLAUDE.md`, the spec, and this file in order to resume cold without re-derivation. This file is updated whenever a phase starts, a branch is created, an agent is dispatched, work merges, or a blocker appears.

## Current state

**Overall status:** Phases 0, 1, 2, and 3 COMPLETE — merged to `main`, deployed, verified in production at `https://hunsaker-family.com`. Every tab is wired (Today, Calendar, Standings, Settings). **Phase 4 (offline/PWA) and Phase 5 (launch readiness) are sequential — no parallel tracks remain.** Current state of the data: the database has **ZERO users**. The seed deliberately creates none (§5). Standings and Calendar will render empty until people are added through Settings (Phase 3C) or seeded directly via D1 on request. This is expected, not a bug.
**Active branches:** None — all complete phases merged and deployed.
**Last updated:** 2026-08-24 (Phase 3 merge and deploy verified)

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
| **Phase 4** Offline / PWA | Manifest, icons, service worker, IndexedDB queue, `/api/sync/batch`, optimistic UI, safe areas, install hint, CSP/headers | Phase 2 (may start after 3A/3B/3C begin) | `phase-4-offline` | NOT STARTED | Full day in airplane mode syncs on reconnect. IndexedDB write queue. Optimistic UI with pending indicators. |
| **Phase 5** Launch readiness | Ambient motion, month recap, D1 → R2 backup procedure, README, acceptance checklist | Phase 3 + 4 | `phase-5-launch` | NOT STARTED | Built last, removable. Scheduled backup to R2 + restore procedure. Full §15 checklist on real iPhone. |

## Verification snapshot — Phase 3 complete and deployed

**Test coverage:** 152 tests passing across 8 files (dates, server-side scoring, maxPointsForDate, and app integration suites).

**Typecheck:** `npx tsc --noEmit` exits 0; `npx tsc --noEmit -p functions/tsconfig.json` exits 0.

**Build:** `npm run build` exits 0.

**Main bundle:** 78.93 kB gzip (31% of the 250KB §12 budget).

**Recharts:** confirmed **0 references** in the main chunk; isolated in a lazy `HabitRadar-*.js` chunk at 96.23 kB gzip.

**Canvas confetti:** in its own 4.20 kB gzip chunk.

**Production API verification:**
- Login: 200
- `/api/bootstrap`: 200 (returns typed contract with correct `serverToday`)
- `/api/users`: 200
- `/api/rules`: 200
- `/api/config`: 200
- `/api/export.csv`: 200
- All four `/api/stats/*` (with required params): 200
- Stats without required `period`: clear 400 message
- Stats with `period=month` without `month` param: clear 400 message
- Unauthenticated stats requests: correctly 401
- `hunsaker-family.pages.dev`: still 404 via host lock (correct)

**Current state of the data:** The database has **ZERO users**. The seed deliberately creates none (spec §5). Standings and Calendar will render empty until people are added through Settings (Phase 3C) or seeded directly via D1 on request. This is expected, not a bug.

## Next phase — Phase 4 (offline/PWA)

Phase 4 owns the offline experience and PWA infrastructure per spec §14 and §10:
- Manifest and icons for install
- Service worker for offline operation
- IndexedDB write queue for outbox durability
- `/api/sync/batch` endpoint for batched syncs on reconnect
- Optimistic UI with pending indicators
- Safe areas for notch/Dynamic Island devices
- Install hint for prompt timing
- CSP and security headers (deferred decision needed — see "Open decisions")

**Demo:** Full day logged in airplane mode syncs correctly on reconnect; pending log entries show pending state until confirmed.

**Note:** Phase 4 is where the deferred `Content-Security-Policy` header decision must finally be made. It is currently deliberately unset due to the per-user color system. See DECISIONS.md and the open decisions list below.

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
- **CSP header deferred.** `Content-Security-Policy` is deliberately not set — Phase 0's per-user color system may need inline styles. Phase 4 owns headers and must finally decide: strict CSP or none. See DECISIONS.md.

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
