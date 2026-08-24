# Phase 3C — Settings — Build Log

Resilience file per orchestrator instructions. Append a timestamped line after every discrete
step. Keep `## Remaining` accurate — rewrite it every time so it never lists work already done.

Branch: `phase-3c-settings`, created off `main` at `36a4969` (Phase 2 complete, merged, deployed).
Isolated worktree — no sibling-agent collisions expected, but sticking to file ownership from the
brief regardless (`src/screens/Settings.tsx` + `src/screens/settings/**`,
`functions/api/users/**`, `functions/api/rules/**`, `functions/api/config.ts`,
`functions/api/export.csv.ts`).

## Log

**2026-08-24 (start)** — Read CLAUDE.md, BUILD_STATUS.md, spec §3, §4, §5, §6, §7, §7.1, §8.7,
§9 (incl. "the export is load-bearing"), §12. Read HealthChallengeMockup.jsx's `IdentityEditor`
and `DeviceScreen` (lines 766-919) — the mockup has NO full Settings screen (People/Rules/
Challenge/Password/Export), only a "This device" panel. Built the rest from spec text + existing
primitives, per CLAUDE.md precedence rules. Read the full existing contract (`src/types.ts`,
`src/api.ts`), every `functions/_lib/*.ts`, existing `functions/api/**` routes (users, logs,
bootstrap, auth/login, middleware), `src/theme.ts`, `src/lib/dates.ts`, `src/lib/celebration.ts`,
`src/lib/identity.ts`, and the component/screen conventions (Card, Sheet, Segmented, PersonChip,
Banner, BottomNav, Today.tsx, Whoami.tsx, App.tsx, ThemeProvider). Confirmed `src/types.ts` and
`src/api.ts` already have every shape/function Settings needs (CreateUserRequest,
UpdateUserRequest, CreateRuleRequest, UpdateRuleRequest, UpdateConfigRequest with
`new_password`/`sign_out_all_devices`, EXPORT_CSV_PATH) — no contract changes needed.

Created branch `phase-3c-settings` off `main` @ `36a4969`.

## Scope decisions (recorded in Docs/DECISIONS.md too)

1. **Reorder = repeated PATCH, no new endpoint.** `UpdateUserRequest`/`UpdateRuleRequest` already
   carry `sort_order`; drag-reorder in the UI computes the new order client-side and PATCHes every
   row whose `sort_order` changed. No bulk-reorder endpoint invented.
2. **"Adding mid-challenge sets active_from" is a client default, not a server default.** Server
   behavior for POST /api/users is unchanged from the published contract: omitted `active_from` =
   null = since challenge start. The Settings "Add person" form computes `active_from` before
   submitting: if `serverToday > challenge_start`, send `active_from: serverToday`; otherwise omit
   it. This matches "no backfilled history, present from there forward" without a manual date
   picker or a confirm dialog (it's always forward-dated, never backdated, so §4.4's fairness
   warning does not apply to people).
3. **Rule backdate warning is pure date arithmetic, not a server query.** §4.4's confirm dialog
   ("names the date and states how many past days it opens for every participant") is
   `daysBetween(effective_from, serverToday)` computed client-side in `src/lib/dates.ts` — no
   entries-count query needed since the count is about calendar days opened, not existing rows.
4. **Challenge start/end date change warning uses descriptive text, not an exact affected-row
   count.** Computing an exact count would require a new aggregate query/endpoint outside the
   published contract. Reversible, simple choice per CLAUDE.md's ambiguity-resolution rule:
   confirm dialog says entries outside the new window are hidden from standings but never deleted,
   without a computed number.
5. **Color uniqueness checked proactively server-side** (SELECT before INSERT/UPDATE), not by
   catching the D1 unique-index constraint error — cleaner error message, no string-matching on
   driver errors.
6. **Archiving defaults `active_to` to serverToday when the client omits it; un-archiving (status
   back to 'active') clears `active_to` unless the client provides a new one.** Matches "archiving
   is reversible."

## 2026-08-24 — Backend + frontend built, first full verification pass green

Built all backend routes: `functions/api/users/index.ts` (added POST alongside existing GET),
`functions/api/users/[id]/index.ts` (new, PATCH — rename/recolor/re-emoji/reorder/toggle
participation/archive+unarchive), `functions/api/rules/index.ts` (new, GET+POST),
`functions/api/rules/[id].ts` (new, PATCH), `functions/api/config.ts` (new, GET+PATCH incl.
password change and session_version bump), `functions/api/export.csv.ts` (new, GET). Shared
helpers added: `functions/_lib/csv.ts` (RFC-4180-ish field/row encoding), `functions/_lib/ruleConfig.ts`
(type-shape validation for boolean/counter/threshold config), plus additive exports on the
existing `functions/_lib/users.ts` (`isColorTakenByActiveUser`, `nextUserSortOrder`) and
`functions/_lib/rules.ts` (`loadRuleById`, `isRuleKeyTaken`, `nextRuleSortOrder`).

Built the full frontend: `src/screens/Settings.tsx` (shell, holds local users/rules/config state)
plus `src/screens/settings/{shared,ReorderableList,IdentityEditor,PeopleSection,RulesSection,
ChallengeSection,DeviceSection,PasswordSection,ExportSection}.tsx`. Drag-reorder uses the Pointer
Events API (unifies mouse + touch) with an up/down-button fallback, no new dependency. Extracted
the two fairness-logic pure functions (adding-mid-challenge `active_from` default, rule-backdate
day count) into `src/lib/settingsHelpers.ts` specifically so they're unit-testable outside a React
component — CLAUDE.md/Appendix B calls out effective-date and scoring-window logic as code that
fails silently if wrong.

