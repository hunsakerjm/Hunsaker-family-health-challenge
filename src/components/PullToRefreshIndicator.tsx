import { RefreshCw } from 'lucide-react'
import type { PullToRefreshState } from '../lib/usePullToRefresh'
import { RADIUS, type ThemeSurfaces } from '../theme'

interface PullToRefreshIndicatorProps {
  theme: ThemeSurfaces
  state: PullToRefreshState
  /** The hook's own arm threshold (usePullToRefresh's TRIGGER_THRESHOLD_PX), passed in rather
   * than imported so this component has no compile-time coupling to the hook's internals — only
   * to the public PullToRefreshState shape. */
  threshold: number
}

const BADGE_SIZE = 32
const ICON_SIZE = 16

/**
 * Renders inside the scroll container, BEFORE the translated content wrapper (see
 * usePullToRefresh's `contentStyle` doc). It is never itself transformed — as pullDistance pushes
 * the content wrapper down, this badge is revealed in the gap left behind, so it visually tracks
 * the finger without needing its own touch handling.
 */
export function PullToRefreshIndicator({ theme, state, threshold }: PullToRefreshIndicatorProps) {
  const { pullDistance, isRefreshing, isArmed } = state
  if (pullDistance <= 0 && !isRefreshing) return null

  const progress = Math.min(1, pullDistance / threshold)
  // Sits fully above the visible area at pullDistance 0, and fully seated in the revealed gap by
  // the time pullDistance reaches BADGE_SIZE — the same distance the gap itself has opened by.
  const badgeOffset = Math.min(pullDistance, threshold) - BADGE_SIZE

  return (
    <div
      className="absolute inset-x-0 top-0 flex justify-center pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: RADIUS.full,
          background: theme.surface,
          border: `1px solid ${theme.hairline}`,
          boxShadow: `0 2px 8px ${theme.scrim}`,
          color: isArmed || isRefreshing ? theme.ink : theme.muted,
          transform: `translateY(${badgeOffset}px)`,
        }}
      >
        <RefreshCw
          size={ICON_SIZE}
          strokeWidth={2.25}
          style={{
            transform: isRefreshing ? undefined : `rotate(${progress * 180}deg)`,
            animation: isRefreshing ? 'pull-to-refresh-spin 0.7s linear infinite' : undefined,
          }}
        />
      </div>
      <style>{`
        @keyframes pull-to-refresh-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}
      </style>
    </div>
  )
}
