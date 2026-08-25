// Pull-to-refresh for the app's single scroll container. This runs as a standalone installed
// PWA on iPhone, where Safari's own pull-to-refresh does not exist — force-quit-and-reopen was
// the only way to reload data before this hook.
//
// The one rule this hook cannot violate: a tap, or a small accidental drag, on the Today screen's
// checkbox grid — which sits directly under this gesture — must never be swallowed or delayed.
// Nothing here calls preventDefault() until real, committed, mostly-vertical movement past
// MOVE_COMMIT_THRESHOLD_PX has been observed while the container is already scrolled to its very
// top. Below that threshold every handler is a no-op that returns without touching state, so an
// ordinary tap (near-zero movement) passes through exactly as if this hook did not exist.
//
// Listeners are attached with native addEventListener rather than JSX onTouchMove/onTouchStart
// props on purpose: React registers touchstart/touchmove handlers passively by default (since
// React 17), which means event.preventDefault() inside a JSX-bound handler is silently ignored —
// it would never actually stop iOS's native rubber-band scroll. Only an explicitly
// { passive: false } native listener on touchmove can take over the gesture.
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushQueue } from './offline/queue'

export interface PullToRefreshState {
  /** Resistance-damped pull offset in px. 0 whenever idle. */
  pullDistance: number
  /** True from the moment onRefresh() is invoked until its promise settles (success or failure). */
  isRefreshing: boolean
  /** True once pullDistance has crossed the release threshold — releasing now triggers a refresh. */
  isArmed: boolean
}

export interface PullToRefreshContainerProps {
  /** Callback ref — attach/detach native touch listeners as the container node changes. */
  ref: (node: HTMLDivElement | null) => void
  /** Spread onto the scroll container's style. Keeps iOS's own overscroll bounce from chaining
   * to the page behind it while this hook is managing its own pull visuals. */
  style: CSSProperties
}

export interface UsePullToRefreshResult {
  /** Spread onto the scroll container div itself (the one with overflow-y-auto in App.tsx). */
  containerProps: PullToRefreshContainerProps
  /** Apply to a wrapper div around that same container's scrollable children — NOT the container
   * itself. The indicator renders unwrapped, before this wrapper, so it is revealed in the gap as
   * the wrapper's translateY pushes real content down. */
  contentStyle: CSSProperties
  state: PullToRefreshState
  /** Exposed so the indicator can compute its own progress without hardcoding this hook's
   * internal constant. */
  threshold: number
}

// A raw finger-travel distance below this many px is "still deciding" — no preventDefault, no
// state change, nothing observable happens. This is what lets a checkbox tap and iOS's own
// tap/click synthesis pass straight through untouched.
const MOVE_COMMIT_THRESHOLD_PX = 10

// Hyperbolic damping: pullDistance = raw * RESISTANCE / (raw + RESISTANCE). Approaches
// RESISTANCE asymptotically and is already within a few px of it for any realistic drag length,
// which is what gives the iOS "rubber band" feel instead of 1:1 finger travel.
const RESISTANCE = 140

// ~70-80px of *resisted* travel, matched to how iOS's own pull-to-refresh feels.
export const TRIGGER_THRESHOLD_PX = 76

// Where the indicator rests, pinned, while onRefresh()'s promise is in flight.
const REFRESHING_REST_PX = TRIGGER_THRESHOLD_PX

const RETURN_TRANSITION = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'

type GesturePhase =
  | 'idle' // no active touch, or a touch already decided not to be a pull
  | 'deciding' // one touch down at scrollTop 0, movement not yet past the commit threshold
  | 'pulling' // committed: vertical drag past threshold, actively tracking the finger
  | 'refreshing' // released while armed; onRefresh() is in flight

/** Hyperbolic rubber-band curve. Exported so the pure math can be unit tested without touching
 * the DOM or React at all. */
export function applyResistance(rawDelta: number): number {
  if (rawDelta <= 0) return 0
  return (rawDelta * RESISTANCE) / (rawDelta + RESISTANCE)
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---------------------------------------------------------------------------
// Service worker update check (owner's actual goal: force-quit-and-reopen currently does two
// things a bootstrap refetch alone does not cover — it also picks up a newly deployed app
// version, because the service worker keeps serving cached JS until the page reloads). Best
// effort and silent: an unsupported or failing check must never block or fail the data refresh.
// ---------------------------------------------------------------------------

// Registered once (module scope, not per pull) so repeated refreshes don't stack listeners.
// `public/sw.js` calls skipWaiting()/clients.claim() itself, so once a newly installed worker
// takes control, 'controllerchange' fires on its own — this just reloads the page when that
// happens so the new bundle is actually the one running.
let controllerChangeListenerInstalled = false

function ensureControllerChangeReload(): void {
  if (controllerChangeListenerInstalled) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  controllerChangeListenerInstalled = true

  // 'controllerchange' also fires the first time a worker ever takes control of a page that
  // previously had none (i.e. this page's very first activation) — reloading then would be a
  // pointless, possibly looping, reload. Only reload when a controller already existed at the
  // moment this listener was installed, meaning this change is a genuine version swap.
  const hadControllerAtSetup = navigator.serviceWorker.controller !== null
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadControllerAtSetup) window.location.reload()
  })
}

/** Best-effort: ask the service worker registration to check for an update. Never throws —
 * `navigator.serviceWorker` can be absent (unsupported browser, some in-app webviews), and a
 * failed update check is not a reason to fail the whole pull-to-refresh. */
async function checkForAppUpdate(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    ensureControllerChangeReload()
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  } catch {
    // Best-effort — see doc comment above.
  }
}

