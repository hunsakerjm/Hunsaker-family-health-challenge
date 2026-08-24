# Build Status — Family Health Challenge PWA

## Purpose

This is the orchestrator's recovery file. If session context is cleared or tokens run out, a fresh agent reads `CLAUDE.md`, the spec, and this file in order to resume cold without re-derivation. This file is updated whenever a phase starts, a branch is created, an agent is dispatched, work merges, or a blocker appears.

## Current state

**Overall status:** Phase 1 vertical slice deployed — password gate + splash live on
`hunsaker-family.pages.dev`, host-locked, D1 seeded. Awaiting owner to set two secrets and add the
custom domain. See `Docs/PHASE1_LOG.md` for full detail and remaining gaps.  
**Active branch:** `phase-1-foundation` (not merged to `main`)  
**Last updated:** 2026-08-24 00:20 UTC

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
| **Phase 1** Foundation | `migrations/0001_schema.sql`, `migrations/0002_seed.sql`, `/api/auth/**`, `/api/bootstrap`, `/api/health`, date utilities, `src/types.ts`, `src/api.ts`, custom domain | Nothing (parallel with Phase 0) | `phase-1-foundation` | **VERTICAL SLICE DEPLOYED** | Pages project + D1 bindings + schema + seed (6 rules, config, no users) all live. PBKDF2 auth gate, HMAC session cookie, D1-backed rate limiting, host-lock middleware, `/api/bootstrap` all built and deployed to `hunsaker-family.pages.dev`. **Gaps before this phase is fully done:** `src/types.ts`/`src/api.ts` contract not published (scoped out of this pass — needed before Phase 2 opens), custom domain not attached (owner does this, dashboard-only), `INITIAL_FAMILY_PASSWORD`/`SESSION_SECRET` secrets not set (orchestrator's job), no automated tests yet for date/scoring helpers (minimal date helper only; full `src/lib/dates.ts` + `maxPointsForDate` still needed). See `Docs/PHASE1_LOG.md`. |
| **Phase 2** Logging | Identity picker, Today screen, day nav, `/api/logs/:userId/:date`, own-vs-other treatment, celebration engine (§11.2) | Phase 0 + 1 | `phase-2-logging` | NOT STARTED | **Critical path: MVP.** Identity picker with claimed/unclaimed states. Server-side scoring. Celebration escalation and settings. Splittable into 2a (screens/identity) and 2b (celebrations). |
| **Phase 3A** Calendar + weight | Calendar month grid, pip meters, weight entry/correction, baseline, per-date weight screen | Phase 2 | `phase-3a-calendar-weight` | NOT STARTED | Per-date pip meters, unlogged vs. zero distinction, weight glyph, weight entry and correction, baseline designation. |
| **Phase 3B** Standings | Leaderboard, ribbon, completion radar, consistency chart, weight-% tab, month filter, person toggles | Phase 2 | `phase-3b-standings` | NOT STARTED | **Highest visual risk.** Lazy-load route; Recharts must not touch Today screen. Tie handling, ribbon signature element. |
| **Phase 3C** Settings | People manager, identity editor, rule editor with effective dates, config editor, password change, CSV export | Phase 2 | `phase-3c-settings` | NOT STARTED | Supports adding people, rules, changing config, all without redeploy. Backdating warnings for rules. |
| **Phase 4** Offline / PWA | Manifest, icons, service worker, IndexedDB queue, `/api/sync/batch`, optimistic UI, safe areas, install hint, CSP/headers | Phase 2 (may start after 3A/3B/3C begin) | `phase-4-offline` | NOT STARTED | Full day in airplane mode syncs on reconnect. IndexedDB write queue. Optimistic UI with pending indicators. |
| **Phase 5** Launch readiness | Ambient motion, month recap, D1 → R2 backup procedure, README, acceptance checklist | Phase 3 + 4 | `phase-5-launch` | NOT STARTED | Built last, removable. Scheduled backup to R2 + restore procedure. Full §15 checklist on real iPhone. |

## The shared contract

Before Phase 2 opens, Phase 1 must publish three files. Track agents (3A, 3B, 3C) code against these and never against each other:

- [ ] `src/types.ts` — every API request/response shape (§9)
- [ ] `src/api.ts` — typed client with one function per endpoint (§9)
- [ ] `src/theme.ts` — tokens, palette, `mix`/`tint`/`desat` (§11.1)

## Infrastructure checklist

One-time Cloudflare setup from spec Appendix B:

- [x] `npx wrangler login` — **DONE**, verified 2026-08-23. Account `8603be88d3c34c2040688eaed3ca595b`, scopes include `d1 (write)`, `pages (write)`, `workers_kv (write)`.
- [x] Create D1 database `health-challenge` — production. `database_id = 3f848810-e935-4796-aefe-1d3dce54ab49`
- [x] Create D1 database `health-challenge-preview` — preview environment. `database_id = 22e69832-9957-4499-b4db-1f1b16b92c77`
- [x] Record both `database_id` values into `wrangler.toml`
- [x] Create Pages project — `hunsaker-family`, created and deployed via CLI (`wrangler pages project create` / `wrangler pages deploy`). Live at `https://hunsaker-family.pages.dev` (host-locked, returns 404 — confirmed).
- [x] Apply migrations locally: `npx wrangler d1 migrations apply health-challenge --local` (and `health-challenge-preview --env preview --local`)
- [x] Apply migrations remotely: `npx wrangler d1 migrations apply health-challenge --remote` (and `health-challenge-preview --env preview --remote`)
- [ ] Set secret `INITIAL_FAMILY_PASSWORD`: `npx wrangler pages secret put INITIAL_FAMILY_PASSWORD` — **PENDING, orchestrator's job.** Code fails safe (500, no detail) until set; confirmed no secrets currently set via `wrangler pages secret list`.
- [ ] Set secret `SESSION_SECRET` (32+ random bytes, base64): `npx wrangler pages secret put SESSION_SECRET` — **PENDING, orchestrator's job.** Same fail-safe behavior.
- [ ] Add apex custom domain `hunsaker-family.com` via Pages → Custom domains
- [ ] Verify domain resolves and real URL loads on a phone over cellular

## Blockers / open questions

- ~~**Cloudflare nameserver propagation.**~~ **RETIRED 2026-08-23.** `dig NS hunsaker-family.com` returns `clyde.ns.cloudflare.com` and `suzanne.ns.cloudflare.com` — delegation is live. No A record and no MX exist, confirming a clean apex.
- **Token lacks `zone (write)`.** The wrangler OAuth token has `zone (read)` only. Creating the apex custom domain writes a DNS record, so the CLI will likely refuse it. **The owner must add the custom domain through the Cloudflare dashboard** (Pages → Custom domains). Every other infrastructure step in the checklist above is runnable from the CLI.
- **Wrangler version drift.** Installed 4.73.0; latest is 4.125.0. Spec Appendix B warns the Pages/D1 CLI surface changes often — bump before running infrastructure commands.

## Log

**2026-08-23 16:40** — Verified live environment: wrangler authenticated, `hunsaker-family.com` NS delegated to Cloudflare with no A/MX records. NS blocker retired; two new blockers logged (`zone (write)` scope, wrangler version).

**2026-08-23 16:15** — Setup complete. All four spec §0 owner inputs resolved. DECISIONS.md entry added. BUILD_STATUS.md created. CLAUDE.md reconciled. Ready to brief Phase 0 agent.
