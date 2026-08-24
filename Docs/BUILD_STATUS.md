# Build Status — Family Health Challenge PWA

## Purpose

This is the orchestrator's recovery file. If session context is cleared or tokens run out, a fresh agent reads `CLAUDE.md`, the spec, and this file in order to resume cold without re-derivation. This file is updated whenever a phase starts, a branch is created, an agent is dispatched, work merges, or a blocker appears.

## Current state

**Overall status:** Slice 0 **LIVE and verified in production** at `https://hunsaker-family.com` — password gate, session cookie, per-IP rate limiting, and host lock all confirmed by end-to-end tests. Phase 1 foundation plus the parallelism contract (`src/types.ts`, `src/api.ts`, `src/lib/dates.ts`, server-side scoring, three test suites) are now complete on `phase-1b-contract`. Phase 0 in progress concurrently on `phase-0-design`. Awaiting owner go-ahead / merge for the parallel build phases.
**Active branches:** `phase-1-foundation` (superseded by `phase-1b-contract`, not merged to `main`), `phase-1b-contract` (this pass, not merged), `phase-0-design` (concurrent, not merged)
**Last updated:** 2026-08-24 01:30 UTC

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
| **Phase 0** Design system | `src/theme.ts`, `src/components/` (primitives), demo route | Nothing | `phase-0-design` | NOT STARTED | Vite + React scaffold, fonts, theme provider, palette, `mix`/`tint`/`desat`. Demo: every primitive + 16 colors in both themes. |
| **Phase 1** Foundation | `migrations/0001_schema.sql`, `migrations/0002_seed.sql`, `/api/auth/**`, `/api/bootstrap`, `/api/health`, date utilities, `src/types.ts`, `src/api.ts`, custom domain | Nothing (parallel with Phase 0) | `phase-1-foundation` + `phase-1b-contract` | **CONTRACT PUBLISHED** | Pages project + D1 bindings + schema + seed (6 rules, config, no users) all live. PBKDF2 auth gate, HMAC session cookie, D1-backed rate limiting, host-lock middleware, `/api/bootstrap` all built and deployed to `hunsaker-family.pages.dev`. On `phase-1b-contract` (this pass): `src/types.ts` (full §9 request/response contract) and `src/api.ts` (one client fn per §9 endpoint) published; `src/lib/dates.ts` implements `serverToday`/date math/`maxPointsForDate`, shared by client and server (`functions/_lib/dates.ts` now re-exports it); `functions/_lib/scoring.ts` implements server-side scoring ahead of Phase 2's write route; `functions/api/bootstrap.ts` updated to emit the typed contract (parsed rule config, real booleans/numbers) — re-verified end-to-end locally, demo unaffected. 53 tests across the three Appendix B areas, all passing; `npx tsc --noEmit` and `npm run build` both clean. **Remaining gap:** custom domain / secrets status — see infrastructure checklist below (already marked done there; this row's earlier text was stale). See `Docs/PHASE1_LOG.md` and `Docs/PHASE1B_LOG.md`. |
| **Phase 2** Logging | Identity picker, Today screen, day nav, `/api/logs/:userId/:date`, own-vs-other treatment, celebration engine (§11.2) | Phase 0 + 1 | `phase-2-logging` | NOT STARTED | **Critical path: MVP.** Identity picker with claimed/unclaimed states. Server-side scoring. Celebration escalation and settings. Splittable into 2a (screens/identity) and 2b (celebrations). |
| **Phase 3A** Calendar + weight | Calendar month grid, pip meters, weight entry/correction, baseline, per-date weight screen | Phase 2 | `phase-3a-calendar-weight` | NOT STARTED | Per-date pip meters, unlogged vs. zero distinction, weight glyph, weight entry and correction, baseline designation. |
| **Phase 3B** Standings | Leaderboard, ribbon, completion radar, consistency chart, weight-% tab, month filter, person toggles | Phase 2 | `phase-3b-standings` | NOT STARTED | **Highest visual risk.** Lazy-load route; Recharts must not touch Today screen. Tie handling, ribbon signature element. |
| **Phase 3C** Settings | People manager, identity editor, rule editor with effective dates, config editor, password change, CSV export | Phase 2 | `phase-3c-settings` | NOT STARTED | Supports adding people, rules, changing config, all without redeploy. Backdating warnings for rules. |
| **Phase 4** Offline / PWA | Manifest, icons, service worker, IndexedDB queue, `/api/sync/batch`, optimistic UI, safe areas, install hint, CSP/headers | Phase 2 (may start after 3A/3B/3C begin) | `phase-4-offline` | NOT STARTED | Full day in airplane mode syncs on reconnect. IndexedDB write queue. Optimistic UI with pending indicators. |
| **Phase 5** Launch readiness | Ambient motion, month recap, D1 → R2 backup procedure, README, acceptance checklist | Phase 3 + 4 | `phase-5-launch` | NOT STARTED | Built last, removable. Scheduled backup to R2 + restore procedure. Full §15 checklist on real iPhone. |

## The shared contract

Before Phase 2 opens, Phase 1 must publish three files. Track agents (3A, 3B, 3C) code against these and never against each other:

- [x] `src/types.ts` — every API request/response shape (§9) — published on `phase-1b-contract`
- [x] `src/api.ts` — typed client with one function per endpoint (§9) — published on `phase-1b-contract`
- [ ] `src/theme.ts` — tokens, palette, `mix`/`tint`/`desat` (§11.1) — Phase 0, in progress on `phase-0-design`

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

- **Successful logins count against the rate limit.** A correct password is refused once an IP hits 10 attempts in 15 minutes. Fine at this threshold; change to reset-on-success if it ever annoys anyone. Two-line change in `functions/_lib/rateLimit.ts`.
- **Preview deployments are unviewable.** The host lock 404s every hostname except `hunsaker-family.com`, so branch previews cannot be opened on a phone. Options: merge to `main` frequently (nobody uses the app until 2026-09-01, so broken intermediate states cost nothing), or relax the host lock in the preview environment only. Not yet decided.
- **CSP header deferred.** `Content-Security-Policy` is deliberately not set — Phase 0's per-user color system may need inline styles. Phase 4 owns headers; decide there.
- ~~**Phase 1 is not finished.**~~ RETIRED 2026-08-24 on `phase-1b-contract` — `src/types.ts`, `src/api.ts`, full `src/lib/dates.ts` with `maxPointsForDate`, `functions/_lib/scoring.ts`, and all three required test suites are published and passing. Still needed before merge to `main`: reconcile with `phase-1-foundation` and `phase-0-design`, then the orchestrator decides when Phase 2 opens.
- **Spec/CLAUDE.md date inconsistency found while writing DST tests.** `2027-03-08` (named in CLAUDE.md and the spec as a DST transition to test) is a Monday and is not a real DST transition — the actual 2027 spring-forward is `2027-03-14`. Also, the challenge window ends `2027-02-28`, before either March date, so no spring transition actually falls inside the challenge. Not fixed here (out of this agent's scope) — `src/lib/dates.test.ts` tests both the named date and the real one; see its header comment and `Docs/PHASE1B_LOG.md`.

## Log

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
