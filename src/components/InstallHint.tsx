import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { FONT_BODY, SPACING, THEME_LIGHT, THEME_DARK, type ThemeSurfaces } from '../theme'

const INSTALL_HINT_DISMISSED_KEY = 'health-challenge-install-hint-dismissed'

interface InstallHintProps {
  theme: ThemeSurfaces
}

/**
 * Dismissible "Add to Home Screen" hint for iOS Safari only.
 *
 * Shows only on first visit in iOS Safari, hidden when:
 * - Already running as installed app (display-mode: standalone or navigator.standalone)
 * - Not on iOS Safari
 * - User has dismissed it (persisted in localStorage)
 *
 * Respects safe-area-inset-bottom so it never sits under the home indicator.
 */
export function InstallHint({ theme }: InstallHintProps): JSX.Element | null {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Don't show if already running standalone
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    if (isStandalone) {
      return
    }

    // Check if already dismissed
    const isDismissed =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === 'true'

    if (isDismissed) {
      return
    }

    // Check if iOS Safari
    const isIosSafari = /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !navigator.userAgent.includes('CriOS') &&
      !navigator.userAgent.includes('FxiOS') &&
      !navigator.userAgent.includes('OPiOS')

    if (isIosSafari) {
      setIsVisible(true)
    }
  }, [])

  if (!isVisible) {
    return null
  }

  function handleDismiss() {
    setIsVisible(false)
    try {
      localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, 'true')
    } catch {
      // localStorage might be unavailable; the hint will reappear on reload, which is acceptable
    }
  }

  const isLight = theme === THEME_LIGHT

  return (
    <div
      className="fixed bottom-0 left-0 right-0 flex justify-center"
      style={{
        paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      <div
        className="flex items-start gap-3 max-w-sm"
        style={{
          background: theme.surface,
          border: `1px solid ${theme.hairline}`,
          borderRadius: 12,
          padding: SPACING.cardPadding,
          boxShadow: isLight
            ? '0 4px 12px rgba(0,0,0,0.12)'
            : '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'auto',
        }}
      >
        <div className="flex-1">
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 14,
              fontWeight: 600,
              color: theme.ink,
              lineHeight: 1.4,
            }}
          >
            Add to Home Screen
          </div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: 13,
              fontWeight: 400,
              color: theme.muted,
              lineHeight: 1.4,
              marginTop: 4,
            }}
          >
            Tap the Share icon, then &quot;Add to Home Screen&quot;
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 mt-0.5"
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: theme.muted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
          }}
        >
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
