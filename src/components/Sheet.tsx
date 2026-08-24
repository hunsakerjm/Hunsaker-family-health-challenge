import type { MouseEvent, ReactNode } from 'react'
import { FONT_BODY, RADIUS, SPACING, type ThemeSurfaces } from '../theme'

interface SheetProps {
  theme: ThemeSurfaces
  children: ReactNode
  /** Tapping the scrim dismisses, if provided — omit for a sheet the user must act inside. */
  onDismiss?: () => void
}

const SHEET_Z_INDEX = 40
const SHEET_PADDING = SPACING.cardPadding + 4
// iOS home-indicator safe area (spec §10) — never a fixed value.
const SHEET_BOTTOM_PADDING = 'max(20px, env(safe-area-inset-bottom))'

/** The bottom-sheet shell used by every confirm/info sheet in the app — scrim, raised surface
 * panel with top-corner radius, safe-area-aware bottom padding. §11.1 radius/spacing tokens. */
export function Sheet({ theme, children, onDismiss }: SheetProps) {
  function handleScrimClick() {
    onDismiss?.()
  }

  function stopPropagation(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-end justify-center"
      style={{ background: theme.scrim, zIndex: SHEET_Z_INDEX }}
      onClick={handleScrimClick}
    >
      <div
        className="w-full max-w-sm"
        style={{
          background: theme.surface,
          borderTopLeftRadius: RADIUS.sheetTop,
          borderTopRightRadius: RADIUS.sheetTop,
          padding: SHEET_PADDING,
          paddingBottom: SHEET_BOTTOM_PADDING,
        }}
        onClick={stopPropagation}
      >
        {children}
      </div>
    </div>
  )
}

const SHEET_BUTTON_HEIGHT = 46

interface SheetButtonProps {
  theme: ThemeSurfaces
  label: string
  onClick: () => void
  primary: boolean
  disabled?: boolean
}

/** A primary (filled) or secondary (outlined) full-width sheet action button, 44px+ tap target. */
export function SheetButton({
  theme,
  label,
  onClick,
  primary,
  disabled = false,
}: SheetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1"
      style={{
        height: SHEET_BUTTON_HEIGHT,
        borderRadius: RADIUS.primaryButton,
        border: primary ? 'none' : `1px solid ${theme.hairline}`,
        background: primary ? theme.ink : 'transparent',
        color: primary ? theme.surface : theme.ink,
        fontFamily: FONT_BODY,
        fontSize: 14,
        fontWeight: 700,
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
