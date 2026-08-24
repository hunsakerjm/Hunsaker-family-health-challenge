// STUB — Phase 2b (the celebration engine, spec §11.2) owns the real implementation of this
// file. It did not exist in this worktree when Phase 2a started, so this no-op stands in only so
// Phase 2a's screens can code against the final call shape and typecheck/build cleanly.
//
// Phase 2a calls `playCelebration` from src/screens/Today.tsx exactly once per successful,
// user-initiated checked-on toggle on the device's own page for the current day (never on
// someone else's page, per the task's celebration contract). Phase 2b should replace this file
// wholesale with the canvas-confetti engine, escalation curve, once-per-tier-per-date tracking,
// and the Full/Subtle/Off setting described in spec §11.2 — the exported signatures below must
// stay stable since Phase 2a already depends on them.

export type CelebrationIntensity = 'full' | 'subtle' | 'off'

export interface CelebrationTrigger {
  pointsAfter: number // points the user has for the day AFTER this toggle
  maxPointsForDay: number // from maxPointsForDate(rules, date)
}

// Leading underscore: tsconfig has noUnusedParameters on, and this signature must match Phase
// 2b's real implementation exactly, so the parameter stays named per the contract rather than
// dropped.
export function playCelebration(_trigger: CelebrationTrigger): void {
  // No-op until Phase 2b lands.
}

export function getCelebrationIntensity(): CelebrationIntensity {
  return 'off'
}

export function setCelebrationIntensity(_next: CelebrationIntensity): void {
  // No-op until Phase 2b lands.
}
