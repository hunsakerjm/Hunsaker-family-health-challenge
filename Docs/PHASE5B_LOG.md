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

## Remaining

Nothing outstanding for this track. Backup/restore documentation and the
optional scheduled-Worker code are both complete; the scheduled path is
deliberately left for the owner to deploy (or not) per `backup/README.md`.
