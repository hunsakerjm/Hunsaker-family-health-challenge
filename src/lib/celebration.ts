/**
 * Celebration system — spec §11.2.
 *
 * "Light gamification... rationing the reward, not maximizing it." Every logged item escalates
 * the celebration a step, topping out in fireworks at full points. Tier is derived from
 * `pointsEarned / maxPointsForDate`, a 0-to-1 ratio, never from box count — the ratio survives a
 * rule set that grows or shrinks without a code change (CLAUDE.md: never hardcode 6/181/1086).
 *
 * `canvas-confetti` is dynamically imported on first use (spec §12) so it never touches the
 * Today screen's first-paint bundle. This module owns one lazily-created, reused canvas appended
 * directly to `document.body` — that keeps the whole celebration system callable from a plain
 * click handler with no React wiring required on the caller's side.
 */

import { mix } from '../theme'
import type confettiFactory from 'canvas-confetti'

// ---------------------------------------------------------------------------
// The published contract (Phase 2a codes against this exactly)
// ---------------------------------------------------------------------------

export type CelebrationIntensity = 'full' | 'subtle' | 'off'

export interface CelebrationOrigin {
  /** Normalized 0..1 viewport position, 0 = left/top edge, 1 = right/bottom edge. */
  x: number
  y: number
}

export interface CelebrationTrigger {
  /** Points the user has for the day AFTER this toggle. */
  pointsAfter: number
  /** From `maxPointsForDate(rules, date)` — never a hardcoded denominator. */
  maxPointsForDay: number
  /**
   * ADDITIVE, OPTIONAL — not in the original pinned signature. §11.2 requires bursts in "the
   * user's color" and originating from the exact tap point; the pinned two-field contract has no
   * way to express either, so these are added as optional fields rather than breaking the
   * required shape any caller has already coded against. Omitting them still works (see
   * DEFAULT_COLOR / DEFAULT_ORIGIN below) but loses spec fidelity. Pass
   * `color: PALETTE[person.color].hex` and `origin: originFromPointerEvent(event)` from the row
   * toggle handler for the fully spec-correct behavior. See Docs/DECISIONS.md.
   */
  color?: string
  origin?: CelebrationOrigin
}

/** Fire (or suppress) a celebration for this trigger. Never blocks — decoration only. */
export function playCelebration(trigger: CelebrationTrigger): void {
  const intensity = getCelebrationIntensity()
  if (intensity === 'off') {
    return
  }

  const rawRatio = ratioForTrigger(trigger)
  const ratio = intensity === 'subtle' ? Math.min(rawRatio, SUBTLE_RATIO_CAP) : rawRatio
  const color = trigger.color ?? DEFAULT_COLOR
  const origin = trigger.origin ?? DEFAULT_ORIGIN

  // Fire-and-forget: a failed write must still surface its error over the top of this (§11.2),
  // so the caller never awaits playCelebration and this never throws synchronously into it.
  void fireTier(ratio, color, origin)
}

function ratioForTrigger(trigger: CelebrationTrigger): number {
  if (trigger.maxPointsForDay <= 0) {
    return 0
  }
  const raw = trigger.pointsAfter / trigger.maxPointsForDay
  return Math.max(0, Math.min(1, raw))
}

// ---------------------------------------------------------------------------
// Device-level intensity setting — localStorage, not the database (§11.2 "The setting")
// ---------------------------------------------------------------------------

const STORAGE_KEY_INTENSITY = 'hhc:celebration-intensity'
const MEDIA_QUERY_REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export function getCelebrationIntensity(): CelebrationIntensity {
  const stored = readLocalStorage(STORAGE_KEY_INTENSITY)
  if (stored === 'full' || stored === 'subtle' || stored === 'off') {
    return stored
  }
  // Nothing stored yet, so this is the very first read. §11.2: reduced motion forces the
  // *initial* value to 'off', overriding the 'full' default — but only until the person makes an
  // explicit choice, which the branch above always honors from then on.
  return prefersReducedMotion() ? 'off' : 'full'
}

export function setCelebrationIntensity(next: CelebrationIntensity): void {
  writeLocalStorage(STORAGE_KEY_INTENSITY, next)
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia(MEDIA_QUERY_REDUCED_MOTION).matches
}

// ---------------------------------------------------------------------------
// Per-date tier tracking (§11.2 "Each tier fires at most once per logged date")
// ---------------------------------------------------------------------------
//
// `playCelebration` has no `date` field in the pinned contract, so it cannot do this dedup
// itself. These are additive, optional helpers for the caller (Phase 2a's Today screen) to use
// around its own toggle handler — see the worked example in this file's header comment and the
// Phase 2b report. Unchecking must never lower the recorded tier (spec is explicit: "the day's
// tier tracking does not decrease"), which is why this is a monotonic max, not an overwrite.

