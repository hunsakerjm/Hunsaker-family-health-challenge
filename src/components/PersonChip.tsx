import { Check } from 'lucide-react'
import type { PersonSummary } from './person'
import {
  FONT_BODY, PALETTE, RADIUS, TINT_STEP_SELECTED_CHIP_LOW, tint, type ThemeSurfaces,
} from '../theme'

interface PersonChipProps {
  theme: ThemeSurfaces
  person: PersonSummary
  /** e.g. included in the radar-chart legend, or an identity picker. */
  selected: boolean
  onClick?: () => void
}

const PADDING = '5px 10px 5px 6px'
const FONT_SIZE = 11.5
const BADGE_SIZE = 15
const BADGE_BORDER_WIDTH = 1.5

/** Toggleable person pill: emoji, name, and a check badge in their claimed color. §8.5 */
export function PersonChip({ theme, person, selected, onClick }: PersonChipProps) {
  const color = PALETTE[person.color].hex

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex items-center gap-1.5 transition"
      style={{
        borderRadius: RADIUS.full,
        padding: PADDING,
        cursor: onClick ? 'pointer' : 'default',
        background: selected ? tint(color, theme, TINT_STEP_SELECTED_CHIP_LOW) : 'transparent',
        border: `1px solid ${selected ? color : theme.hairline}`,
        fontFamily: FONT_BODY,
        fontSize: FONT_SIZE,
        fontWeight: selected ? 700 : 500,
        color: selected ? theme.ink : theme.muted,
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: RADIUS.full,
          background: selected ? color : 'transparent',
          border: selected ? 'none' : `${BADGE_BORDER_WIDTH}px solid ${theme.hairline}`,
        }}
      >
        {selected && (
          <Check
            size={10}
            strokeWidth={3.6}
            color={PALETTE[person.color].on}
          />
        )}
      </span>
      {person.emoji} {person.name}
    </button>
  )
}
