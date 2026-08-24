import type { CSSProperties, ReactNode } from 'react'
import { RADIUS, SPACING, type ThemeSurfaces } from '../theme'

interface CardProps {
  theme: ThemeSurfaces
  children: ReactNode
  /** Extra styles merged in last, so callers can override padding, etc. */
  style?: CSSProperties
  /** Card interior padding (§11.1: 14). Set false for edge-to-edge content like rule rows. */
  padded?: boolean
}

/** The base raised surface: cards, sheets, list containers. §11.1 radius/spacing. */
export function Card({ theme, children, style, padded = false }: CardProps) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.hairline}`,
        borderRadius: RADIUS.card,
        overflow: 'hidden',
        padding: padded ? SPACING.cardPadding : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