No changes needed to `src/types.ts` or `src/api.ts` — the published Phase 1b contract already had
every request/response shape and client function Settings needs.

Tests added: `src/lib/settingsHelpers.test.ts` (15 tests: computeDefaultActiveFrom,
defaultRuleEffectiveFrom, isRuleBackdated, daysRuleWouldOpen — including a true-DST-transition
case and the exact 180/181-day challenge-window numbers `src/lib/dates.test.ts` already
establishes) and `functions/_lib/ruleConfig.test.ts` (12 tests: boolean/counter/threshold config
shape validation). Found and fixed one bug during test-writing: my first `daysRuleWouldOpen`
implementation added +1 (treating the span as inclusive of "today"), which is wrong — today is
never a day backdating "opens" since it would be reachable regardless. Fixed to plain
`daysBetween(effectiveFrom, serverToday)`, verified against `dates.test.ts`'s own 180-day
challenge-window assertion.

**Verification, all green:**
- `npx tsc -b --force` (root): exit 0, no errors.
- `npx tsc --noEmit -p functions/tsconfig.json`: exit 0, no errors.
- `npx vitest run`: exit 0, **93/93 passed** (66 pre-existing + 15 settingsHelpers + 12
  ruleConfig) — zero regressions.
- `npm run build`: exit 0. Baseline (nothing wired into App.tsx yet, so Settings is fully
  tree-shaken out): main chunk 62.74 kB gzip, identical to the Phase 2 baseline in
  BUILD_STATUS.md. Measured the REAL delta once wired in via a temporary, fully-reverted probe
  (see below): **+7.54 kB gzip** for the whole Settings feature (all 6 sections, drag-reorder,
  identity editor, new lucide icons). Confetti stays its own 4.20 kB lazy chunk, unaffected.
  Projected total once merged: ~70.3 kB main + 3.59 kB CSS + 4.20 kB lazy confetti chunk ≈ 78 kB
  gzip, far under the §12 250 KB budget.
  - Probe method: temporarily edited `src/main.tsx` (not in this track's or any other track's
    ownership list) to conditionally render `<SettingsScreen>` behind a `?sizeprobe` query param,
    built, recorded the gzip number, then `git checkout -- src/main.tsx` to restore it exactly —
    confirmed via `git status --short` showing no diff on that file afterward, and a second build
    reproducing the original 62.74 kB baseline byte-for-byte (identical chunk hash). A bare `void
    SettingsScreen` reference was tried first and was fully tree-shaken away (0.01 kB delta) —
    Rollup can prove a discarded expression has no side effects, so it doesn't force inclusion;
    an actual conditional render does.

## 2026-08-24 — Local D1 end-to-end verification, all routes confirmed working

Applied all 3 migrations to a fresh local D1 (`npx wrangler d1 migrations apply health-challenge
--local`), seeded 3 test users (one archived) + 5 log entries (including a zero-value one) + 3
weight entries directly via `wrangler d1 execute --local`, built, and ran `wrangler pages dev
dist` on a free port (8788 was already in use by a sibling track's dev server on the same
machine — confirmed via `lsof` before picking 8799, no collision).

Exercised every new route with real cookies from a real login:
- `GET /api/export.csv` — full sample pasted into the final report below. Zero-value row (`sleep`,
  value=0, points=0) present as required; archived person's history intact; weights section
  correctly separated; `max_points_for_date` correctly derived per-date (6, then 9 after adding a
  counter rule worth 3 more — never hardcoded).
- `POST /api/users` — creates correctly; a duplicate active color returns 409 with a clear message.
- `PATCH /api/users/:id` archive/unarchive — archiving with no explicit `active_to` auto-set it to
  serverToday (`2026-08-24`, the real local clock date); unarchiving cleared it back to `null`.
- `POST /api/rules` — new rule got `effective_from` defaulted to tomorrow relative to serverToday
  with no explicit date; an explicit backdated `effective_from` was accepted (server never blocks
  backdating, only defaults it — the warn-and-confirm step lives client-side per §4.4); an invalid
  counter config (missing `max`) was rejected 400 by `isValidRuleConfig`.
- `PATCH /api/rules/:id` — enable/disable and `sort_order` both applied correctly.
- `GET`/`PATCH /api/config` — prize string update applied; invalid IANA timezone rejected 400;
  password change + `sign_out_all_devices` bumped `session_version` 1→2, the OLD session cookie
  immediately 401'd on the next request, and logging in with the NEW password worked and could
  still hit `/api/export.csv`.

No bugs found in this pass — the earlier `daysRuleWouldOpen` off-by-one was caught by the unit
tests before this stage. Cleaned up afterward: killed the dev server, deleted the temporary
`.dev.vars` (gitignored, was never committed), removed the seed SQL and curl scratch files from
`/tmp`. `.wrangler/` (local D1 state) and `dist/` are both gitignored, left as-is.

## Remaining

Phase 3C is functionally complete on this branch. Nothing left for this track to build — the
only remaining step was reporting back to the orchestrator, done. What's explicitly OUT of this
track's scope and therefore still open for whoever owns it later:

- `POST /api/admin/recompute` — not owned by 3C (not in the file-ownership list), still 404s.
  `src/api.ts`'s `recompute()` stub already existed before this pass and is unchanged.
- Wiring `<SettingsScreen>` into `src/App.tsx`'s `device` tab, and the `onSwitchPerson`/
  `onSignOut` callback implementations there — orchestrator's job per file ownership; exact prop
  contract and wiring instructions are in the final report.
- Enforcing `active_from`/`active_to`/`status` in the actual standings/stats SQL is 3B's
  `functions/api/stats/**` — this track only sets those fields correctly via `PATCH /api/users/:id`.
