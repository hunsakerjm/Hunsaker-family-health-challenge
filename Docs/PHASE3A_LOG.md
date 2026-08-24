# Phase 3A Log — Calendar and Weight

## Progress

- **2026-08-24** START. Created this log first. Read CLAUDE.md, BUILD_STATUS.md, spec §8.4, §8.6,
  §5, §6, §9, §11.1, §12, §3.4, and `Docs/HealthChallengeMockup.jsx` (Pips, CalendarScreen,
  WeightSheet, dayPoints/maxPointsForDate helpers). Read the published contract in full:
  `src/types.ts`, `src/api.ts` (both already cover every weight endpoint I need — no edits
  required, zero risk of contract collision with 3B/3C), `src/lib/dates.ts`, `src/theme.ts`
  (already has `calendarCellTintStep`), and every existing component (`Banner`, `Card`, `Sheet`,
  `Pips` — already implements the null-vs-zero pip distinction exactly per spec, `PersonChip`,
  `SectionTitle`, `person.ts`). Read `src/screens/Today.tsx` in full for the own-vs-other pattern,
  optimistic-write pattern, and month-cache pattern to mirror. Read every `functions/_lib/*.ts`
  helper (`env`, `http`, `dateFormat`, `appConfig`, `audit`, `users`, `rules`, `logs`) and the two
  existing route examples (`functions/api/logs/[userId]/[date].ts`,
  `functions/api/users/[id]/claim.ts`) to match conventions exactly. Confirmed migration 0001
  already has `weight_entries` + `ux_weight_baseline` exactly per spec §5 — no new migration
  needed. Confirmed `functions/api/_middleware.ts` already session-gates all of `/api/**`, so no
  auth code needed in my routes.
- Created branch `phase-3a-calendar-weight` off `origin/main` (fast-forward from the completed
  Phase 2 merge, `36a4969`).
