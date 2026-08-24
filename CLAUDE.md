# CLAUDE.md — Family Health Challenge PWA

## What this is

A shared, installable web app where ~8 family members log daily health habits with checkboxes,
accumulate points, and see standings, replacing a Google Sheet. **The one governing constraint:
daily logging must take under ten seconds on a phone.** Everything else — dashboards, charts,
celebrations — is secondary. When a choice makes the dashboard prettier but logging slower,
logging wins. No exceptions, no "just this once."

## Authority

`Docs/health-challenge-pwa-requirements-v1.3.md` is the spec and the authority. Read its §0 before
doing anything else — it explains how to resolve ambiguity and how to work in parallel.
`Docs/HealthChallengeMockup.jsx` is the approved visual mockup.

Precedence when the two disagree:
- On **behavior**, the spec wins.
- On **visual detail**, the mockup wins.
- Reversible ambiguity (neither source answers it, and either answer is cheap to undo): pick the
  simpler option, write it down in `Docs/DECISIONS.md`, keep moving. Do not stall on it.
- Irreversible ambiguity (schema shape, auth decision): stop and ask. Do not guess.

Known doc inconsistency: the mockup's header comment says "companion to v1.2" and describes a
"12-color palette," but its actual `PALETTE` object already has all 16 colors matching spec
v1.3 §7. Trust the code and the spec, not the mockup's stale comment.

## Scope discipline — read this before adding anything

The spec is deliberately smaller than what this app could do. **Cut on purpose, do not re-add:**
bonus scoring, streak awards, prize automation, reminders, per-user auth. If a feature would feel
like a "natural extension," that is a reason to leave it out, not build it. See spec §0 and §4.2
for the full list of what still requires a deploy (and is therefore out of scope for a runtime
config change).

## Hard rules

- **Never hardcode `6`, `181`, or `1086`.** The daily max is always derived from rules in effect
  on a given date via `maxPointsForDate(date)` (spec §4.3). Six rules today; N rules tomorrow.
- **No Cloudflare Access, Zero Trust, or any Cloudflare identity product for auth.** Auth is
  application-level: one shared password + a soft per-device identity claim (spec §2, §3).
- **Never modify or delete existing DNS records.** The owner's domain (`hunsaker-family.com`, apex,
  no subdomain) is brand-new with no email configured. Adding the Pages custom domain creates one
  proxied CNAME and touches nothing else. The general rule stands: do not modify or delete records
  you did not create (spec §2).
- **Seed data never auto-inserts into production after the first migration.** `0002_seed.sql`
  creates rules and config, never users (spec §5).
- **Every server-side aggregate must respect `active_from`/`active_to`/`status`.** Archived
  people keep history but drop out of standings from `active_to` forward. Getting this wrong is
  invisible until someone is archived (spec §9).
- **Recharts is dynamically imported by the Standings route only.** It must never load on the
  Today screen (spec §12, §8.5, Appendix B).
- **All date math goes through `src/lib/dates.ts`, in the challenge timezone.** Never
  `new Date('2026-09-01')` (parses as UTC and shifts backward in the Americas). "Today" comes
  from the server (`serverToday` in `/api/bootstrap`), never `new Date()` on the client (spec §6).
  DST is the known trap: `America/Los_Angeles` shifts on **2026-11-01** (first Sunday in November,
  fall back) and **2027-03-14** (second Sunday in March, spring forward) — test both. Note the spec
  and earlier drafts name `2027-03-08`; that is a **Monday** and not a transition. The spec is wrong
  here; do not copy that date.
- **Points are snapshotted at write time** into `log_entries.points`, server-computed, never
  client-supplied. Changing a rule later does not silently rewrite history (spec §4.3).
- **PBKDF2 iterations capped at 100,000 by Workers runtime** — do not raise toward spec §3.1's
  600,000; it throws `NotSupportedError` at runtime. This is the platform ceiling, non-negotiable.

## The parallelism contract (spec §14)

Before any Phase 3 track opens, Phase 0 and Phase 1 publish three files that every later track
codes against and never against each other:

- `src/types.ts` — every API request/response shape
- `src/api.ts` — a typed client, one function per endpoint in spec §9
- `src/theme.ts` — design tokens, palette, and `mix`/`tint`/`desat`

