# Phase 1 Foundation — Build Log

Owner: automated build agent. This log is appended after every discrete step so work can resume
cold if the session stops. See `## Remaining` at the bottom for current state.

## Log

**2026-08-23T23:45:45Z** — Started. Read `CLAUDE.md` and `Docs/BUILD_STATUS.md`. Created this log
file as first action per instructions. Next: read spec sections §2, §3, §3.1, §3.2, §4.3, §5, §6,
§9, §12, Appendix B, then invoke the `wrangler` skill before any wrangler command.

**2026-08-23T23:50:00Z** — Read spec sections §0–§9, §12, §14 Phase 1, §15, Appendix A/B in full
(read the whole document; truncation forced a second read call). Read `Docs/DECISIONS.md` for
format and prior context (all four owner inputs already resolved: apex hostname
`hunsaker-family.com`, password handed to owner out-of-band, repo `hunsakerjm/Hunsaker-family-
health-challenge`, start date 2026-09-01). Confirmed local toolchain: Node v24.14.0, npm 11.9.0,
wrangler 4.125.0. Invoked `wrangler` skill. Cross-checked skill guidance against
`npx wrangler pages --help`, `pages secret put --help`, `pages deploy --help`,
`pages project create --help`, `d1 create --help`, `d1 migrations apply --help` on the installed
4.125.0 binary since the skill's Pages section is thin. Key findings: `wrangler pages secret put
<key> --project-name <name>`; `wrangler pages deploy <dir> --project-name <name>`; `wrangler pages
project create <name> --production-branch <branch> --compatibility-date <date>`; D1
`migrations apply` takes `--local` / `--remote` flags, no separate `--preview` DB name needed (use
DB name directly, `--preview` flag is for previewing D1 databases bound in preview deployments —
will re-verify when applying to the preview DB). Repo confirmed on `main`, no commits yet, remote
`origin` already set to the owner's GitHub repo. Created branch `phase-1-foundation` off `main`.

**2026-08-23T23:52:00Z** — Starting step 2: Vite + React 18 + TS + Tailwind scaffold, minimal,
matching spec Appendix B layout. Will not install recharts/canvas-confetti/idb (later phases).

**2026-08-23T23:58:00Z** — Wrote full scaffold: package.json (React 18.3.1, Vite 8.2.2, TS 7.0.2,
Tailwind 4.3.3 via @tailwindcss/postcss, wrangler 4.125.0 — all current stable per live npm
registry checks, not the spec's named versions), tsconfig.json/tsconfig.node.json,
vite.config.ts, postcss.config.js, index.html, src/index.css, src/main.tsx, src/App.tsx (session
probe via /api/bootstrap on mount — HttpOnly cookie can't be read client-side, so this is how the
SPA decides login vs splash), src/screens/Login.tsx, src/screens/Splash.tsx (deliberately bare,
"coming soon" only), public/robots.txt.

Wrote Functions layer: functions/_lib/{env,crypto,session,config,passwordBootstrap,rateLimit,
dates}.ts, functions/_middleware.ts (host lock + baseline security headers), functions/api/
_middleware.ts (session gate for all /api/** except login/health), functions/api/health.ts,
functions/api/auth/login.ts, functions/api/auth/logout.ts, functions/api/bootstrap.ts (satisfies
spec §14 Phase 1 demo: config/serverToday/rules/users/logs in one call). functions/tsconfig.json
added for editor type-checking against @cloudflare/workers-types.

Wrote migrations/0001_schema.sql (§5 schema, copied verbatim from the spec read earlier — no
abbreviation), migrations/0002_seed.sql (six launch rules with generated UUIDs + all app_config
seed keys except family_password_hash/salt, which are intentionally absent — see design decision
below — no users), migrations/0003_rate_limit.sql (login_attempts table; kept out of 0001 so that
file stays a verbatim §5 copy).

**Design decision resolved and logged in Docs/DECISIONS.md:** password hash is bootstrapped
on-first-use in functions/_lib/passwordBootstrap.ts (reads INITIAL_FAMILY_PASSWORD, derives
PBKDF2, writes via INSERT OR IGNORE in a D1 batch, re-reads to converge concurrent racers) rather
than seeded by the static migration, since migrations can't read Cloudflare secrets. Full
rationale in Docs/DECISIONS.md.

**Also decided (logged inline as a code comment in functions/_middleware.ts, not a full
DECISIONS.md entry since it's non-blocking and easily revisited):** CSP header deferred for now —
X-Content-Type-Options, Referrer-Policy, and X-Robots-Tag are set on every response, but
`Content-Security-Policy: default-src 'self'` is not, because Phase 0's design system may need
inline `style` attributes for per-user CSS custom properties (`--u-color` etc., spec §11.1) and a
strict CSP without `style-src 'self' 'unsafe-inline'` would silently break that later. Flagging
this in the final report as something the owner/orchestrator should decide explicitly.

**Scope note:** src/types.ts and src/api.ts (the "parallelism contract" files CLAUDE.md says
Phase 1 publishes before Phase 2 opens) were NOT created in this pass — the orchestrator's
explicit step list for this task scoped the frontend to login + splash only and did not list
them as deliverables. This is a real gap against full Phase 1 completion, called out in the final
report; whoever picks up Phase 1's remainder (or Phase 2) needs to publish those two files first.

**2026-08-24T00:05:00Z** — `npm install` succeeded (91 packages, 0 vulnerabilities). Added missing
`src/vite-env.d.ts` (`/// <reference types="vite/client" />`) after `npm run build` failed on the
CSS side-effect import — TS7's stricter side-effect-import checking needs it even though older TS
sometimes didn't. Rebuilt clean: `dist/index.html`, `dist/assets/index-*.css` (11.5kB),
`dist/assets/index-*.js` (142.8kB, gzip 46.6kB) — well under the 250KB gzip budget from spec §12
(this is expected; charts/confetti/idb are later phases). Typechecked `functions/` against
`@cloudflare/workers-types` via `npx tsc --noEmit -p functions/tsconfig.json` — clean, no errors.

