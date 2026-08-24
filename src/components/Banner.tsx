import { useRef } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import type { PersonSummary } from './person'
import {
  desat,
  FONT_BODY,
  PALETTE,
  RADIUS,
  THEME_DARK,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'

interface BannerProps {
  theme: ThemeSurfaces
  person: PersonSummary
  /** True on the device's own person's log; false when viewing someone else's. §3.4 */
  isOwn: boolean
  /** Pre-formatted, e.g. "Wednesday, Sep 9" — date math lives in src/lib/dates.ts. */
  dateLabel: string
  /** Pre-formatted nav-row label, e.g. "Today" / "Earlier" / "Logging ahead". */
  navLabel: string
  points: number | null
  max: number
  isFuture?: boolean
  onPrev: () => void
  onNext: () => void
  /** Spec §3.2: "Changing later: Settings, or long-press the header avatar." Optional so
   * DesignSystem.tsx's demo usage is unaffected — omit to leave the avatar inert. */
  onAvatarLongPress?: () => void
}

const PADDING_TOP = 18
const PADDING_BOTTOM = 14
const STRIPE_OPACITY = 0.10
const STRIPE_BAND_PX = 7
const FUTURE_BORDER_OPACITY = 0.5
const FUTURE_BORDER_INSET = 5
const FUTURE_BORDER_RADIUS = 10
const EMOJI_BADGE_SIZE = 34
const EMOJI_BADGE_BG = 'rgba(255,255,255,0.22)'
const NAV_BUTTON_SIZE = 30
const NAV_BUTTON_BG = 'rgba(255,255,255,0.2)'
const READ_ONLY_LABEL_OPACITY = 0.8
const NAV_ROW_LABEL_OPACITY = 0.9
const NAV_ROW_MARGIN_TOP = 12
const SCORE_MAX_OPACITY = 0.6
const SCORE_MAX_FONT_SIZE = 14

/**
 * Full-bleed identity banner. Solid claimed color on your own log; desaturated
 * with a diagonal stripe texture and a lock glyph on someone else's — never
 * relying on color alone to say whose page this is. §3.4 / §8.3
 */
export function Banner({
  theme,
  person,
  isOwn,
  dateLabel,
  navLabel,
  points,
  max,
  isFuture = false,
  onPrev,
  onNext,
  onAvatarLongPress,
}: BannerProps) {
  const base = PALETTE[person.color].hex
  const background = isOwn ? base : desat(base, theme)
  const onReadOnly = theme === THEME_DARK ? THEME_DARK.ink : '#FFFFFF'
  const on = isOwn ? PALETTE[person.color].on : onReadOnly

  return (
    <div
      style={{
        position: 'relative',
        background,
        paddingTop: PADDING_TOP,
        paddingBottom: PADDING_BOTTOM,
      }}
    >
      {!isOwn && <ReadOnlyStripes />}
      {isFuture && <FutureDateOutline color={on} />}
      <div className="relative px-4">
        <div className="flex items-center justify-between">
          <BannerHeading
            person={person}
            isOwn={isOwn}
            dateLabel={dateLabel}
            on={on}
          />
          <BannerScore
            person={person}
            points={points}
            max={max}
            on={on}
            onAvatarLongPress={onAvatarLongPress}
          />
        </div>
        <div className="flex items-center gap-1" style={{ marginTop: NAV_ROW_MARGIN_TOP }}>
          <NavButton
            onClick={onPrev}
            on={on}
            direction="prev"
          />
          <div
            className="flex-1 text-center"
            style={{
              fontFamily: FONT_BODY,
              fontSize: 12,
              fontWeight: 600,
              color: on,
              opacity: NAV_ROW_LABEL_OPACITY,
            }}
          >
            {navLabel}
          </div>
          <NavButton
            onClick={onNext}
            on={on}
            direction="next"
          />
        </div>
      </div>
    </div>
  )
}

function ReadOnlyStripes() {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          `repeating-linear-gradient(45deg, rgba(255,255,255,${STRIPE_OPACITY}) 0 ${STRIPE_BAND_PX}px, `
          + `transparent ${STRIPE_BAND_PX}px ${STRIPE_BAND_PX * 2}px)`,
      }}
    />
  )
}

function FutureDateOutline({ color }: { color: string }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        border: `2px dashed ${color}`,
        opacity: FUTURE_BORDER_OPACITY,
        margin: FUTURE_BORDER_INSET,
        borderRadius: FUTURE_BORDER_RADIUS,
      }}
    />
  )
}

function BannerHeading({
  person,
  isOwn,
  dateLabel,
  on,
}: {
  person: PersonSummary
  isOwn: boolean
  dateLabel: string
  on: string
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT_BODY,
          fontSize: 11.5,
          fontWeight: 600,
          color: on,
          opacity: READ_ONLY_LABEL_OPACITY,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {isOwn ? 'Your log' : (
          <span className="inline-flex items-center gap-1">
            <Lock size={11} /> Viewing {person.name}&rsquo;s log
          </span>
        )}
      </div>
      <div style={{ ...TYPE_SCALE.bannerDate, color: on }}>
        {dateLabel}
      </div>
    </div>
  )
}

function BannerScore({
  person,
  points,
  max,
  on,
  onAvatarLongPress,
}: {
  person: PersonSummary
  points: number | null
  max: number
  on: string
  onAvatarLongPress?: () => void
}) {
  const longPress = useLongPress(onAvatarLongPress)

  return (
    <div className="flex items-center gap-2">
      <div style={{ ...TYPE_SCALE.bannerScoreLarge, color: on }}>
        {points ?? 0}
        <span style={{ opacity: SCORE_MAX_OPACITY, fontSize: SCORE_MAX_FONT_SIZE }}>/{max}</span>
      </div>
      <div
        className="flex items-center justify-center"
        aria-label={onAvatarLongPress ? 'Switch person (hold)' : undefined}
        style={{
          width: EMOJI_BADGE_SIZE,
          height: EMOJI_BADGE_SIZE,
          borderRadius: RADIUS.full,
          background: EMOJI_BADGE_BG,
          fontSize: 17,
        }}
        {...longPress}
      >
        {person.emoji}
      </div>
    </div>
  )
}

const LONG_PRESS_DURATION_MS = 550

/** Spec §3.2's "long-press the header avatar" affordance. Returns pointer handlers to spread
 * onto any element — a no-op set when `onLongPress` is omitted, so the avatar stays inert by
 * default (DesignSystem.tsx's demo usage). */
function useLongPress(onLongPress?: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  if (!onLongPress) {
    return {}
  }

  function handlePointerDown() {
    clearTimer()
    timerRef.current = setTimeout(() => onLongPress?.(), LONG_PRESS_DURATION_MS)
  }

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: clearTimer,
    onPointerLeave: clearTimer,
    onPointerCancel: clearTimer,
  }
}

function NavButton({
  onClick,
  on,
  direction,
}: {
  onClick: () => void
  on: string
  direction: 'prev' | 'next'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous day' : 'Next day'}
      className="flex items-center justify-center"
      style={{
        width: NAV_BUTTON_SIZE,
        height: NAV_BUTTON_SIZE,
        borderRadius: RADIUS.full,
        background: NAV_BUTTON_BG,
        color: on,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {direction === 'prev' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  )
}
