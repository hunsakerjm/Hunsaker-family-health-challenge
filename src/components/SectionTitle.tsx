import type { ReactNode } from 'react'
import { TYPE_SCALE, type ThemeSurfaces } from '../theme'

interface SectionTitleProps {
  theme: ThemeSurfaces
  children: ReactNode
  /** Small uppercase mono label at the trailing edge, e.g. a prize amount or "signature". */
  kicker?: string
}

const MARGIN_BOTTOM = 10

/** Card/section heading with an optional trailing kicker. §11.1 type scale. */
export function SectionTitle({ theme, children, kicker }: SectionTitleProps) {
  return (
    <div className="flex items-baseline justify-between" style={{ marginBottom: MARGIN_BOTTOM }}>
      <h3 style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink }}>
        {children}
      </h3>
      {kicker && (
        <span style={{ ...TYPE_SCALE.kicker, color: theme.muted }}>
          {kicker}
        </span>
      )}
    </div>
  )
}
