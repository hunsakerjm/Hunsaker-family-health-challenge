# Phase 3B — Standings — Build Log

Resilience file per orchestrator brief: append a timestamped line after every discrete step.
`## Remaining` is rewritten every time so it never lists work already finished.

## Remaining

Nothing outstanding for this track. Phase 3B is feature-complete and verified (tests, both
typechecks, build, Recharts-split proof all green — see the final log entry below). Handoff to
the orchestrator: wire `<StandingsScreen>` into `src/App.tsx`'s `standings` tab (exact import line
and prop list in the final report) — that is the ONE remaining step, and it belongs to the
orchestrator per file ownership, not this track.

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

**2026-08-24 05:30** — Invoked `frontend-design` and `dataviz` skills (both required before any
chart/frontend code, per brief). Since the design system here is already fully specified (spec
§11.1 tokens in `theme.ts`, mockup as visual source of truth), `frontend-design`'s "pick a bold new
aesthetic" guidance doesn't apply — I match the existing system exactly instead of inventing one.
From `dataviz`: person colors are a fixed per-user data contract (spec §7's 16-color palette,
already AA-checked with an `on` color per swatch), not a categorical palette I get to choose, so I
did not run the palette validator against it — it's out of scope to redesign. Applied `dataviz`'s
mark specs (thin strokes, sparing direct labels, legend-as-toggle-chips already matches
`PersonChip`, tabular numerals per spec §11.1 which explicitly overrides the skill's generic
"proportional for big numbers" guidance — project tokens win).

**2026-08-24 05:45** — Built the backend: `functions/_lib/statsMath.ts` (pure date-range/window/
tie-ranking math) and `functions/_lib/stats.ts` (D1 aggregation — SUM/COUNT/GROUP BY in SQL,
window intersection in JS, same split as the existing `scoring.ts`/`logs.ts` pair). Four routes:
`functions/api/stats/{leaderboard,rules,ribbon,weight}.ts`. Added `RibbonDayCell.eligible: boolean`
to `src/types.ts` (additive contract change, documented inline and here — no other track reads
`RibbonResponse` yet). Weight privacy made structural: `computeWeightPercentLost` is the only
function in the codebase that reads `weight_entries.weight_lb`, and its return type is `number |
null` — no object shape exists in this path that could carry a pound value to a caller by
accident. `npx tsc --noEmit` and `-p functions/tsconfig.json` both exit 0. Committed
(`wip: stats backend`).

**2026-08-24 05:55** — Added `functions/_lib/statsMath.test.ts` (window/tie logic — the two
categories Appendix B and this track's brief call out) and `functions/_lib/stats.test.ts`
(period/month parsing). 36 new tests, 102/102 total passing, both typechecks clean. Committed
(`test: statsMath and stats period-parsing unit tests`). DB-touching aggregation itself
(leaderboard/rules/ribbon/weight SQL) is NOT unit-tested with a mock D1 — matches this repo's
existing convention (no other route in the codebase has DB-mock tests either; CLAUDE.md scopes
automated tests to pure logic, everything else to the spec §15 physical-device walkthrough).

**2026-08-24 06:10** — Built `src/components/charts/Ribbon.tsx` (plain divs, no recharts — per-day
segment count derived from that day's own `max_points_for_date`, never hardcoded; three visual
states: not-offered-that-day / ineligible / eligible-unlogged / logged, tap-to-select detail panel
below the strip) and `src/components/charts/HabitRadar.tsx` (the only file under `src/` that
imports `recharts`; default export so `React.lazy` can resolve it). Built `src/screens/Standings.tsx`
(leaderboard with T-prefix ties and footnote, ribbon section pinned to a single selected month
regardless of the month/all-time tab, radar behind `Suspense`+`React.lazy` with own-person-on-by-
default toggles and 0.32/0.20/0.10 fill-opacity thinning, consistency widget, weight tab, month
segmented control whose first label IS the month name and re-taps into a month-picker `Sheet`).
`npx tsc --noEmit` clean after one fix (Recharts `Tooltip` formatter's value/name types needed
`String()` coercion, not a bare `number`/`string` annotation).

**2026-08-24 06:20** — Verified the Recharts split concretely, since App.tsx (orchestrator-owned)
doesn't reference `Standings.tsx` yet so the real build wouldn't otherwise exercise the lazy path.
Backed up `src/App.tsx`, temporarily wired `<StandingsScreen>` into the `standings` tab locally,
ran `npm run build`, captured the chunk list, then restored the original `src/App.tsx` from the
backup and confirmed `git diff --stat src/App.tsx` is empty (the file was never actually touched
in this branch's history). Evidence:

```
dist/assets/confetti.module-BYDB1iN2.js   10.57 kB │ gzip:  4.20 kB
dist/assets/index-CazeTn52.js            208.35 kB │ gzip: 66.52 kB
dist/assets/HabitRadar-p6MVmcgt.js       332.01 kB │ gzip: 96.23 kB
```
`grep -c recharts dist/assets/index-*.js` → 0. `grep -c recharts dist/assets/HabitRadar-*.js` → 14.
Main bundle with Standings wired in: 66.52 kB gzip (vs 62.74 kB unwired, i.e. Phase 2's baseline —
Standings.tsx's own non-chart code costs ~3.8 kB gzip). Both numbers are far under the §12 250KB
budget. Rebuilt again afterward with the real (unwired) `App.tsx` to confirm the committed state:
62.74 kB gzip main bundle, byte-for-byte the Phase 2 number — proof this track adds nothing to the
Today critical path until the orchestrator wires the route in.

**2026-08-24 06:25** — Fixed one 44px-minimum-tap-target gap found on review: the month-picker
sheet's row used padding that landed a couple px short; switched to an explicit `minHeight: 44`
(spec §11.1 quality floor). Final full verification: `npx tsc --noEmit` exit 0, `npx tsc --noEmit
-p functions/tsconfig.json` exit 0, `npx vitest run` 102/102 passing exit 0, `npm run build` exit 0.
Phase 3B is done pending the orchestrator's App.tsx wiring (route/import line in the final report).
