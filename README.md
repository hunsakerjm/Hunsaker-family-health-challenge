# Family Health Challenge PWA

A shared, installable web app for a family health challenge: daily habit logging with
checkboxes, points, standings, and an optional weight-loss track. Replaces a Google Sheet.
The single constraint that governs every design decision: **daily logging must take under
ten seconds on a phone.**

**Status:** live at `https://hunsaker-family.com`. Phases 0-4 are complete and deployed;
Phase 5 (launch readiness) is in progress. See [`Docs/BUILD_STATUS.md`](Docs/BUILD_STATUS.md)
for the current, authoritative status — phase table, infrastructure checklist, and open
decisions. This README does not duplicate it.

## Stack

Cloudflare Pages + Pages Functions + D1, React 18 + Vite + TypeScript, Tailwind CSS, Recharts
(lazy-loaded on the Standings route only), `canvas-confetti`, IndexedDB via `idb`. See
`Docs/health-challenge-pwa-requirements-v1.3.md` §2 for the full rationale.

## Where to look

- **`CLAUDE.md`** — standing instructions for any agent working in this repo. Read this first;
  it has the hard rules (auth model, date handling, scoring, bundle-size budget) that this
  README doesn't repeat.
- **`Docs/health-challenge-pwa-requirements-v1.3.md`** — the authoritative build spec. Start at
  §0 and §14 if you are orchestrating agents.
- **`Docs/HealthChallengeMockup.jsx`** — the approved visual mockup; wins on visual detail.
- **`Docs/BUILD_STATUS.md`** — the live status file: phase-by-phase progress, infrastructure
  checklist, open decisions, and the running log. Check this before assuming anything about
  what's built.
- **`Docs/DECISIONS.md`** — append-only log of reversible calls made along the way.

## Local dev

The Vite dev server alone does **not** serve `/api` — Pages Functions need the Wrangler
runtime. Build first, then run the whole thing (static assets + Functions + D1) through
Wrangler:

```
npm run build && npx wrangler pages dev dist
```

`npm run build` runs, in order: `tsc -b` (client code in `src/`), then
`tsc -p functions/tsconfig.json --noEmit` (server-side Pages Functions code in
`functions/`), then `vite build`. **The server-side typecheck is not optional** — the root
`tsconfig.json` only includes `src`, so before this was added, type errors in `functions/`
compiled clean locally and only surfaced in production. If you're checking types without a
full build, run both:

```
npx tsc --noEmit
npx tsc -p functions/tsconfig.json --noEmit
```

Check `$?` after each — don't pipe through `tail`, which exits 0 and will hide a real
failure.

## Migrations

Plain `.sql` files in `migrations/`, applied with `wrangler d1 migrations apply`. Local
first, then remote, once local is verified:

```
npx wrangler d1 migrations apply health-challenge --local
npx wrangler d1 migrations apply health-challenge --remote
```

The preview database takes `--env preview` in addition:

```
npx wrangler d1 migrations apply health-challenge-preview --env preview --local
npx wrangler d1 migrations apply health-challenge-preview --env preview --remote
```

`wrangler d1 migrations apply` prompts for confirmation and — per its own current
help text — automatically captures a snapshot backup before applying. That
automatic snapshot is not a substitute for the export procedure below: snapshots
are for rolling back a bad migration, not for disaster recovery, and they are not
downloadable the way an export file is.

Database names and IDs live in `wrangler.toml` — `health-challenge` (production) and
`health-challenge-preview`, never invented, always the real `database_id` returned by
`wrangler d1 create`.

## Deploy

Deploys are **direct-upload**, not a git integration — pushing to `main` does not by itself
redeploy anything:

```
npm run build
npx wrangler pages deploy dist --project-name hunsaker-family --branch main
```

## Secrets

Two secrets must exist in the **production** Pages environment before login works:

- `INITIAL_FAMILY_PASSWORD` — the shared family password, used once to bootstrap the
  PBKDF2 hash stored in `app_config` (see `Docs/DECISIONS.md`, "Password hash seeding").
