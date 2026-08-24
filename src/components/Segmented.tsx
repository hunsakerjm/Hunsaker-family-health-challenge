import { FONT_BODY, RADIUS, type ThemeSurfaces } from '../theme'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  theme: ThemeSurfaces
  options: Array<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Tighter padding and smaller type for inline placements. */
  small?: boolean
  /** Accessible name for the whole control, e.g. "Appearance". */
  label: string
}

const PADDING_REGULAR = '7px 12px'
const PADDING_SMALL = '5px 10px'
const FONT_SIZE_REGULAR = 12.5
const FONT_SIZE_SMALL = 11
const TRACK_PADDING = 3
const ACTIVE_SHADOW = '0 1px 3px rgba(0,0,0,0.12)'

/** A pill-track option switcher — System/Light/Dark, September/All time/Weight, etc. */
export function Segmented<T extends string>({
  theme,
  options,
  value,
  onChange,
  small = false,
  label,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex"
      style={{
        borderRadius: RADIUS.full,
        background: theme.surfaceAlt,
        padding: TRACK_PADDING,
        border: `1px solid ${theme.hairline}`,
      }}
    >
      {options.map((option) => (
        <SegmentedButton
          key={option.value}
          theme={theme}
          option={option}
          active={option.value === value}
          onSelect={onChange}
          small={small}
        />
      ))}
    </div>
  )
}

function SegmentedButton<T extends string>({
  theme,
  option,
  active,
  onSelect,
  small,
}: {
  theme: ThemeSurfaces
  option: SegmentedOption<T>
  active: boolean
  onSelect: (value: T) => void
  small: boolean
}) {
  function handleClick() {
    onSelect(option.value)
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={handleClick}
      className="flex-1 transition"
      style={{
        borderRadius: RADIUS.full,
        padding: small ? PADDING_SMALL : PADDING_REGULAR,
        fontFamily: FONT_BODY,
        fontSize: small ? FONT_SIZE_SMALL : FONT_SIZE_REGULAR,
        fontWeight: 600,
        background: active ? theme.surface : 'transparent',
        color: active ? theme.ink : theme.muted,
        boxShadow: active ? ACTIVE_SHADOW : 'none',
        border: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {option.label}
    </button>
  )
}