- Decision (reversible, recorded here per CLAUDE.md §0): `bootstrap.rules` is filtered to rules
  effective *today* only (same as Today.tsx already documents as a known limitation). A fully
  correct Calendar month grid would need rules effective at any point across the displayed month.
  `functions/api/rules/**` is out of my ownership (3C's) and doesn't exist yet in this worktree, so
  there's no safe endpoint to fetch the full rule set from. Chose to use `bootstrap.rules` as-is,
  matching Today.tsx's existing precedent and documented limitation, rather than editing the shared
  `functions/api/bootstrap.ts` (not forbidden to me, but a shared file 3B/3C might also assume the
  shape of — touching it risks a three-way merge conflict for a partial fix). Flagged in the final
  report for the orchestrator to decide whether Phase 3C's rules endpoint should later let Calendar
  fetch the unfiltered set.
- Decision: weight PUT and DELETE both go through the same `isDateEditable`/`getEditableDateRange`
  window as `PUT /api/logs/:userId/:date` (spec §9's window-validation rule is written as a general
  server rule, not logs-specific, and weight rows are keyed by the same `log_date`). Baseline
  designation (`POST .../baseline`) does NOT re-check the window — it only flags an already-stored
  entry, doesn't create data, so it's allowed on any existing entry regardless of the currently
  editable range (matches spec §8.6's late-joiner baseline-correction use case).
- Decision: `GET /api/weights/:userId` returns the real series for whatever `userId` is requested —
  there is no per-device server-side auth to restrict it further (spec §2/§3: one shared password,
  no per-user auth), and spec §9's privacy rule is specifically that pounds for one user can never
  appear in a response about a different user or in any aggregate — never that the single-user
  route itself must reject a non-owner caller. §8.6 "own page only" is enforced by the CLIENT never
  routing to `WeightDetail` except from the viewer's own page, mirroring how `Today.tsx` already
  treats "everyone can read everything" (§3.4) for logs. The structural guarantee spec asks for is:
  no code path anywhere returns more than one user's weight_lb values in a single response, and no
  stats/aggregate endpoint (owned by 3B) can even SELECT weight_lb across users because this file
  never exposes a multi-user loader to import.
- Built `functions/_lib/weights.ts`: row parsing + `loadWeightSeriesForUser`, `loadWeightEntry`,
  `upsertWeightEntry`, `deleteWeightEntry`, `setBaselineEntry`. Every function requires a `userId`
  parameter bound into the SQL — no multi-user loader exists in this file, by design (see decision
  above and the file's own header comment).
- Built `functions/api/weights/[userId]/index.ts` (GET full series),
  `functions/api/weights/[userId]/[date].ts` (PUT upsert, DELETE), and
  `functions/api/weights/[userId]/[date]/baseline.ts` (POST). All follow the exact
  jsonResponse/jsonError/recordAuditEntry conventions from the logs routes.
- Built `src/lib/weight.ts`: pure `resolveBaselineEntry`, `findMostRecentEntry`,
  `computePercentLost`, `sortEntriesByDateAscending` — all date comparisons go through
  `compareDates` from `src/lib/dates.ts`, never raw string comparison.
- Built `src/screens/WeightDetail.tsx`: own-page-only screen (sparkline, percent-lost header,
  dated entry list, edit/delete/set-baseline per entry) plus an exported `WeightEntrySheet`
  reusable bottom-sheet component for logging/correcting one date's weight (used by both this
  screen and `Calendar.tsx`'s weight-glyph tap; documented in the final report as what `Today.tsx`
  should call to replace its "coming soon" placeholder).
- Built `src/screens/Calendar.tsx`: month grid using the existing `Pips` component (untouched —
  its null-vs-zero contract already matches spec exactly), `calendarCellTintStep` from theme.ts,
  person switcher sheet, month nav (buttons + swipe), weight glyph (own calendar only, opens
  `WeightEntrySheet`), header stats (month total / days logged / best day).
- Added tests: `src/lib/weight.test.ts` (baseline resolution, percent-lost math, empty/zero-guard
  cases), plus new `getWeekdayIndex`/`stepMonthKey` tests appended to the existing
  `src/lib/dates.test.ts` (additive only — no existing test edited).
- Added `getWeekdayIndex` and `stepMonthKey` to shared `src/lib/dates.ts` (purely additive exports,
  no existing export touched) — the calendar month grid needs a leading-blank-cell count and a
  month-stepper, and neither existed yet. `stepMonthKey` is written generically enough that 3B's
  Standings month picker (§8.5) can reuse it instead of re-deriving the same logic.
- Fixed a real bug found during review: the calendar's weight-glyph quick-edit sheet originally
  defaulted to a neutral placeholder value even when editing an EXISTING entry (a stubbed
  `findExistingWeightForDate` that never looked anything up). Replaced the `Set<string>`
  weight-dates cache with a `Map<string, number>` (date -> pounds) so the quick-edit sheet now
  prefills the real stored value when correcting a date, and a documented neutral default only
  when logging a brand new entry.
- Bounded Calendar's month navigation to `[challenge_start, challenge_end]` via `config` (was
  initially unused, which is also what caught this in `noUnusedLocals`) — swiping/tapping past the
  challenge window would only ever show empty months.
- Style pass: wrapped every JSX/style line over ~100 chars that was easy to shorten without hurting
  readability; left a handful of comment lines at 101-111 chars where wrapping would have hurt
  more than it helped (matches existing tolerance already present in Phase 2's files, e.g.
  `functions/api/logs/[userId]/[date].ts`).
- Verification, all green:
  - `npx vitest run` — **89/89 passed** (66 pre-existing + 4 `getWeekdayIndex` + 6 `stepMonthKey` +
    13 `src/lib/weight.test.ts`). Exit 0.
  - `npx tsc --noEmit` — exit 0.
  - `npx tsc --noEmit -p functions/tsconfig.json` — exit 0.
  - `npm run build` — exit 0. Main bundle unchanged at **62.74 kB gzip** (Calendar.tsx and
    WeightDetail.tsx are not yet imported by `App.tsx` per the file-ownership boundary, so they
    aren't in this build). Measured the real impact with a throwaway local edit to `App.tsx`
    (wired both screens into the tab switch with real props, built, then `git checkout -- src/
    App.tsx` to fully revert — confirmed via `git status` that App.tsx has zero diff from the
    committed state afterward): **67.58 kB gzip** with both screens eagerly included, i.e. **+4.84
    kB gzip** for both new screens combined. Well inside the §12 250KB budget (all-chunks total
    would be ~75.4 kB gzip: 67.58 main + 3.58 CSS + 4.20 confetti).
- Final commit made; see the end-of-session report to the orchestrator for exact route/import
  lines, the `Today.tsx` wiring contract, and the privacy/decision summary.

## Remaining

Nothing outstanding in this track's ownership. Everything above is committed on
`phase-3a-calendar-weight`. What's left is orchestrator work, out of this agent's file ownership:
wiring `<CalendarScreen>` and `<WeightDetailScreen>` into `src/App.tsx`'s tab switch, adding an
`initialDate`-style prop to `Today.tsx` if "tapping a calendar day opens that day's log" should
land on that exact date (currently `Today.tsx` always opens on `serverToday`), and replacing
`Today.tsx`'s `WeightComingSoonSheet` with the exported `WeightEntrySheet` from
`src/screens/WeightDetail.tsx`. Full detail in the final report.
