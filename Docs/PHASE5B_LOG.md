# Phase 5B Log — Backups, restore procedure, README

Track 5B of Phase 5 (Launch readiness). Owned files: `README.md`,
`Docs/PHASE5B_LOG.md`, `Docs/DECISIONS.md` (append-only), and `backup/` (new,
undeployed). Branch: `phase-5b-backup-readme`.

## 2026-08-24 — Cloudflare research: Pages cron support

Read only spec §12 (scratch slice), `README.md`, `wrangler.toml`,
`migrations/0001_schema.sql`, and the infrastructure checklist section of
`Docs/BUILD_STATUS.md` — not the full spec, per the brief.

Verified against current Cloudflare docs (WebFetch, 2026-08-24) rather than
trusting prior training or the brief's summary:

- <https://developers.cloudflare.com/pages/functions/bindings/> — full list of
  bindings Pages Functions support (KV, Durable Objects, R2, D1, Vectorize,
  Workers AI, service bindings, queue producers, Hyperdrive, Analytics Engine,
  vars, secrets). No scheduled/cron entry anywhere on the page.
- <https://developers.cloudflare.com/workers/configuration/cron-triggers/> —
  Cron Triggers are configured via `[triggers]`/`crons` in a Worker's
  `wrangler.toml` plus a `scheduled()` handler. Every example is a standalone
  Worker; no Pages-specific guidance or opt-in exists.
- A Cloudflare community thread title (`Schedule a Cloudflare pages
  function`) corroborates this is a known, asked-about gap; the thread itself
  403'd on fetch, so it wasn't used as a source — the two docs pages above are
  the actual evidence.
- **Conclusion: Pages Functions cannot run a scheduled handler today.** A
  scheduled D1 -> R2 export requires a separate, standalone Worker with its own
  `wrangler.toml`, deployed with `wrangler deploy` (not `wrangler pages
  deploy`), which in turn requires a new R2 bucket. Per the brief, did **not**
  create, deploy, or provision any of that — wrote it in `backup/`, left
  undeployed, documented exactly what the owner must run and approve in
  `backup/README.md`.

## 2026-08-24 — D1 export/restore commands verified against real production DB

Confirmed `wrangler d1 export` / `wrangler d1 execute` flags two ways:

1. The installed `wrangler` (4.125.0, same version already deployed to this
   project) `--help` output for both subcommands — ground truth for the exact
   CLI in use here, not just docs that could be stale.
2. Ran an actual scratch export of the real production database:
   `npx wrangler d1 export health-challenge --remote --output=<scratch path
   outside the repo>`. Inspected the resulting `.sql` file to confirm real
   behavior (not assumed):
   - `CREATE TABLE` statements have no `IF NOT EXISTS` except `d1_migrations`
     — meaning **restore cannot target the existing, populated database**; it
     will fail on the first `CREATE TABLE`. Restore must go into a fresh, empty
     database (`wrangler d1 create <new-name>` then `wrangler d1 execute
     <new-name> --remote --file=...`).
   - `d1_migrations` and its rows **are** included in the export, so a restored
     database correctly reports prior migrations as already applied.
   - The export command itself warns the database is briefly unavailable
     during the operation — worth calling out for choosing a backup window.
   - The file contained real sensitive data: the production password hash and
     salt (`app_config.family_password_hash`/`family_password_salt`), one
     real login IP, and the one real user's name. **Deleted the scratch file
     immediately after inspecting it** (`rm -fv`, confirmed gone via `grep`
     returning exit 1) and did not reproduce any of that content in README,
     this log, or DECISIONS.md.
   - No import/delete/migration command was ever run — only the read-only
     `export` (which reads, not writes, the source DB) and `whoami`.

Wrote the exact, verified commands into `README.md`'s "Backup and restore"
section, including the fresh-database restore procedure and what happens to
`d1_migrations`.

## 2026-08-24 — README and backup/ written

- `README.md`: replaced all Phase-5 placeholders (local dev, migrations,
  secrets, backup and restore, how to add a rule/person) with real, verified
  content. Updated the stale "pre-Phase-0" status line to point at
  `Docs/BUILD_STATUS.md` as the live source of truth instead of duplicating
  it. Recorded both facts from the brief: `npm run build` now typechecks
  `functions/` too, and deploys are direct-upload
  (`wrangler pages deploy dist --project-name hunsaker-family --branch main`),
  not a git integration.