/** Composes the two "sync me up" actions a pull-to-refresh implies beyond the bootstrap refetch
 * itself: flushing any offline-queued writes, and checking for a newly deployed app version. Pass
 * as the second half of the function handed to usePullToRefresh's onRefresh — see this hook's own
 * export for how it's combined with the actual bootstrap reload, which App.tsx owns. Failures in
 * either half are swallowed here (allSettled), matching "a queue failure must not block the
 * refresh" and "a failed update check must not block the data refresh."
 */
export async function syncOnPullToRefresh(): Promise<void> {
  await Promise.allSettled([flushQueue(), checkForAppUpdate()])
}

export function usePullToRefresh(onRefresh: () => Promise<void>): UsePullToRefreshResult {
  // State, not a plain ref: the listener effect below needs to re-run if the container node is
  // ever replaced (e.g. a remount), and only a state change (not a ref mutation) can trigger that.
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const phaseRef = useRef<GesturePhase>('idle')
  const startRef = useRef({ x: 0, y: 0 })
  // Mirrors isArmed for the touchend handler to read synchronously. Using the state value itself
  // there would mean reaching for the setState-updater-as-getter trick, which risks a double
  // side-effect fire under StrictMode's deliberate double-invocation of updater functions — a
  // plain ref has no such hazard.
  const armedRef = useRef(false)

  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isArmed, setIsArmed] = useState(false)
  // Only the settle/snap steps animate — while phaseRef is 'pulling' the value must track the
  // finger with zero latency, so this flips the CSS transition on and off.
  const [isSettling, setIsSettling] = useState(false)

  const resetToIdle = useCallback(() => {
    phaseRef.current = 'idle'
    armedRef.current = false
    setIsSettling(!prefersReducedMotion())
    setPullDistance(0)
    setIsArmed(false)
    setIsRefreshing(false)
  }, [])

  const runRefresh = useCallback(() => {
    phaseRef.current = 'refreshing'
    armedRef.current = false
    setIsSettling(!prefersReducedMotion())
    setPullDistance(REFRESHING_REST_PX)
    setIsArmed(false)
    setIsRefreshing(true)
    // A rejected refresh is still a *completed* one from this gesture's point of view — the
    // indicator must always resolve, never hang because the caller's promise rejected (a failed
    // bootstrap fetch, for instance).
    onRefreshRef.current()
      .catch(() => {})
      .finally(resetToIdle)
  }, [resetToIdle])

  useEffect(() => {
    const node = containerNode
    if (!node) return

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1 || phaseRef.current === 'refreshing') return
      if (!node || node.scrollTop > 0) {
        phaseRef.current = 'idle'
        return
      }
      const touch = event.touches[0]
      startRef.current = { x: touch.clientX, y: touch.clientY }
      phaseRef.current = 'deciding'
      armedRef.current = false
      setIsSettling(false)
    }

    function handleTouchMove(event: TouchEvent) {
      const phase = phaseRef.current
      if (phase === 'idle' || phase === 'refreshing') return

      const touch = event.touches[0]
      const dx = touch.clientX - startRef.current.x
      const dy = touch.clientY - startRef.current.y

      if (phase === 'deciding') {
        const traveled = Math.max(Math.abs(dx), Math.abs(dy))
        if (traveled < MOVE_COMMIT_THRESHOLD_PX) return // still just a tap/tiny wobble — untouched

        const isHorizontalDominant = Math.abs(dx) > Math.abs(dy)
        const isUpwardOrFlat = dy <= 0
        if (isHorizontalDominant || isUpwardOrFlat) {
          // A horizontal swipe, or an upward drag at scrollTop 0 (an ordinary, if inert, scroll
          // attempt) — neither is a pull. Hand the rest of this touch back to the browser.
          phaseRef.current = 'idle'
          return
        }
        phaseRef.current = 'pulling'
      }

      if (phaseRef.current !== 'pulling') return

      // Only now — real, committed, vertical, downward movement at the top of the list — do we
      // take over the gesture from native scrolling. See module doc comment for why this only
      // works because these listeners were attached non-passively.
      event.preventDefault()
      const distance = applyResistance(Math.max(0, dy))
      const armed = distance >= TRIGGER_THRESHOLD_PX
      armedRef.current = armed
      setPullDistance(distance)
      setIsArmed(armed)
    }

    function handleTouchEnd() {
      const wasPulling = phaseRef.current === 'pulling'
      if (!wasPulling) {
        phaseRef.current = 'idle'
        return
      }
      if (armedRef.current) {
        runRefresh()
      } else {
        resetToIdle()
      }
    }

    function handleTouchCancel() {
      // An interrupted gesture (e.g. an incoming call alert) should never fire a refresh —
      // always just reset, regardless of how far the pull had traveled.
      if (phaseRef.current === 'pulling') resetToIdle()
      else phaseRef.current = 'idle'
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: true })
    node.addEventListener('touchmove', handleTouchMove, { passive: false })
    node.addEventListener('touchend', handleTouchEnd, { passive: true })
    node.addEventListener('touchcancel', handleTouchCancel, { passive: true })

    return () => {
      node.removeEventListener('touchstart', handleTouchStart)
      node.removeEventListener('touchmove', handleTouchMove)
      node.removeEventListener('touchend', handleTouchEnd)
      node.removeEventListener('touchcancel', handleTouchCancel)
    }
  }, [containerNode, resetToIdle, runRefresh])

  return {
    containerProps: {
      ref: setContainerNode,
      style: { overscrollBehavior: 'contain' },
    },
    contentStyle: {
      transform: `translateY(${pullDistance}px)`,
      transition: isSettling ? RETURN_TRANSITION : 'none',
    },
    state: { pullDistance, isRefreshing, isArmed },
    threshold: TRIGGER_THRESHOLD_PX,
  }
}
