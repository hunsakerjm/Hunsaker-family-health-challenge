// STUB — Phase 2b (the celebration engine, spec §11.2) owns the real implementation of this
// file. It did not exist in this worktree when Phase 2a started, so this no-op stands in only so
// Phase 2a's screens can code against the final call shape and typecheck/build cleanly. Phase 2b
// has since finished its own pass in a sibling worktree (373-line real implementation) — at merge
// this whole file is replaced by that version, which wins over everything below. Signatures here
// are kept in lockstep with what Phase 2b reported so Today.tsx's call sites need no changes
// after that swap.
//
// Phase 2a calls `playCelebration` from src/screens/Today.tsx exactly once per successful,
// user-initiated checked-on toggle on the device's own page for the current day (never on
// someone else's page, never on a backfilled date — see Docs/PHASE2A_LOG.md for the noted
// conflict with spec §11.2's own backfill text). Every call is wrapped in `shouldCelebrate` /
// `recordCelebratedRatio` so a tier fires at most once per logged date even against this inert
// stub — that wrapping is Today.tsx's job, per Phase 2b's brief, not this file's.

export type CelebrationIntensity = 'full' | 'subtle' | 'off'

export interface CelebrationOrigin {
  x: number
  y: number
}

export interface CelebrationTrigger {
  pointsAfter: number // points the user has for the day AFTER this toggle
  maxPointsForDay: number // from maxPointsForDate(rules, date)
  color?: string // NEW (additive): the user's claimed color, spec §11.2 "user's color"
  origin?: CelebrationOrigin // NEW (additive): normalized 0..1 tap origin, spec §11.2
}

export function playCelebration(_trigger: CelebrationTrigger): void {
  // No-op until Phase 2b's real module replaces this file at merge.
}

export function getCelebrationIntensity(): CelebrationIntensity {
  return 'off'
}

export function setCelebrationIntensity(_next: CelebrationIntensity): void {
  // No-op until Phase 2b lands.
}

// ---------------------------------------------------------------------------
// Tier dedup — spec §11.2: "each tier fires at most once per logged date." Callers (Today.tsx)
// wrap every playCelebration call in shouldCelebrate/recordCelebratedRatio; this stub tracks it
// for real (localStorage-backed) so that wrapping is exercised correctly even before Phase 2b's
// module lands, and unchanged after the swap.
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'hhc:celebration-tier:'

function readLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function getHighestCelebratedRatio(date: string): number {
  const raw = readLocalStorage()?.getItem(STORAGE_KEY_PREFIX + date) ?? null
  const parsed = raw === null ? 0 : Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

export function recordCelebratedRatio(date: string, ratio: number): void {
  const storage = readLocalStorage()
  if (!storage) return
  if (ratio > getHighestCelebratedRatio(date)) {
    storage.setItem(STORAGE_KEY_PREFIX + date, String(ratio))
  }
}

export function shouldCelebrate(date: string, ratio: number): boolean {
  return ratio > getHighestCelebratedRatio(date)
}

// ---------------------------------------------------------------------------
// Tap-origin helper — spec §11.2: "All bursts originate at the tap coordinates."
// ---------------------------------------------------------------------------

export interface PointerLikeEvent {
  clientX: number
  clientY: number
}

export function originFromPointerEvent(event: PointerLikeEvent): CelebrationOrigin {
  if (typeof window === 'undefined') return { x: 0.5, y: 0.5 }
  return {
    x: event.clientX / window.innerWidth,
    y: event.clientY / window.innerHeight,
  }
}
