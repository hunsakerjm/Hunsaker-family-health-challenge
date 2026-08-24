# Phase 3B — Standings — Build Log

Resilience file per orchestrator brief: append a timestamped line after every discrete step.
`## Remaining` is rewritten every time so it never lists work already finished.

## Remaining

- Everything. Just started.

## Log

**2026-08-24 05:20** — Branch `phase-3b-standings` created off `main`. Read CLAUDE.md, BUILD_STATUS.md,
spec §0/§1/§4.3/§4.4/§5/§6/§7/§8.5/§8.6/§9/§11.1/§12/§13, mockup's Standings/Ribbon/Radar sections,
`src/types.ts`, `src/api.ts`, `src/theme.ts`, `src/lib/dates.ts`, existing `functions/_lib/*`
(`http.ts`, `users.ts`, `rules.ts`, `scoring.ts`, `logs.ts`, `appConfig.ts`, `dateFormat.ts`, `env.ts`),
existing routes (`api/logs/[userId]/[date].ts`, `api/users/index.ts`, `api/_middleware.ts`), and
`src/components/{Card,SectionTitle,Segmented,Sheet,PersonChip,ThemeProvider,person}.tsx`, and
`src/App.tsx` (read-only — do not touch). Key findings:

- `src/types.ts` already fully specifies the stats contract (`LeaderboardEntry`, `RuleStatsEntry`,
  `RibbonResponse`, `WeightStatsEntry` — no `weight_lb` field anywhere, by design) and `src/api.ts`
  already has `getLeaderboard`/`getRuleStats`/`getRibbon`/`getWeightStats` client functions. I build
  the server routes and the screen against these unchanged.
- `RuleStatsEntry.eligible_days` doc comment: "days that rule was effective and the user was
  active" — this is the resolved contract (Phase 1b), takes precedence over the mockup's simpler
  `days.length` (days actually logged) denominator, since denominator definition is a *behavior*
  decision (CLAUDE.md precedence: spec/contract wins over mockup on behavior).
  Recorded as a mockup/spec conflict in the final report and in `Docs/DECISIONS.md`.
- Mockup's Standings screen has NO dedicated "Consistency" widget (days logged / avg pts per
  logged day) despite spec §8.5 item 4 requiring one — mockup only computes `days`/`avg` internally
  and never renders them. Spec wins on behavior (a whole required widget is not a visual nuance) —
  building it in the mockup's visual language (Card/SectionTitle/mono numerals).
- App.tsx (orchestrator-owned, read-only here) renders screens via `activeTab === 'standings'`
  tab state, not a URL router — "route" = conditional render, not a path. Today/Whoami are eagerly
  imported. Recharts isolation will be achieved by Standings.tsx never importing `recharts` at
  module scope — only a `charts/HabitRadar.tsx` (React.lazy-loaded) does, so Standings.tsx itself
  can be statically imported by App.tsx like Today.tsx is, with recharts still code-split out.
- `functions/_lib/` pattern to follow: one loader file per table (`users.ts`, `rules.ts`), pure
  parsing + `db.prepare().bind().all()/.first()`, no framework. New `functions/_lib/stats.ts` (or
  split per concern) will follow the same shape. Points are already snapshotted per
  `(user,date,rule)` in `log_entries.points` at write time, so leaderboard/consistency totals are a
  plain `SUM(points)`/`COUNT(DISTINCT log_date)` SQL aggregate — no need to recompute from rules.
  Radar `eligible_days` is a closed-form interval-overlap calculation (period ∩ challenge window ∩
  rule effective window ∩ user active window ∩ up-to-serverToday), done in JS via `src/lib/dates.ts`
  helpers per user×rule (≤ ~8×8 = 64 combos) — not a per-day SQL scan.
- Auth is centralized in `functions/api/_middleware.ts` — no per-route auth code needed.
- Six launch rules are all `boolean` type; `short_label` (Water/Sleep/Diet/Stretch/Exercise 1/
  Exercise 2) is the radar spoke label.

Next: invoke `frontend-design` and `dataviz` skills, then design the stats endpoints and start
building `functions/_lib/stats.ts` + `functions/api/stats/**`.
