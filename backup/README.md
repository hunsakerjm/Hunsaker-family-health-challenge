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
09:00 UTC). It reads the production D1 database's `sqlite_master` table to get
every table's `CREATE TABLE` statement, re-serializes every row as an `INSERT`,
and writes the result as one `.sql` text file to an R2 bucket, keyed by
timestamp (`health-challenge-<ISO timestamp>.sql`). It then deletes the oldest
backups past a retention count (default 26 — about six months of weekly runs).

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
