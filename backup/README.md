# Scheduled backup Worker (undeployed)

This directory holds a **standalone Cloudflare Worker** that runs a weekly D1 -> R2
export automatically. It is **not deployed** and is **not part of the Pages
project** in the repo root. Nothing here runs unless the owner explicitly follows
the steps below.

## Why this is a separate Worker

Cloudflare Pages Functions have no scheduled/cron handler as of 2026-08-24 —
verified against:

- <https://developers.cloudflare.com/pages/functions/bindings/> — lists every
  binding type Pages Functions support (KV, Durable Objects, R2, D1, Vectorize,
  Workers AI, service bindings, queue producers, Hyperdrive, Analytics Engine,
  vars, secrets); no scheduled/cron entry.
- <https://developers.cloudflare.com/workers/configuration/cron-triggers/> —
  Cron Triggers are configured via a `[triggers]` / `crons` key and a
  `scheduled()` handler; every example and the config surface is Workers-only,
  with no Pages equivalent documented.

So a scheduled export needs its own Worker with its own `wrangler.toml`, deployed
with `wrangler deploy` (the standalone-Worker command), not `wrangler pages
deploy`. That's what this directory is.

## What it does

`src/index.ts` runs on the cron schedule in `wrangler.toml` (currently Sundays,
09:00 UTC). It reads the production D1 database's `sqlite_master` table for
every table, index, trigger, and view, re-serializes every table's rows as
`INSERT` statements, and writes the result as one `.sql` text file to an R2
bucket, keyed by timestamp (`health-challenge-<ISO timestamp>.sql`). It then
deletes the oldest backups past a retention count (default 26 — about six
months of weekly runs).

**Output ordering, and why it's not alphabetical or "tidy":**

- The file opens with `PRAGMA defer_foreign_keys=TRUE;` — the same line
  wrangler's own `d1 export` output opens with (confirmed against a real
  export of this project's production database). Tables are read from
  `sqlite_master` in alphabetical order, which is not foreign-key dependency
  order (`log_entries` and `weight_entries` both reference `users` but sort
  before it alphabetically). The pragma defers FK constraint checking until
  the whole restore file has executed, so that ordering mismatch doesn't fail
  the restore. **Do not remove this line or move it after any table/insert
  statement** — that would silently reintroduce the FK-ordering failure.
- Every table's `CREATE TABLE` and all of its `INSERT`s are emitted before
  **any** index, trigger, or view statement. Building an index against an
  already-populated table is one bulk operation instead of maintaining it
  row-by-row during insert, and a trigger firing mid-restore against
  partially-loaded data would be actively wrong. **Do not "clean up" this file
  by interleaving indexes back next to their tables.**
- Named indexes are included deliberately — an earlier version of this file
  only queried `sqlite_master WHERE type = 'table'`, which silently dropped
  every index, including the two `UNIQUE` ones: `ux_users_color_active` and
  `ux_weight_baseline` (spec §5's single-baseline-weight-per-person
  constraint). A restore from that version would have produced a database
  that accepted two baseline weights for one person with no error — the kind
  of gap a backup should never introduce. `listSchemaObjects` in
  `src/index.ts` now also filters `sql IS NOT NULL` to skip SQLite's automatic
  indexes for inline `PRIMARY KEY`/`UNIQUE` constraints, which have no `sql`
  of their own and are recreated implicitly by the table's `CREATE TABLE`.

**Known gap — no BLOB handling.** `escapeSqlValue` stringifies non-null,
non-numeric values as quoted text; a D1 `BLOB` column value would arrive as an
ArrayBuffer and get mangled into an invalid string literal instead of a proper
SQL byte literal. Not a live bug today — every column across
`migrations/0001_schema.sql` and `0003_rate_limit.sql` is `TEXT`, `INTEGER`, or
`REAL` — but a future migration adding a `BLOB` column would corrupt this
Worker's backups silently, with no error at backup time. Whoever adds a BLOB
column needs to also add real byte-literal (`X'...'`) handling here.

This is a **secondary, unattended safety net**, not the primary backup path. The
primary, spec-required procedure is the manual `wrangler d1 export` documented in
the root [`README.md`](../README.md#backup-and-restore) — restore from that one.
This Worker's format is a hand-rolled equivalent (D1's runtime binding has no
built-in "export everything" call the way the `wrangler d1 export` CLI command
does — that command talks to a different internal API); it hasn't been exercised
against a real restore the way the manual export/import pair in the root README
has been.

## What deploying this requires (owner action, not automatic)

None of this has been run. Each step below provisions a real Cloudflare resource
or changes what's live — do them deliberately, not as a side effect of reading
this file.

1. **Create the R2 bucket** (new billable resource, almost certainly within the
   free tier for text-only weekly SQL dumps of a family-sized dataset, but still
   a new resource in the account):

   ```
   npx wrangler r2 bucket create hunsaker-family-backups
   ```

2. **Bind it.** Uncomment the `[[r2_buckets]]` block in `wrangler.toml` (it's
   commented out on purpose, so this Worker can't be deployed by accident before
   the bucket exists).

3. **Install this subdirectory's own dependencies** (kept separate from the root
   project's `package.json` on purpose):

   ```
   cd backup
   npm install
   ```

4. **Deploy the Worker itself** (a second, independent deployment — this does
   not touch the Pages project or redeploy the app):

   ```
   npx wrangler deploy
   ```

5. **Verify it locally before trusting the schedule**, either with:

   ```
   npx wrangler dev --test-scheduled
   ```

   then hit the local `/__scheduled` endpoint it prints, or wait for the first
   Sunday run and check the bucket:

   ```
   npx wrangler r2 object list hunsaker-family-backups
   ```

6. **Optional:** set `BACKUP_RETENTION_COUNT` in `[vars]` if 26 weekly backups
   (~6 months) isn't the right retention window.

## Data sensitivity

Every export — from this Worker or the manual command — contains the full
family health dataset, including the password hash and salt row in
`app_config`. Treat the R2 bucket the same way the manual export's local file is
treated in the root README: nothing public, no third-party sharing.