- `SESSION_SECRET` — the HMAC key for session cookies. Generate with
  `openssl rand -base64 32`; don't reuse it anywhere else.

Set both with:

```
npx wrangler pages secret put INITIAL_FAMILY_PASSWORD --project-name hunsaker-family
npx wrangler pages secret put SESSION_SECRET --project-name hunsaker-family
```

Secrets bind at deploy time — after setting or changing one, redeploy for it to take
effect. **Never commit either value to this repo.** See spec §3.1 and Appendix A.

## Backup and restore

Six months of daily logs with no backup is a bad plan (spec §12). This section documents
the manual procedure spec §12 requires at minimum. It is the guaranteed path — everything
here has been verified against this repo's actual production database and the installed
`wrangler` (4.125.0) `--help` output, not assumed from memory.

### Back up (export)

```
npx wrangler d1 export health-challenge --remote --output=./backup-YYYY-MM-DD.sql
```

Notes, all confirmed by actually running this command against production (into a scratch
path outside the repo, then deleting the file — not committed anywhere):

- `--remote` is required to export the **production** database. Without it, `wrangler`
  exports the local dev copy instead, which is not what you want for a real backup.
- Exporting **briefly makes the database unavailable to serve queries** — wrangler warns
  about this and pauses for confirmation (`-y`/`--skip-confirmation` skips the prompt for
  scripting). Run backups during low-traffic hours, not while people are actively logging.
- The export is a complete, self-contained `.sql` file: every table's `CREATE TABLE`
  statement (schema), every row as an `INSERT`, all indexes, and — importantly — the
  `d1_migrations` tracking table with its rows already included. Restoring this file
  reproduces both the data and wrangler's own migration-applied bookkeeping in one step.
- Useful variants: `--table=<name>` for a single table, `--no-data` for schema-only,
  `--no-schema` for data-only (rarely what you want for a real backup — prefer the full
  export above).
- **The export file contains real family health data plus the password hash and salt
  row from `app_config`.** Do not commit it to this repo, attach it to chat, or put it
  anywhere public. Store it somewhere private the owner already controls (a local
  encrypted drive, a private cloud folder) — not this git repository, which may end up
  public or shared later.

### Restore

This is the half that's easy to skip and the half that actually matters. Restoring
**does not** go into the existing, already-populated `health-challenge` database — the
export's `CREATE TABLE users (...)` statements have no `IF NOT EXISTS`, so running them
against a database that already has those tables fails immediately on the first
`CREATE TABLE`. Restore always targets a **fresh, empty D1 database**:

```
# 1. Create a new, empty database to restore into.
npx wrangler d1 create health-challenge-restored

# 2. Copy the database_id it prints into a throwaway [[d1_databases]] block, or pass
#    it via --config if you don't want to touch wrangler.toml, then load the export:
npx wrangler d1 execute health-challenge-restored --remote --file=./backup-YYYY-MM-DD.sql
```

What this gets you: a new database, fully populated with the data as of export time,
including a correctly-populated `d1_migrations` table. Because that table's rows are part
of the export, `wrangler d1 migrations apply health-challenge-restored --remote` afterward
will correctly see all prior migrations as already applied and only run ones added since —
it will not try to re-run `0001_schema.sql` against tables that already exist.

To actually recover from data loss (not just verify a backup restores cleanly), the new
database then needs to replace the old binding: update `wrangler.toml`'s `database_id`
under `[[d1_databases]]` to the restored database's ID and redeploy
(`npx wrangler pages deploy dist --project-name hunsaker-family --branch main`). Treat
that step as deliberate and owner-approved — it repoints production traffic at a
different database.

### Cadence and storage

- **Weekly**, at minimum, matching spec §12's "scheduled weekly" language even though the
  scheduling is manual for now (see below).
- Keep exports somewhere private and durable — not this repository (a public/shared git
  history is not where family health data or a password hash belongs), and not a location
  that disappears if a laptop dies.

