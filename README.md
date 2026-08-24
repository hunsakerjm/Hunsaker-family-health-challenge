# Family Health Challenge PWA

A shared, installable web app for a family health challenge: daily habit logging with
checkboxes, points, standings, and an optional weight-loss track. Replaces a Google Sheet.
The single constraint that governs every design decision: **daily logging must take under
ten seconds on a phone.**

**Status: pre-Phase-0. Not yet scaffolded.** No `package.json`, no `src/`, no `functions/`, no
`migrations/` exist yet in this repo.

## Stack

Cloudflare Pages + Pages Functions + D1, React 18 + Vite + TypeScript, Tailwind CSS, Recharts
(lazy-loaded on the Standings route only), `canvas-confetti`, IndexedDB via `idb`. See
`Docs/health-challenge-pwa-requirements-v1.3.md` §2 for the full rationale.

## Where to look

- **`CLAUDE.md`** — standing instructions for any agent working in this repo. Read this first.
- **`Docs/health-challenge-pwa-requirements-v1.3.md`** — the authoritative build spec. Start at
  §0 and §14 if you are orchestrating agents.
- **`Docs/HealthChallengeMockup.jsx`** — the approved visual mockup; wins on visual detail.
- **`Docs/DECISIONS.md`** — append-only log of reversible calls made along the way, and the
  owner inputs (all four resolved).

## Local dev

*(To be filled in during Phase 1 — Foundation. Placeholder per spec Appendix B: expect
`npm run build && npx wrangler pages dev`, since the Vite dev server alone does not serve
`/api`. Verify exact wrangler syntax against current Cloudflare docs before running.)*

## Migration commands

*(To be filled in during Phase 1 — Foundation. Placeholder per spec Appendix B: expect
`npx wrangler d1 migrations apply <db-name> --local` then `--remote`.)*

## Secret setup

*(To be filled in during Phase 1 — Foundation. `INITIAL_FAMILY_PASSWORD` and `SESSION_SECRET`
are set via `npx wrangler pages secret put`, never committed. See spec §3.1 and Appendix A.)*

## Backup and restore

*(To be filled in during Phase 5 — Launch readiness. Spec §12 requires a scheduled weekly D1
export to R2 or, at minimum, a documented manual `wrangler d1 export` procedure here.)*

## How to add a rule or a person

*(To be filled in during Phase 5 — Launch readiness, once Settings — Phase 3C — exists. Both are
runtime, no-deploy changes per spec §4.1; see spec §8.7 and §4.4 for the mechanics and the
backdating fairness rule.)*
