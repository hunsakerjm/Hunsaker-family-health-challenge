// Ambient motion — spec §11.2 "Ambient motion": calendar pips stagger in on month load,
// leaderboard bars grow from zero, ribbon strips wipe in left to right. Governed by the same
// device-level celebration intensity setting as the confetti system (`off` disables it entirely,
// `subtle` and `full` both allow it — §11.2's "subtle" row explicitly lists "ambient motion" as
// still-on), no particles, no new dependency: every effect below is a plain CSS opacity/transform/
// clip-path transition triggered by one state flip after mount.
//
// SPEC'S HARD REQUIREMENT: this must be removable by deleting a single hook without touching
// anything else. This file is that hook. Every call site consults it through the two fields below
// and nothing else — no shared keyframes stylesheet, no companion component, no state stored
// anywhere but here. See this file's own report / Docs/PHASE5A_LOG.md for the exact, mechanical
// diff deleting it leaves behind at each call site.
import { useEffect, useState } from 'react'
import { getCelebrationIntensity } from './celebration'

export interface AmbientMotionState {
  /** False when the device's celebration intensity is `off` (which already covers
   *  `prefers-reduced-motion: reduce`'s forced initial value — see `getCelebrationIntensity`).
   *  Call sites must render their final, static state when this is false, never a paused or
   *  half-played animation. */
  enabled: boolean
  /**
   * Starts `false` (or `true` immediately when `enabled` is false — nothing to reveal), then
   * flips to `true` one animation frame after mount. Call sites drive a CSS transition off this
   * flip: render the "hidden" values (0 opacity, 0 width, a clip-path hiding the strip) while
   * `revealed` is false, and the final values once it's true, with `transition` present only when
   * `enabled` is true. A per-item stagger is just a `transitionDelay` the call site computes from
   * its own index — this hook doesn't need to know about items, rows, or columns at all.
   */
  revealed: boolean
}

/**
 * Consult once per animated group (a calendar month grid, a leaderboard list, a ribbon's set of
 * rows) — not once per item within it. Pass `resetKey` as whatever value identifies "a fresh
 * batch of content to reveal" (a month key, a fetched-data object reference); changing it replays
 * the reveal, which is how a calendar month swap re-triggers the pip stagger on the new grid.
 */
export function useAmbientMotion(resetKey?: unknown): AmbientMotionState {
  const enabled = getCelebrationIntensity() !== 'off'
  const [revealed, setRevealed] = useState(!enabled)

  useEffect(() => {
    if (!enabled) {
      setRevealed(true)
      return
    }
    setRevealed(false)
    const frame = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetKey is an intentional replay trigger
  }, [enabled, resetKey])

  return { enabled, revealed }
}
