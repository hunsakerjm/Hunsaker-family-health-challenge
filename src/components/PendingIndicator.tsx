// A quiet, non-blocking count of offline writes still waiting to sync (spec §10: "pending
// indicator, never a blocking spinner"). Driven by `subscribePendingCount` from
// `src/lib/offline/queue.ts` — this component owns no state of its own beyond mirroring that
// subscription, so it always reflects the one real queue regardless of which screen renders it.
// Renders nothing when the queue is empty, which is true most of the time for most people.
import { useEffect, useState } from 'react'
import { CloudOff } from 'lucide-react'
import { subscribePendingCount } from '../lib/offline/queue'
import { FONT_MONO, RADIUS, type ThemeSurfaces } from '../theme'

interface PendingIndicatorProps {
  theme: ThemeSurfaces
}

const ICON_SIZE = 11
const FONT_SIZE = 11

export function PendingIndicator({ theme }: PendingIndicatorProps) {
  const [count, setCount] = useState(0)

  useEffect(() => subscribePendingCount(setCount), [])

  if (count === 0) return null

  return (
    <div
      role="status"
      aria-label={`${count} ${count === 1 ? 'change' : 'changes'} waiting to sync`}
      className="flex items-center gap-1"
      style={{
        width: 'fit-content',
        padding: '3px 8px',
        marginBottom: 10,
        borderRadius: RADIUS.full,
        background: theme.surfaceAlt,
        border: `1px solid ${theme.hairline}`,
        color: theme.muted,
      }}
    >
      <CloudOff size={ICON_SIZE} strokeWidth={2} />
      <span style={{ fontFamily: FONT_MONO, fontSize: FONT_SIZE, fontWeight: 600, letterSpacing: '0.02em' }}>
        {count} pending
      </span>
    </div>
  )
}
