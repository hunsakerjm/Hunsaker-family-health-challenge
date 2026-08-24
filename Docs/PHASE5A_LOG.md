# Phase 5A log — Month recap + ambient motion

Track 5A of Phase 5 (Launch readiness). Branch `phase-5a-recap-motion`. Spec §11.2's "Month
recap" and "Ambient motion" blocks. Governing constraint carried over from every other phase:
neither feature may slow the Today screen or its first paint; Recharts stays isolated to the
Standings route.

## What shipped

**Feature 1 — Month recap (`src/lib/recap.ts`, `src/screens/MonthRecap.tsx`)**

- `src/lib/recap.ts`: pure, unit-tested eligibility and formatting logic.
  - `getRecapEligibility` — one function collapses all three §11.2 rules (suppressed in the
    challenge's first month, fires once per new calendar month, still fires the month after the
    challenge ends) into two month-key comparisons plus a `lastRecapShown` dedup check. See the
    function's own doc comment for why each rule falls out of the comparisons for free.
  - `sumPointsForMonth` / `hasAnyEntries` — "logged nothing" is read as zero log-entry rows, not
    "points summed to zero" (Decision 4 of 4, `Docs/DECISIONS.md`).
  - `buildRecapDisplay` — produces either the hero-number variant or the plain zero-entry
    statement (`No entries logged in {month}`), never both.
  - `shouldFireRecapBurst` — hard-suppresses the burst under `subtle` or on a zero-entry month;
    only `full` + real entries fires.
- `src/screens/MonthRecap.tsx`: fetches its own previous-month data via the existing `getLogs`
  (no new API surface), decides eligibility on mount, renders nothing until resolved, and records
  `lastRecapShown` (exact key name, spec-pinned, unnamespaced — Decision 3 of 4) only once
  dismissed. The burst reuses `playCelebration` unmodified as a ratio-1.0 call (Decision 1 of 4)
  — **no changes to `celebration.ts` were needed for this feature.**
  - Panel z-index (45) sits above the celebration canvas (40) and sheets (40) so the hero number
    stays legible over an in-flight burst; the burst's own upward launch from the same origin
    point reads as originating from behind the number.
  - Full-screen, tap-anywhere-to-dismiss, following the existing Sheet/Card visual language
    (`theme.paper`/`theme.surface` radial wash, `TYPE_SCALE.recapHero`/`kicker`/`bodyCopy`/
    `caption`, person's own palette color for the hero number).

**Feature 2 — Ambient motion (`src/lib/useAmbientMotion.ts`)**

- One hook, `useAmbientMotion(resetKey?)`, returning `{ enabled, revealed }`. `enabled` mirrors
  `getCelebrationIntensity() !== 'off'` (so `prefers-reduced-motion: reduce`'s forced-off initial
  value is inherited for free — no motion-preference logic duplicated here). `revealed` starts
  `false` and flips to `true` one animation frame after mount (or after `resetKey` changes),
  driving a plain CSS opacity/transform/clip-path transition at each call site. No `@keyframes`,
  no new dependency, no particles.
- Wired into three places, per spec:
  - `src/screens/Calendar.tsx` — `DayCell` stagger-fades in on month load, keyed on `monthKey`.
  - `src/screens/Standings.tsx` — `LeaderboardRow` bars grow from 0% width (staggered per row),
    keyed on the leaderboard response object; the ribbon wipes in left-to-right as one `clip-path`
    reveal wrapping `Ribbon`'s output (Decision 2 of 4 — `Ribbon.tsx` isn't an owned file, so the
    wipe wraps its render rather than staggering its internal rows).

### What deleting `src/lib/useAmbientMotion.ts` requires

Deleting the hook file alone breaks the build (three now-dangling imports). To fully remove
ambient motion, mechanically:

1. Delete `src/lib/useAmbientMotion.ts`.
2. `src/screens/Calendar.tsx`: remove the `useAmbientMotion` import, the
   `const ambientMotion = useAmbientMotion(monthKey)` line, the three props passed into `<DayCell>`
   (`staggerIndex`, `ambientEnabled`, `ambientRevealed`), the three matching optional props (and
   the two `AMBIENT_*` constants) on `DayCell`'s own signature, and replace the cell's
   `opacity`/`transform`/`transition` style lines with their pre-existing static forms
   (`opacity: isFuture ? 0.35 : 1`, no `transform`, no `transition`).
3. `src/screens/Standings.tsx`: remove the `useAmbientMotion` import; in `LeaderboardSection`,
   remove the `barMotion` line and the three props passed into `<LeaderboardRow>`; in
   `LeaderboardRow`, remove the three optional props and the two `AMBIENT_BAR_*` constants, and
   replace `width`/`transition` with `width: \`${barPercent}%\`` / `transition: 'width 600ms
   ease'` (the exact pre-existing values — both call sites already carry a comment saying so). In
   `RibbonSection`, remove the `ribbonMotion` line and unwrap `<Ribbon .../>` from its wrapping
   `div`.

Every one of those edits is a deletion of lines this track added, never a rewrite of surrounding
logic — no other behavior in either screen depends on ambient motion's presence.

## Files touched

- `src/lib/recap.ts` (new), `src/lib/recap.test.ts` (new)
- `src/lib/useAmbientMotion.ts` (new)
- `src/screens/MonthRecap.tsx` (new)
- `src/screens/Calendar.tsx` (edited — ambient motion only)
- `src/screens/Standings.tsx` (edited — ambient motion only)
- `Docs/DECISIONS.md` (appended, 4 decisions)
- `celebration.ts` — **not modified.** Both features fully reuse its existing exports
  (`getCelebrationIntensity`, `playCelebration`).

## Verify

- `npm run build` — exit 0. Confirmed in the chunk list: `HabitRadar-*.js` (Recharts) and
  `confetti.module-*.js` remain their own lazy chunks; neither grew into the main `index-*.js`
  bundle Today loads first.
- `npm test` — exit 0, 176 tests passed across 10 files (14 new in `recap.test.ts`, covering all
  five eligibility/display rules named in the brief).

## App.tsx wiring the orchestrator needs (not done by this track — App.tsx is off-limits)

```tsx
import { MonthRecap } from './screens/MonthRecap'
```

Render unconditionally once bootstrap data is available (it renders `null` until its own
eligibility check + fetch resolve, so it's safe to always mount):

```tsx
<MonthRecap
  theme={theme}
  config={config}
  serverToday={serverToday}
  user={users.find((u) => u.id === ownUserId)!}
/>
```

Placement: anywhere in the tree that's always mounted regardless of active tab (e.g. alongside
other always-mounted overlays, a sibling of the tab content) — it's a fixed, full-screen overlay
with its own z-index (45), so it doesn't need to live inside any particular screen's JSX.

## Remaining

Nothing outstanding for this track. Both features are implemented, wired into their owned call
sites, tested, and build/typecheck clean. The only work left is the orchestrator's `App.tsx`
wiring above, which this track does not own.