### Two manual, on-demand recovery paths

**Backups are manual and on demand — this is a deliberate owner decision, not an omission.**
Spec §12 explicitly permits this: scheduled weekly D1 export to R2 is listed as the preferred
option, but the spec's exact language is "scheduled weekly D1 export to R2, **or at minimum** a
documented manual `wrangler d1 export` procedure in the README." That minimum is met, and the
owner has elected to implement only these on-demand paths rather than adding scheduled Worker
infrastructure.

Two independent recovery approaches exist:

1. **Settings → Export** — a one-tap CSV download of all challenge data, session-protected.
   This is the everyday backup path and the one a non-technical person can use from their
   phone. The CSV is in long format (one row per person, date, rule, including zero-value days)
   and is sufficient to reconstruct the challenge without database access — spec §9 names this
   export load-bearing for exactly that reason.

2. **`wrangler d1 export`** — the full SQL dump, schema included, for actual disaster recovery.
   This procedure is documented above in this section (Back up / Restore) with full notes on
   what the export contains, how to restore it to a fresh database, and how to repoint the app
   at the restored copy. It requires terminal access but is the true recovery path for total
   data loss.

**Why automated backups were not added:** Cloudflare Pages Functions have no scheduled/cron
handler — Cron Triggers are documented only for standalone Workers. A scheduled export would
require a separate standalone Worker plus an R2 bucket, adding cloud infrastructure beyond the
Pages project. For a six-month family challenge, the on-demand paths above were judged
sufficient and simpler to operate.

## How to add a rule or a person

Both are runtime, no-deploy changes made from the in-app **Settings** screen (spec §8.7),
not a code or migration change:

- **People:** Settings → People manager. Add, rename, recolor, reorder, or archive. Archiving
  sets `active_to` and preserves history; an archived person drops out of standings from that
  date forward but keeps everything they already logged (spec §9's hard rule).
- **Rules:** Settings → Rules. Add a rule with an `effective_from` date; backdating opens a
  confirmation showing how many past days it affects (spec §4.4's fairness rule). Never
  hardcode a rule count or point total anywhere in code — `maxPointsForDate(date)`
  (`src/lib/dates.ts`) always derives the daily max from whatever rules are in effect on that
  date.

See spec §4.1 for the full list of what still requires a deploy (schema shape, auth model,
scoring semantics) versus what Settings covers at runtime.

## Releases and traceability

Every released change must be answerable later: *what version is this, what commit is it, and what
is actually running in production right now?* Three things make that work, and all three are
required — any one alone leaves a gap.

1. **Bump `package.json`'s `version` in the release commit.** `vite.config.ts` injects it as
   `__APP_VERSION__` at build time and Settings shows it at the bottom, so the number a family
   member reads off their phone is the number that was built. Do not hardcode a version anywhere
   in `src/`.
2. **Tag the commit and push the tag:**
   ```
   git tag -a v0.9.5 -m "v0.9.5 — short description"
   git push origin --tags
   ```
3. **Deploy with the commit attached**, so Cloudflare records which code a deployment contains:
   ```
   npx wrangler pages deploy dist --project-name hunsaker-family --branch main \
     --commit-hash "$(git rev-parse HEAD)" --commit-message "$(git log -1 --format=%s)"
   ```

### Answering "what's in production?"

```
npx wrangler pages deployment list --project-name hunsaker-family
```
The **Source** column is the commit SHA. Then `git show <sha>` for the change itself, or
`git log v0.9.4..v0.9.5` for everything between two releases.

### Known gap in the history

Versions before **v0.9.5** were recorded only in commit subject lines — `package.json` sat at
`0.1.0` from the first commit until v0.9.5, and no tags existed. The `v0.1.0`–`v0.9.4` tags were
reconstructed after the fact from those subject lines and are accurate to the commit, but the
`package.json` inside those older commits still reads `0.1.0`. Deployments made before v0.9.5 have
no commit SHA recorded against them in Cloudflare and cannot be traced back to code.