const STORAGE_KEY_TIER_PREFIX = 'hhc:celebration-tier:'

/** Highest ratio (0..1) previously celebrated for this log_date. 0 if never celebrated. */
export function getHighestCelebratedRatio(logDate: string): number {
  const stored = readLocalStorage(STORAGE_KEY_TIER_PREFIX + logDate)
  const parsed = stored === null ? 0 : Number(stored)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Record a newly reached ratio for this log_date. No-op if it isn't higher than before. */
export function recordCelebratedRatio(logDate: string, ratio: number): void {
  if (ratio <= getHighestCelebratedRatio(logDate)) {
    return
  }
  writeLocalStorage(STORAGE_KEY_TIER_PREFIX + logDate, String(ratio))
}

/** True when `ratio` would raise the tier already recorded for `logDate`. */
export function shouldCelebrate(logDate: string, ratio: number): boolean {
  return ratio > getHighestCelebratedRatio(logDate)
}

// ---------------------------------------------------------------------------
// The escalation curve — BINDING per the approved mockup (repo CLAUDE.md: mockup wins on visual
// detail; this curve is called out by name in the mockup's own header comment as one of the
// things that is binding, not illustrative). Convex on purpose: bottom tiers fire every day for
// six months and must be nearly nothing; the budget is spent at the top. §11.2.
// ---------------------------------------------------------------------------

interface CelebrationTierShape {
  count: number
  spread: number
  velocity: number
  bursts: number
  gold: boolean
}

const TIER_COUNT_BASE = 5
const TIER_COUNT_RANGE = 46
const TIER_COUNT_EXPONENT = 2.2
const TIER_SPREAD_BASE_DEGREES = 28
const TIER_SPREAD_RANGE_DEGREES = 62
const TIER_SPREAD_EXPONENT = 1.6
const TIER_VELOCITY_BASE = 4.5
const TIER_VELOCITY_RANGE = 9
const TIER_VELOCITY_EXPONENT = 1.8

// Floating-point safety margin for "ratio is effectively 1.0" (a perfect day).
const TOP_TIER_RATIO_THRESHOLD = 0.999
const GENEROUS_TIER_RATIO_THRESHOLD = 0.8

function tierForRatio(ratio: number): CelebrationTierShape {
  return {
    count: Math.round(TIER_COUNT_BASE + Math.pow(ratio, TIER_COUNT_EXPONENT) * TIER_COUNT_RANGE),
    spread: TIER_SPREAD_BASE_DEGREES + Math.pow(ratio, TIER_SPREAD_EXPONENT) * TIER_SPREAD_RANGE_DEGREES,
    velocity: TIER_VELOCITY_BASE + Math.pow(ratio, TIER_VELOCITY_EXPONENT) * TIER_VELOCITY_RANGE,
    bursts: burstsForRatio(ratio),
    gold: ratio >= TOP_TIER_RATIO_THRESHOLD,
  }
}

function burstsForRatio(ratio: number): number {
  if (ratio >= TOP_TIER_RATIO_THRESHOLD) {
    return 3
  }
  if (ratio > GENEROUS_TIER_RATIO_THRESHOLD) {
    return 2
  }
  return 1
}

// §11.2: "subtle — bottom-tier flicks... only; no top-tier fireworks." Read literally against
// the escalation table, "bottom-tier" is the two "barely there" rows (ratio ~0.17 / ~0.33).
// Capping at the top edge of that band means subtle can never reach "small" or above, let alone
// fireworks. Recorded in Docs/DECISIONS.md as a reversible, documented reading of ambiguous text.
const SUBTLE_RATIO_CAP = 0.33

// ---------------------------------------------------------------------------
// canvas-confetti wiring — one reused canvas, dynamically imported on first use (§12, §11.2)
// ---------------------------------------------------------------------------

// Above page content, below bottom sheets/modals. Matches the approved mockup's ConfettiLayer.
const CANVAS_Z_INDEX = 40
const TICKS_PER_SECOND_APPROX = 60
const TOP_TIER_DURATION_MS = 1200 // §11.2 "cap the top tier at ~1.2s"
const DEFAULT_TICKS = 90 // lower tiers: a flick, not a display
const TOP_TIER_TICKS = Math.round((TOP_TIER_DURATION_MS / 1000) * TICKS_PER_SECOND_APPROX)
const BURST_STAGGER_MS = 130
const DEFAULT_COLOR = '#FFB224' // neutral amber fallback when no user color is supplied
const DEFAULT_ORIGIN: CelebrationOrigin = { x: 0.5, y: 0.6 }
const CONFETTI_ANGLE_STRAIGHT_UP = 90

type ConfettiInstance = ReturnType<typeof confettiFactory.create>

let confettiInstancePromise: Promise<ConfettiInstance> | null = null
const activeTimers = new Set<ReturnType<typeof setTimeout>>()

async function getConfettiInstance(): Promise<ConfettiInstance> {
  if (!confettiInstancePromise) {
    confettiInstancePromise = createConfettiInstance()
  }
  return confettiInstancePromise
}

async function createConfettiInstance(): Promise<ConfettiInstance> {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(CANVAS_Z_INDEX),
  })
  document.body.appendChild(canvas)

  // The dynamic import: canvas-confetti (~4KB gzipped) must never load on first paint, since the
  // Today screen is the ten-second-logging critical path. This is the only import site.
  const { default: confetti } = await import('canvas-confetti')
  const instance = confetti.create(canvas, { resize: true, useWorker: true })

  document.addEventListener('visibilitychange', handleVisibilityChange(instance))

  return instance
}

