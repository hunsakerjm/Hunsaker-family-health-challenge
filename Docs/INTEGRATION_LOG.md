# Integration Log — wiring Phase 3A (Calendar/Weight) and 3C (Settings) into App.tsx

## Progress

- **2026-08-24** START. Created this log first. Read CLAUDE.md, `src/App.tsx`, `src/screens/Today.tsx`,
  `src/screens/Calendar.tsx`, `src/screens/WeightDetail.tsx`, `src/screens/Settings.tsx`,
  `src/screens/settings/DeviceSection.tsx`, and spec §8.3/§8.4/§8.6/§8.7. Confirmed prop
  interfaces against actual source (not the phase reports' summaries) — see final report for any
  deltas. Confirmed `DeviceSection.handleSignOut` already calls `logout()` and
  `clearActiveUserId()` before invoking `onSignOut()`, so `App.tsx`'s `onSignOut` only needs to
  reset `authState` to `'unauthenticated'`. Confirmed spec §8.3: Today's weight row "Opens a
  numeric sheet; shows today's value if already logged" — i.e. the quick `WeightEntrySheet`, not
  the full `WeightDetailScreen`; `WeightDetailScreen` is reached only via Calendar's
  "Weight history" link (`onOpenWeightDetail`), matching spec §8.6 ("Reached from the Today weight
  row or a calendar day" — the Today weight row itself is the numeric sheet, per §8.3's own
  wording, and does not separately navigate to the full detail screen).
- Verified actual prop interfaces by reading source, not the phase reports' summaries:
  - `CalendarScreenProps`: `theme, config, serverToday, rules, users, ownUserId, initialUserId?,
    initialLogs, onOpenDay, onOpenWeightDetail` — matches the brief exactly (plus an optional
    `initialUserId` the brief didn't mention; left unset, defaults to `ownUserId` inside
    `CalendarScreen` itself, so no change needed here).
  - `SettingsScreenProps`: `theme, reducedMotion, config, serverToday, rules, users, ownUserId,
    onSwitchPerson, onSignOut, onDataChanged?` — matches the brief exactly.
  - `WeightDetailScreenProps`: `theme, config, serverToday, ownUser, onBack` — matches the brief
    exactly (`ownUser` is a full `User` object, not an id).
  - `DeviceSection.handleSignOut` (src/screens/settings/DeviceSection.tsx) calls `logout()` then
    `clearActiveUserId()` before invoking the `onSignOut` prop — confirmed App.tsx's `onSignOut`
    only needs `setAuthState('unauthenticated')`.
- Edited `src/screens/Today.tsx`:
  - Added optional `initialDate?: string` to `TodayScreenProps`; `date` state now seeds from
    `initialDate ?? serverToday`. No regression: `TodayScreen` is only ever mounted while
    `activeTab === 'today'` in App.tsx's conditional render, so it fully unmounts/remounts on every
    tab switch — a fresh `useState` initializer runs each time, so normal bottom-nav taps into
    Today (no `initialDate` passed) behave exactly as before.
  - Replaced the placeholder `WeightComingSoonSheet` with the real `WeightEntrySheet` (imported
    from `./WeightDetail`). Save now calls `putWeight(ownUserId, date, weightLb, ownUserId)`.
  - The prior-value lookup for "shows today's value if already logged" (spec §8.3) is a lazy
    `getWeights(ownUserId)` fetch that only starts when the weight row is tapped — never on mount,
    so it cannot regress the ten-second logging path or reintroduce the double-fetch bug Phase 2a
    fixed. The sheet opens immediately with a `DEFAULT_WEIGHT_LB` fallback and is keyed on the
    resolved value so it remounts (re-seeding its internal stepper) once the lookup resolves to a
    real stored entry, without touching `WeightEntrySheet` itself.
  - Weight row visibility gating (`viewedUser.in_weight_challenge && isOwn`) is untouched — only
    the `onTap` handler and the sheet it opens changed.
- Edited `src/App.tsx`:
  - Wired `calendar` -> `CalendarScreen`, `device` -> `SettingsScreen`, both replacing
    `ComingSoonScreen`. `standings` still renders `ComingSoonScreen` (Phase 3B, not touched).
  - Added `handleSignOut` (resets `authState`) and `handleDataChanged` (best-effort bootstrap
    refetch, same pattern as the existing post-claim refresh) to `App()`, threaded down through
    `AuthenticatedApp` to `SettingsScreen`.
  - Added one-shot `pendingTodayTarget` state (`{ date, userId }`) in `AuthenticatedApp`, set by a
    new `handleOpenDay` passed to `CalendarScreen.onOpenDay`, which also switches `activeTab` to
    `'today'`. Cleared via a `useEffect` the moment `activeTab` leaves `'today'`, so a later plain
    tap on the Today nav item lands on the normal "my page, today's date" view rather than
    replaying a stale deep link. `TodayScreen` receives `initialDate={pendingTodayTarget?.date}`
    and a `viewedUserId` that prefers `pendingTodayTarget.userId` over the existing `?u=` deep-link
    mechanism.
  - Added `showWeightDetail` boolean state, set by a new `handleOpenWeightDetail` passed to
    `CalendarScreen.onOpenWeightDetail`; when true, `WeightDetailScreen` renders in place of the
    normal tab content (own bottom nav stays visible), `onBack` clears it. `WeightDetailScreen` is
    reached only from Calendar's "Weight history" link — see the §8.3 reasoning above for why
    Today's own weight row does not also route here.
  - Extracted a `TabContent` component purely to keep `AuthenticatedApp`'s body under the ~30-line
    guideline; no new behavior lives there.
  - Simplified `ComingSoonScreen` (now takes only `theme`, hardcodes the "Standings" message) and
    removed the now-dead `calendar`/`device` entries from `TAB_LABELS` (folded away entirely, since
    the only remaining caller is `standings`). Updated the stale "only Today is wired up in Phase
    2a" comment.
- Verification, all green:
  - `npx vitest run` — **116/116 passed**. Exit 0. (Baseline before this session was already
    116 from the 3A/3C merges, not the 93 the brief expected from an older snapshot — no
    regression either way.)
  - `npx tsc --noEmit` — exit 0.
  - `npx tsc --noEmit -p functions/tsconfig.json` — exit 0 (untouched by this track; ran anyway
    per the verify checklist).
  - `npm run build` — exit 0. Main bundle **75.13 kB gzip** (244.06 kB raw), up from a measured
    **62.74 kB gzip** baseline (`git stash` + rebuild before restoring) — **+12.39 kB gzip** for
    wiring in Calendar, WeightDetail, and Settings (plus its five sub-sections). Well inside the
    §12 250KB budget. `grep -c "recharts\|Recharts" dist/assets/index-*.js` → 0 matches (exit 1) —
    confirmed no chart library anywhere in the build; there isn't even a separate chart chunk yet
    since Standings (3B) hasn't landed.

## Remaining

Nothing outstanding in this track. Everything above is committed on `main` in this worktree.
Out of scope, left for 3B: wiring `standings` tab and anything under `functions/api/stats/**`.
