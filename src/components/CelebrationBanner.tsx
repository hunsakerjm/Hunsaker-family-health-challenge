import { setCelebrationIntensity } from '../lib/celebration'
import {
  FONT_MONO,
  RADIUS,
  TINT_STEP_PERFECT_DAY_BORDER,
  TINT_STEP_PERFECT_DAY_FILL,
  tint,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'

interface CelebrationBannerProps {
  theme: ThemeSurfaces
  /** The user's claimed color — the fill/border tint and the "{max}/{max}" figure read in it. */
  color: string
  points: number
  max: number
  /** Called after "Turn off celebrations" is tapped, so the caller can drop this banner too. */
  onIntensityOff?: () => void
}

const PADDING = '12px 14px'
const GAP = 10
const TURN_OFF_BUTTON_PADDING = '6px 10px'

/**
 * The day-complete banner (§11.2: "a banner reading `{max} / {max} — perfect day`"), shown only
 * at the top tier. Carries the one-tap `Turn off celebrations` control — "the moment someone is
 * most likely to want it" — which is the second of the setting's two exposure points, the first
 * being Settings -> This device.
 *
 * This component only renders the banner chrome; the caller (Today screen, owned by Phase 2a)
 * decides when `points === max` and mounts it. Never render this for a weight entry or anyone
 * else's page — §11.2 "Never celebrate."
 */
export function CelebrationBanner({ theme, color, points, max, onIntensityOff }: CelebrationBannerProps) {
  function handleTurnOff() {
    setCelebrationIntensity('off')
    onIntensityOff?.()
  }

  return (
    <div
      role="status"
      className="flex items-center justify-between"
      style={{
        padding: PADDING,
        borderRadius: RADIUS.card,
        background: tint(color, theme, TINT_STEP_PERFECT_DAY_FILL),
        border: `1px solid ${tint(color, theme, TINT_STEP_PERFECT_DAY_BORDER)}`,
        gap: GAP,
      }}
    >
      <span style={{ ...TYPE_SCALE.bodyCopy, color: theme.ink }}>
        <span style={{ ...TYPE_SCALE.bannerScoreMedium, fontFamily: FONT_MONO, color }}>
          {points} / {max}
        </span>
        {' — perfect day'}
      </span>
      <button
        type="button"
        onClick={handleTurnOff}
        style={{
          padding: TURN_OFF_BUTTON_PADDING,
          borderRadius: RADIUS.full,
          border: `1px solid ${theme.hairline}`,
          background: theme.surface,
          color: theme.muted,
          fontFamily: TYPE_SCALE.caption.fontFamily,
          fontSize: 11.5,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Turn off celebrations
      </button>
    </div>
  )
}