If a track needs a shape change, it edits `types.ts` first and says so in its branch/PR. Do not
hand-roll a competing shape locally.

## Branching

One branch per phase or track: `phase-0-design`, `phase-1-foundation`, `phase-2-logging`,
`phase-3a-calendar-weight`, `phase-3b-standings`, `phase-3c-settings`, `phase-4-offline`,
`phase-5-launch`. Merge to `main` only when that phase's demo (spec §14) passes.

## Repo layout (spec Appendix B)

```
/
├─ migrations/          0001_schema.sql, 0002_seed.sql — plain .sql, applied via wrangler d1 migrations apply
├─ functions/api/       Pages Functions, one file/group per §9 route group
├─ src/
│  ├─ theme.ts          tokens, palette, mix/tint/desat        (Phase 0)
│  ├─ types.ts          API request/response shapes            (Phase 1)
│  ├─ api.ts            typed client, one fn per endpoint      (Phase 1)
│  ├─ lib/dates.ts      serverToday, date math, maxPointsForDate
│  ├─ components/       shared primitives
│  └─ screens/          one per §8 screen
├─ public/              manifest, icons, self-hosted fonts
├─ wrangler.toml
└─ README.md
```

None of `package.json`, `src/`, `functions/`, `migrations/`, or `public/` exist yet — Phase 0 and
Phase 1 own creating them.

## Commands

- **Local dev:** `npm run build && npx wrangler pages dev` — the Vite dev server alone will NOT
  serve `/api`; Pages Functions need the Wrangler runtime.
- **Migrations:** `npx wrangler d1 migrations apply <db-name> --local` then `--remote`.
- **Verify wrangler syntax against current Cloudflare docs before running any wrangler command.**
  The CLI and its Pages/D1 integration change often; this repo's notes were written from a
  snapshot (spec Appendix B).

## What earns automated tests

Only three things, because they fail silently (spec Appendix B):

1. `src/lib/dates.ts` — month boundaries, challenge start/end, both DST transitions.
2. Server-side scoring — points computed for all three rule types, including a rule outside its
   effective window.
3. `maxPointsForDate` — correct denominators before, during, and after a rule's effective window.

Everything else is verified by walking spec §15 on a **physical iPhone**, not a desktop browser
at 390px. Safe areas, the emoji keyboard, haptics, and the install flow only behave correctly on
the real device.

## How this project delegates work

Every agent orchestrating this repo must follow these rules:

- **Delegate to the lowest capable model.** Haiku for mechanical or boilerplate edits; Sonnet when the work needs design sense or real judgment. Reserve the orchestrating model for planning, deconfliction, and review — not direct file I/O.
- **Hand subagents extracted spec slices, not whole documents.** Spec §14 names the exact sections each phase needs. Extract those to a scratch file and pass that. Making thirteen agents each read the full 1,267-line spec plus the 1,151-line mockup was the single largest avoidable token cost of the initial build.
- **Run parallel wherever the work allows**, but the orchestrator owns the end result — deconfliction, integration, and review are never delegated.
- **Parallel agents MUST use isolated git worktrees.** Agents sharing one working directory had their `git checkout`s collide during Phases 0/1. Use `isolation: "worktree"`.
- **The orchestrator owns shared files.** `src/App.tsx` and `package.json` are never edited by track agents; each reports the route path and import line it needs, and the orchestrator wires them at merge. This turned what would have been a three-way conflict into one trivial one.
- **Give every agent explicit file ownership** — the paths it owns and the paths it must not touch.
- **Agents commit to their branch at every milestone**, not just at the end, using `wip:` prefixes when incomplete. Session limits are real; uncommitted work is at risk.
- **Keep `## Remaining` sections accurate** — rewrite them on each append so they never list work already finished. Stale Remaining sections actively mislead a cold restart.
- **Verify with exit codes.** Check `$?` directly. Never `cmd | tail && echo ok` — `tail` exits 0 and masks a failing command. This pattern reported a clean typecheck while `tsc` was failing.
- **When a shared interface is needed by parallel agents, pin it in both briefs.** The `types.ts` contract and the `playCelebration` signature both worked this way; an agent needing to change one must report it loudly, since the other has already written against it.

## Definition of done

A phase is done when its spec §14 demo passes and every spec §15 checklist item touching that
phase is checked on a physical iPhone.