Created both D1 databases via `npx wrangler d1 create`:
- `health-challenge` (production): `database_id = 3f848810-e935-4796-aefe-1d3dce54ab49`, region WNAM
- `health-challenge-preview`: `database_id = 22e69832-9957-4499-b4db-1f1b16b92c77`, region WNAM

Verified both `database_id` values against the actual CLI output before writing them — not
invented. Wrote `wrangler.toml`: `name = "hunsaker-family"` (Pages project name, so the default
`.pages.dev` URL will be `hunsaker-family.pages.dev`), `pages_build_output_dir = "dist"`,
`compatibility_date = "2026-08-23"`, `[vars] CANONICAL_HOST`, `[[d1_databases]]` binding `DB` for
production, `[env.preview]` override binding `DB` to the preview database. Confirmed
`pages_build_output_dir` and `env.<name>` are valid top-level `RawConfig` fields by inspecting
`node_modules/wrangler/config-schema.json` directly rather than trusting memory.

**2026-08-24T00:10:00Z** — Applied all three migrations to local production DB
(`wrangler d1 migrations apply health-challenge --local`, non-interactive `yes |` for the confirm
prompt): 0001/0002/0003 all ✅. Verified seed data by direct query: 9 app_config rows (all keys
except family_password_hash/salt, as designed), 6 rules in correct sort_order with correct
labels/points. Applied to remote production
(`wrangler d1 migrations apply health-challenge --remote`): all ✅. For the preview DB, plain
`wrangler d1 migrations apply health-challenge-preview` failed with "Couldn't find a D1 DB ... in
your wrangler.toml" because that DB is only declared under `[env.preview]` — needed
`--env preview` for wrangler to find it. Re-ran with `--env preview --local` then
`--env preview --remote`: all ✅ both times. Verified remote production `rules` table read count
= 6 via a COUNT(*) query. All four migration targets (prod local/remote, preview local/remote)
are now on schema 0001+0002+0003.

