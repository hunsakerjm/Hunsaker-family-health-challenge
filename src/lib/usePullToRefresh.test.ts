// The gesture state machine itself needs a DOM (touch events, scrollTop, requestAnimationFrame)
// that this repo's vitest config deliberately does not provide (vitest.config.ts runs everything
// under the 'node' environment — see that file's own comment — and this project takes no new
// dependency to add jsdom/happy-dom just for one hook). What *is* pure, silent-failure-prone, and
// therefore worth locking down the CLAUDE.md way: the rubber-band resistance curve. Get the curve
// wrong and the pull either feels like 1:1 unresisted dragging or never reaches the arm threshold
// at a realistic finger-travel distance — both are the kind of thing nobody notices in a diff.
import { describe, expect, it } from 'vitest'
import { applyResistance, TRIGGER_THRESHOLD_PX } from './usePullToRefresh'

describe('applyResistance', () => {
  it('returns 0 for no movement or upward movement', () => {
    expect(applyResistance(0)).toBe(0)
    expect(applyResistance(-40)).toBe(0)
  })

  it('damps travel well below 1:1 (the rubber-band feel)', () => {
    const raw = 100
    const resisted = applyResistance(raw)
    expect(resisted).toBeGreaterThan(0)
    expect(resisted).toBeLessThan(raw)
  })

  it('is monotonically increasing with more raw travel', () => {
    const distances = [10, 40, 80, 160, 320, 640].map(applyResistance)
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1])
    }
  })

  it('approaches but never reaches the resistance constant, even for a very long drag', () => {
    const nearlyFullScreenDrag = applyResistance(3000)
    // RESISTANCE is 140 (module-private); asserting against TRIGGER_THRESHOLD_PX's neighborhood
    // instead so this test doesn't need that constant exported just to read it back.
    expect(nearlyFullScreenDrag).toBeGreaterThan(TRIGGER_THRESHOLD_PX)
    expect(nearlyFullScreenDrag).toBeLessThan(150)
  })

  it('reaches the arm threshold at a realistic finger-travel distance, not an absurd one', () => {
    // A real pull gesture on a phone rarely exceeds ~250px of raw travel before the hand runs out
    // of comfortable reach. The curve must cross TRIGGER_THRESHOLD_PX well before that, or the
    // gesture would never feel "armable" in practice.
    const comfortableDrag = applyResistance(250)
    expect(comfortableDrag).toBeGreaterThanOrEqual(TRIGGER_THRESHOLD_PX)
  })

  it('does not arm at a small, accidental-drag-sized raw distance', () => {
    // Mirrors the hook's own MOVE_COMMIT_THRESHOLD_PX (10px) — travel at that scale must stay far
    // under the threshold so a jittery tap can never accidentally arm a refresh.
    expect(applyResistance(10)).toBeLessThan(TRIGGER_THRESHOLD_PX)
  })
})