- `backup/`: standalone Worker (`wrangler.toml`, `src/index.ts`,
  `package.json`, `tsconfig.json`, `README.md`). Weekly cron (Sunday 09:00
  UTC), D1 -> R2 export built from `sqlite_master` + row dumps (D1's runtime
  binding has no built-in full-export call — that's CLI-only), retention
  pruning, R2 binding commented out until the owner creates the bucket. Not
  deployed; not referenced by any deployed code; adds no dependency to the
  root `package.json`.
- `Docs/DECISIONS.md`: appended one entry (matching the existing format)
  recording the manual-vs-scheduled fork and why the scheduled Worker was
  written but not deployed.

## Verification

- `npm run build` — exit 0.
- `npm test` — exit 0 (162 tests, 9 files, all passing — unaffected by this
  track's docs-only changes to the root project).
- Confirmed `backup/tsconfig.json` and `backup/package.json` are not picked up
  by the root build (`tsc -b` only references `tsconfig.node.json`; Vite only
  bundles from `src/` via `index.html`).

## Files touched

Only files this track owns: `README.md`, `Docs/DECISIONS.md` (appended),
`Docs/PHASE5B_LOG.md` (new), `backup/**` (new). No changes to `wrangler.toml`,
`migrations/**`, `src/**`, `functions/**`, `package.json`, `index.html`,
`public/**`, or `Docs/BUILD_STATUS.md`.

## 2026-08-24 — Coordinator review: three defects fixed in `backup/src/index.ts`

Coordinator review (secret scan clean; manual export/restore procedure and the
Pages-cron finding both confirmed correct) found three defects in the
undeployed scheduled Worker, two of which would have produced a backup that
looked successful but restored wrong. All three fixed in place; same
file-ownership boundary as before (`backup/**` only).

1. **Missing indexes, including both `UNIQUE` ones.** `listUserTables`
   queried only `WHERE type = 'table'`, so the dump never captured
   `ux_users_color_active`, `ux_weight_baseline` (spec §5's single-baseline-
   weight-per-person constraint), or the plain lookup indexes. A restore from
   that version would silently accept two baseline weights per person — no
   error, just wrong data going forward. Renamed the function to
   `listSchemaObjects`, widened the query to
   `type IN ('table','index','trigger','view')`, added `AND sql IS NOT NULL`
   to drop SQLite's auto-indexes for inline `PRIMARY KEY`/`UNIQUE` constraints
   (those have no `sql` of their own), and reordered `exportDatabaseToSql` to
   emit every table's `CREATE` + `INSERT`s first, then all index/trigger/view
   statements last.
2. **Alphabetical table order breaks foreign keys on restore.** `log_entries`
   and `weight_entries` both reference `users` but sort before it
   alphabetically, so replaying the file would insert child rows before their
   parent table has any. Fixed by emitting `PRAGMA defer_foreign_keys=TRUE;`
   as the first line of the output — confirmed this is exactly what
   wrangler's own `d1 export` emits, from the real production export run
   during the first pass of this track. Documented in both the code comment
   and `backup/README.md` why the ordering looks the way it does, so it isn't
   "tidied" back to alphabetical or interleaved with the index statements
   later.
3. **`scheduled()` swallowed failures.** It called
   `ctx.waitUntil(runBackup(env))` without awaiting, so a thrown error inside
   `runBackup` would never surface — the scheduled invocation would report
   success while producing no backup, discoverable only much later. Changed
   to `await runBackup(env)` directly; `waitUntil` is for outliving an
   already-sent response, which doesn't apply to a scheduled handler.

Also documented, per the coordinator's note, a known non-bug gap: `escapeSqlValue`
has no BLOB handling (a `BLOB` column would arrive as an `ArrayBuffer` and get
mangled into an invalid string literal). Not live today — every column in
`migrations/0001_schema.sql` and `0003_rate_limit.sql` is `TEXT`/`INTEGER`/`REAL`
— but flagged in both the code and `backup/README.md` so a future BLOB column
doesn't corrupt backups silently.

None of this touches the manual `wrangler d1 export` procedure in the root
`README.md`, which remains the primary, spec-required, already-verified path.

### Verification

```
npm run build
BUILD_EXIT:0
npm test
TEST_EXIT:0
```

(162 tests, 9 files, unaffected — this track's changes are confined to
`backup/**`, which is not part of the root `tsc -b` project references or the
Vite build.)

## Remaining

Nothing outstanding for this track. Backup/restore documentation is complete
and verified against the real production database and the installed
`wrangler` CLI. The optional scheduled-Worker code in `backup/` has been
corrected for the three defects above (missing indexes, FK ordering,
swallowed scheduled-handler failures) and documents its one remaining known
gap (no BLOB handling, not currently live). It is still deliberately
undeployed — no R2 bucket created, no `wrangler deploy` run — left for the
owner to provision and deploy per `backup/README.md` if they want the
scheduled path on top of the manual one.