**2026-08-24T00:15:00Z** — Updated `Docs/BUILD_STATUS.md` infrastructure checklist and Phase 1
row in the phase board to reflect real state.

Created the Pages project: `npx wrangler pages project create hunsaker-family
--production-branch main --compatibility-date 2026-08-23` → succeeded, future URL
`https://hunsaker-family.pages.dev`. Deployed: `npx wrangler pages deploy dist --project-name
hunsaker-family --branch main` → succeeded, per-deployment URL
`https://bb6ef857.hunsaker-family.pages.dev`, environment = Production (confirmed via
`wrangler pages deployment list`, so it's bound to the production D1 database as intended).

**Host lock verification:**
- `https://hunsaker-family.pages.dev/` → **404**, empty body, no headers beyond Cloudflare's own
  (correct — bare 404, no advertising of the real hostname)
- `https://hunsaker-family.pages.dev/api/health` → **404** (host lock runs before every route,
  including /api/**, confirmed)
- `https://bb6ef857.hunsaker-family.pages.dev/` (the per-deployment hash URL) → curl got a TLS
  handshake failure (`error:1404B410`), even with `-k`. This looks like edge-certificate
  provisioning lag for a brand-new project's first per-deployment hash subdomain, not an
  application bug — the middleware code applies identically to both hostnames and the primary
  alias is verified working. Flagging for the owner to re-check this specific hash URL once cert
  provisioning finishes (typically within minutes); the main `.pages.dev` alias is the one that
  matters for the "verify host lock on pages.dev" ask and it's confirmed 404.

Confirmed via `npx wrangler pages secret list --project-name hunsaker-family` that no secrets are
set yet — `INITIAL_FAMILY_PASSWORD` and `SESSION_SECRET` remain correctly pending for the
orchestrator. Until they're set, `/api/auth/login` fails safe with a generic 500 (no detail
leaked), matching the "fail safe if absent" requirement.

**Preview deployment access control (step 10):** researched via Cloudflare docs (WebFetch). It
exists as a dashboard-only toggle: **Workers & Pages → [project] → Settings → General → Enable
access policy**. It uses Cloudflare Access and protects *only* the per-deployment preview
subdomains (e.g. `<hash>.hunsaker-family.pages.dev`), not the main `.pages.dev` alias or a future
custom domain. Not exposed via wrangler CLI or found in `wrangler pages project create/list`
output, so it was not changed — reporting only, per instructions. Note this would be Cloudflare
Access on *preview* deployments only, which does not conflict with the hard rule "No Cloudflare
Access ... for auth" on the *production* site (spec §2/§3) since our own host-lock middleware
already 404s every non-canonical hostname regardless, including previews.

## Session complete for this pass. Everything below is what remains.

## Remaining
1. **Owner/orchestrator:** set `INITIAL_FAMILY_PASSWORD` and `SESSION_SECRET` via
   `npx wrangler pages secret put <name> --project-name hunsaker-family`. Until then, login always
   returns 500.
2. **Owner:** add the apex custom domain `hunsaker-family.com` via Cloudflare dashboard → Pages →
   Custom domains (not done here — OAuth token lacks `zone (write)`, and instructions said not to
   attempt it). After that, re-verify the host lock 404s correctly hold on `.pages.dev` while the
   real domain serves the app, and do a full phone test of the login → splash flow.
3. **Optional, recommended before Phase 2 opens:** publish `src/types.ts` and `src/api.ts` — the
   CLAUDE.md "parallelism contract" files. This slice deliberately did not create them because the
   orchestrator's step list for this task scoped the frontend to login + splash only. Whoever
   continues Phase 1 or starts Phase 2 needs these first.
4. **Optional, recommended:** decide on the CSP header deferral (see `functions/_middleware.ts`
   comment and log entry above) once Phase 0's design system settles whether dynamic per-user
   colors need inline `style` attributes, then add
   `Content-Security-Policy: default-src 'self'` (with `style-src 'self' 'unsafe-inline'` if
   needed) to `withBaselineSecurityHeaders`.
5. **Optional:** re-verify `https://bb6ef857.hunsaker-family.pages.dev/` once its TLS cert has had
   time to provision — expected to 404 identically to the main alias.
6. **Not done, out of scope for this pass:** full `src/lib/dates.ts` (month boundaries,
   `maxPointsForDate`, DST tests) and automated tests for it/scoring — CLAUDE.md's "what earns
   automated tests" section. Only a minimal server-side `computeServerTodayInTimezone` exists
   (`functions/_lib/dates.ts`), sufficient for `/api/bootstrap`'s `serverToday` but not the full
   date-math module later phases need.
7. **Not done:** `functions/api/logs/**`, `weights/**`, `stats/**`, `users/**`, `rules/**`,
   `sync/batch`, `export.csv`, `admin/recompute` — all later-phase work per spec §14, correctly out
   of scope here.

**2026-08-24T00:25:00Z** — Cleaned up a scaffold rough edge: `tsc -b` was emitting
`vite.config.js`/`vite.config.d.ts` into the repo root (a composite-project side effect of
`tsconfig.node.json` having no `outDir`). Fixed by pointing that project's `outDir` and
`tsBuildInfoFile` into `node_modules/.tsbuild-node` (already covered by the `node_modules/`
gitignore entry, so no new gitignore rules needed). Rebuilt clean — confirmed via `git status`
that only real source files are untracked, no build artifacts. Diagnosed the per-deployment hash
URL TLS failure with `openssl s_client`: `SSL alert number 40` (handshake_failure) with "no peer
certificate available" — this is Cloudflare not yet having issued/attached a certificate for that
specific hash subdomain, a first-deploy propagation delay, not an application bug. The main
`hunsaker-family.pages.dev` alias has a working cert and consistently returns 404, which is the
URL that matters for the host-lock verification this task asked for.

**2026-08-24T14:30:00Z** — Production bug fix: PBKDF2 iterations reduced from 600,000 to 100,000.
Cloudflare Workers enforces a hard platform cap at 100k iterations; runtime logs showed
`NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)`.
Reduced `PBKDF2_ITERATIONS` constant in `functions/_lib/crypto.ts` to `100_000` with explanatory
comment. Updated `CLAUDE.md` hard rules with the platform ceiling and why it cannot be raised back.
Appended decision entry to `Docs/DECISIONS.md` (2026-08-23 PBKDF2 entry) documenting the runtime
error, Workers' hard cap, rejected alternatives (6×100k chaining trades timeout risk; scrypt/argon2
unavailable), compensating controls (10 attempts/15 min rate limit + shared-password threat model),
and owner approval. Typechecked and built successfully post-change.

## What's live right now
- D1 production (`health-challenge`, id `3f848810-e935-4796-aefe-1d3dce54ab49`) and preview
  (`health-challenge-preview`, id `22e69832-9957-4499-b4db-1f1b16b92c77`), both migrated to
  0001+0002+0003, both local and remote.
- Pages project `hunsaker-family`, deployed, production environment bound to the production D1.
- Host lock middleware confirmed rejecting the `.pages.dev` hostname with a bare 404.
- Password gate + splash frontend built and deployed; will start working end-to-end as soon as the
  two secrets are set.
- Create wrangler.toml (pages_build_output_dir, DB binding + preview env override, CANONICAL_HOST var)
- Create Pages project via wrangler, deploy
- Verify host lock returns 404 on the .pages.dev URL
- Check preview deployment access control setting in Pages project settings, report findings
- Do NOT set INITIAL_FAMILY_PASSWORD / SESSION_SECRET secrets — orchestrator's job, pending
- Update Docs/BUILD_STATUS.md checkboxes for infrastructure steps completed
- Publish src/types.ts + src/api.ts contract stubs — OUT OF SCOPE for this pass per explicit
  instructions; flagged as a gap for whoever continues Phase 1
