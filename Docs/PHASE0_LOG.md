# Phase 0 Log — Design System

## Log

- 2026-08-24 00:23 UTC — Started. Created PHASE0_LOG.md. Read CLAUDE.md, BUILD_STATUS.md. Spec is 1267 lines, mockup is 1151 lines.
- 2026-08-24 00:24 UTC — Finished reading spec §3.4, §7, §7.1, §8.3, §11, §11.1, §14 Phase 0, and full mockup (1151 lines).
- 2026-08-24 00:24 UTC — Branched phase-0-design from main (main was up to date with origin). Reviewed existing scaffold: React 18 + Vite 8 + Tailwind 4 (CSS-only config, no tailwind.config.js yet) + TS strict. No router installed. src/App.tsx does session-probe then renders Login/Splash. Login.tsx and Splash.tsx untouched per instructions.
- 2026-08-24 00:26 UTC — Fonts self-hosted: copied latin woff2 subsets from @fontsource packages (used as source only, then uninstalled) into public/fonts/ (156K total): bricolage-grotesque-variable.woff2 (wght 200-800), public-sans-{400,500,600,700}.woff2, ibm-plex-mono-{400,500,600}.woff2. Added lucide-react ^1.33.0 as a real runtime dependency (icons used by Banner/BottomNav primitives, matches mockup). package.json diff is a clean single-line insertion, alphabetically ordered, no reordering of existing entries.
- 2026-08-24 00:29 UTC — Wrote src/theme.ts (surfaces, 16-color PALETTE, mix/tint/desat, named tint-step constants, 5-step ramp builder, type scale, radius, spacing, motion). Wrote src/components/ThemeProvider.tsx (System/Light/Dark, live matchMedia for dark AND reduced-motion, localStorage persisted). Wrote primitives: Card.tsx, Segmented.tsx, SectionTitle.tsx, Pips.tsx, Banner.tsx, PersonChip.tsx, BottomNav.tsx, and a local person.ts (minimal PersonSummary shape scoped to components, NOT importing/touching types.ts which is the other agent's). Added @font-face block to src/index.css referencing /fonts/*.woff2.
- 2026-08-24 00:35 UTC — Wrote src/screens/DesignSystem.tsx (demo route: theme Segmented control, Banner gallery [own/read-only/future], Pips gallery [never-logged/zero/partial/perfect], Segmented demo, PersonChip toggle grid, BottomNav in a Card, and a full 16-color palette table showing swatch + on-glyph + 5-step ramp against BOTH THEME_LIGHT and THEME_DARK surfaces side by side, independent of the live toggle). Wired /design-system route in src/App.tsx: added an early branch (after hooks, respecting Rules of Hooks) that renders <ThemeProvider><DesignSystem/></ThemeProvider> when pathname matches, BEFORE any auth-flow logic touches Login/Splash. Fixed a lucide-react LucideIcon typing issue in BottomNav.tsx (used the library's own LucideIcon type instead of a hand-rolled ComponentType, which had a propTypes variance conflict).
- 2026-08-24 00:35 UTC — VERIFICATION: npx tsc --noEmit shows exactly one repo-wide error: src/lib/dates.ts(202,46) unused 'config' param — this file is untracked, NOT mine, owned by the parallel Phase 1 agent, explicitly out of my ownership scope per instructions. All my owned files (theme.ts, components/**, screens/DesignSystem.tsx, App.tsx) typecheck with zero errors when that one file is excluded. IMPORTANT ENVIRONMENT FINDING: this is a SHARED working directory, not git-worktree-isolated per agent. Mid-session the other agent ran git checkout main then git checkout -b phase-1b-contract, which silently moved MY HEAD off phase-0-design (uncommitted files were preserved since git checkout does not discard uncommitted changes absent a conflict, but this is a real risk — a destructive command from either agent, e.g. git reset --hard or git clean -fd, would affect BOTH agents' uncommitted work since there is only one working tree). I switched back to phase-0-design and did not commit. Flagging this prominently in the final report for the orchestrator/user.
- 2026-08-24 00:39 UTC — Style cleanup pass: swept all new files for the two hard global rules (no >3 inline CSS props, no packed JSX >2 props) and fixed every violation found in Banner.tsx, BottomNav.tsx, PersonChip.tsx, DesignSystem.tsx, theme.ts (TYPE_SCALE table), ThemeProvider.tsx. Re-ran npx tsc --noEmit: ZERO errors repo-wide now (the other agent's src/lib/dates.ts unused-var error is gone — they fixed it concurrently). Ran npm run build (tsc -b && vite build): SUCCEEDS. Final bundle: dist/assets/index-*.js 162.18kB (gzip 53.35kB), index-*.css 12.73kB (gzip 3.39kB). Confirmed still on branch phase-0-design (re-verified after the earlier branch-mixup incident).

## Remaining

Phase 0 deliverables are complete: theme.ts (all §11.1 tokens, 16-color palette, mix/tint/desat,
verified byte-for-byte against spec §7 and §11.1 tables), ThemeProvider (System/Light/Dark, live
matchMedia for both dark-mode and reduced-motion), self-hosted fonts, all 7 named primitives
(Card, Segmented, SectionTitle, Pips, Banner, PersonChip, BottomNav), and the /design-system demo
route wired into App.tsx without touching Login/Splash or the auth flow.

Nothing outstanding within Phase 0's own scope. Two things worth a follow-up decision, not blockers:

1. `/design-system` is statically imported in App.tsx, so its code (and lucide-react) ships in the
   same bundle Login uses, even though Login never renders it. Bundle is still tiny (~57KB gzip vs
   the 250KB §12 budget) so this is not urgent — but a later phase could dynamic-`import()` the
   route so Login's bundle stays minimal as more screens land.
2. Environment note for the orchestrator: this session and the parallel Phase 1 agent share ONE
   working directory / .git, not isolated worktrees. Mid-session the other agent's `git checkout`
   silently moved this session's HEAD off phase-0-design (recovered, no data lost since neither
   agent had committed). Recommend worktree isolation for any future parallel-agent sessions.