function handleVisibilityChange(instance: ConfettiInstance) {
  return () => {
    if (document.hidden) {
      instance.reset()
      clearActiveTimers()
    }
  }
}

function clearActiveTimers(): void {
  activeTimers.forEach((timer) => clearTimeout(timer))
  activeTimers.clear()
}

async function fireTier(ratio: number, color: string, origin: CelebrationOrigin): Promise<void> {
  const instance = await getConfettiInstance()
  if (document.hidden) {
    return
  }

  const shape = tierForRatio(ratio)
  const palette = buildParticlePalette(shape.gold, color)
  const ticks = shape.gold ? TOP_TIER_TICKS : DEFAULT_TICKS

  for (let burst = 0; burst < shape.bursts; burst += 1) {
    scheduleBurst(instance, shape, palette, origin, ticks, burst * BURST_STAGGER_MS)
  }
}

function scheduleBurst(
  instance: ConfettiInstance,
  shape: CelebrationTierShape,
  palette: string[],
  origin: CelebrationOrigin,
  ticks: number,
  delayMs: number,
): void {
  const timer = setTimeout(() => {
    activeTimers.delete(timer)
    if (document.hidden) {
      return
    }
    instance({
      particleCount: shape.count,
      spread: shape.spread,
      startVelocity: shape.velocity,
      angle: CONFETTI_ANGLE_STRAIGHT_UP,
      origin,
      colors: palette,
      ticks,
      zIndex: CANVAS_Z_INDEX,
    })
  }, delayMs)
  activeTimers.add(timer)
}

const GOLD_ACCENT = '#FFD34E'
const WHITE = '#FFFFFF'
const BLACK = '#000000'
const TOP_TIER_WHITE_MIX = 0.5
const REGULAR_TIER_WHITE_MIX = 0.35
const REGULAR_TIER_SHADE_MIX = 0.18

/** §11.2: top tier is "user's color with white and gold accents"; other tiers are a tint/shade
 *  pair of the user's own color, so the burst always reads as *theirs* even at low intensity. */
function buildParticlePalette(gold: boolean, color: string): string[] {
  if (gold) {
    return [color, WHITE, GOLD_ACCENT, mix(color, WHITE, TOP_TIER_WHITE_MIX)]
  }
  return [color, mix(color, WHITE, REGULAR_TIER_WHITE_MIX), mix(color, BLACK, REGULAR_TIER_SHADE_MIX)]
}

// ---------------------------------------------------------------------------
// Helpers for callers
// ---------------------------------------------------------------------------

/** Convert a pointer/click event's client coordinates into normalized burst origin. */
export function originFromPointerEvent(event: { clientX: number; clientY: number }): CelebrationOrigin {
  if (typeof window === 'undefined') {
    return DEFAULT_ORIGIN
  }
  return {
    x: event.clientX / window.innerWidth,
    y: event.clientY / window.innerHeight,
  }
}

/**
 * Stop any in-flight animation and pending bursts immediately. Exported for the demo screen's
 * unmount cleanup and for tests; production callers do not need this in normal operation since
 * `document.hidden` already cancels animation without it (§11.2 "Cancel all animation when
 * document.hidden").
 */
export function resetCelebration(): void {
  clearActiveTimers()
  if (confettiInstancePromise) {
    void confettiInstancePromise.then((instance) => instance.reset())
  }
}

// ---------------------------------------------------------------------------
// localStorage access — guarded the same way ThemeProvider.tsx guards it, so this module behaves
// identically during SSR/tests and never throws through a UI action if storage is unavailable
// (private browsing, quota exceeded).
// ---------------------------------------------------------------------------

function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Best-effort. A blocked write must never throw through a UI action (§11.2: never block).
  }
}

// Exposed for src/lib/celebration.test.ts — pure math, no DOM required.
export const __testables = {
  tierForRatio,
  burstsForRatio,
  ratioForTrigger,
  SUBTLE_RATIO_CAP,
}
