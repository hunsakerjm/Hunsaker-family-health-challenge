import { RADIUS, SPACING, type ThemeSurfaces } from '../theme'

interface PipsProps {
  /** Points earned. `null` means the day was never logged — distinct from a
   *  logged-but-zero day. §8.4: that distinction is the whole point. */
  points: number | null
  max: number
  color: string
  theme: ThemeSurfaces
  size?: number
  gap?: number
}

const BORDER_WIDTH = 1

/** One segment per available point. Used in the calendar grid and the ribbon. §8.4 */
export function Pips({
  theme,
  points,
  max,
  color,
  size = SPACING.pipDiameter,
  gap = SPACING.pipGap,
}: PipsProps) {
  return (
    <div className="flex justify-center" style={{ gap }}>
      {Array.from({ length: max }).map((_, index) => (
        <PipSegment
          key={index}
          theme={theme}
          filled={points !== null && index < points}
          // A never-logged day gets no border at all — an untouched hairline
          // outline vs. a fully hollow set of pips is the "didn't log" signal.
          neverLogged={points === null}
          reached={points !== null && points > index}
          color={color}
          size={size}
        />
      ))}
    </div>
  )
}

function PipSegment({
  theme,
  filled,
  neverLogged,
  reached,
  color,
  size,
}: {
  theme: ThemeSurfaces
  filled: boolean
  neverLogged: boolean
  reached: boolean
  color: string
  size: number
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.full,
        background: filled ? color : 'transparent',
        border: neverLogged ? 'none' : `${BORDER_WIDTH}px solid ${reached ? color : theme.hairline}`,
        boxSizing: 'border-box',
      }}
    />
  )
}
