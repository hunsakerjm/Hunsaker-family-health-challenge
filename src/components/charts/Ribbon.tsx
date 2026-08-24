import { useMemo, useState } from 'react'
import type { RibbonDayCell, RibbonUserRow } from '../../types'
import {
  FONT_BODY,
  FONT_MONO,
  RADIUS,
  SPACING,
  TINT_STEP_RIBBON_EMPTY_SEGMENT,
  TYPE_SCALE,
  paletteEntryFor,
  tint,
  type ThemeSurfaces,
} from '../../theme'
import { Card } from '../Card'

export interface RibbonRow extends RibbonUserRow {
  emoji: string | null
}

interface RibbonProps {
  theme: ThemeSurfaces
  rows: RibbonRow[]
  /** Short month name for the tap-detail line, e.g. "Sep". */
  monthShortLabel: string
}

interface SelectedCell {
  userId: string
  dayIndex: number
}

const ROW_NAME_WIDTH = 60
const NAME_FONT_SIZE = 10.5
const EMOJI_FONT_SIZE = 10

/**
 * The signature element (spec §8.5, §11.1). One strip per person, one narrow column per day, a
 * stack of segments per column colored in that person's claimed color. The segment COUNT per
 * column is that day's own `max_points_for_date` — never a hardcoded 6 (CLAUDE.md) — so the tallest
 * column across the whole response sets a shared slot count and any day offering fewer points
 * (before a rule existed, say) simply leaves its extra slots empty rather than every column
 * assuming the same denominator.
 *
 * Three states per segment, matching the calendar's unlogged-vs-zero distinction (spec §3A intent,
 * carried over here since the same ambiguity applies to a ribbon):
 * - not offered that day (slot index ≥ that day's own max) — nothing rendered, pure background.
 * - ineligible (`eligible: false` — before the person joined / after they were archived) — a bare
 *   background square, no border, no fill: the day doesn't really "exist" on their strip.
 * - eligible but unlogged (`rules` empty) — a transparent segment with a hairline border.
 * - logged — filled solid up to that day's points, tinted empty above it (§11.1 ribbon token, 0.09).
 */
export function Ribbon({ theme, rows, monthShortLabel }: RibbonProps) {
  const [selected, setSelected] = useState<SelectedCell | null>(null)

  const maxSegments = useMemo(() => {
    let max = 0
    for (const row of rows) {
      for (const day of row.days) {
        if (day.max_points_for_date > max) max = day.max_points_for_date
      }
    }
    return max
  }, [rows])

  function handleSelect(userId: string, dayIndex: number) {
    setSelected((current) =>
      current?.userId === userId && current.dayIndex === dayIndex ? null : { userId, dayIndex },
    )
  }

  const selectedRow = selected ? rows.find((row) => row.user_id === selected.userId) : undefined
  const selectedDay = selectedRow && selected ? selectedRow.days[selected.dayIndex] : undefined

  return (
    <div>
      <Card theme={theme} style={{ padding: '12px 10px' }}>
        {rows.map((row) => (
          <RibbonPersonRow
            key={row.user_id}
            theme={theme}
            row={row}
            maxSegments={maxSegments}
            selectedDayIndex={selected?.userId === row.user_id ? selected.dayIndex : null}
            onSelectDay={(dayIndex) => handleSelect(row.user_id, dayIndex)}
          />
        ))}
        {rows.length === 0 && (
          <p style={{ ...TYPE_SCALE.caption, color: theme.muted, margin: 0 }}>
            Nobody was part of the challenge this month yet.
          </p>
        )}
      </Card>
      <RibbonDetail
        theme={theme}
        row={selectedRow}
        day={selectedDay}
        monthShortLabel={monthShortLabel}
      />
    </div>
  )
}

function RibbonPersonRow({
  theme,
  row,
  maxSegments,
  selectedDayIndex,
  onSelectDay,
}: {
  theme: ThemeSurfaces
  row: RibbonRow
  maxSegments: number
  selectedDayIndex: number | null
  onSelectDay: (dayIndex: number) => void
}) {
  const color = paletteEntryFor(row.color_key).hex

  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 7 }}>
      <div className="flex items-center gap-1" style={{ width: ROW_NAME_WIDTH, flexShrink: 0 }}>
        <span style={{ fontSize: EMOJI_FONT_SIZE }}>{row.emoji}</span>
        <span
          className="truncate"
          style={{ fontFamily: FONT_BODY, fontSize: NAME_FONT_SIZE, fontWeight: 600, color: theme.ink }}
        >
          {row.display_name}
        </span>
      </div>
      <div className="flex flex-1" style={{ gap: SPACING.ribbonDayGap }}>
        {row.days.map((day, dayIndex) => (
          <RibbonDayColumn
            key={day.log_date}
            theme={theme}
            day={day}
            color={color}
            maxSegments={maxSegments}
            selected={selectedDayIndex === dayIndex}
            onSelect={() => onSelectDay(dayIndex)}
          />
        ))}
      </div>
    </div>
  )
}

function RibbonDayColumn({
  theme,
  day,
  color,
  maxSegments,
  selected,
  onSelect,
}: {
  theme: ThemeSurfaces
  day: RibbonDayCell
  color: string
  maxSegments: number
  selected: boolean
  onSelect: () => void
}) {
  const isLogged = Object.keys(day.rules).length > 0

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${day.log_date}: ${isLogged ? `${day.points} of ${day.max_points_for_date} points` : 'not logged'}`}
      className="flex flex-col-reverse flex-1"
      style={{
        gap: SPACING.ribbonSegmentGap,
        height: SPACING.ribbonRowHeight,
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        outline: selected ? `1.5px solid ${theme.ink}` : 'none',
        outlineOffset: 1,
      }}
    >
      {Array.from({ length: maxSegments }).map((_, slotIndex) => (
        <RibbonSegment
          key={slotIndex}
          theme={theme}
          day={day}
          slotIndex={slotIndex}
          isLogged={isLogged}
          color={color}
        />
      ))}
    </button>
  )
}

function RibbonSegment({
  theme,
  day,
  slotIndex,
  isLogged,
  color,
}: {
  theme: ThemeSurfaces
  day: RibbonDayCell
  slotIndex: number
  isLogged: boolean
  color: string
}) {
  const offeredThatDay = slotIndex < day.max_points_for_date
  if (!offeredThatDay) {
    return <div style={{ flex: 1, borderRadius: RADIUS.ribbonSegment, background: 'transparent' }} />
  }
  if (!day.eligible) {
    return (
      <div style={{ flex: 1, borderRadius: RADIUS.ribbonSegment, background: theme.paper }} />
    )
  }
  if (!isLogged) {
    return (
      <div
        style={{
          flex: 1,
          borderRadius: RADIUS.ribbonSegment,
          background: 'transparent',
          border: `0.5px solid ${theme.hairline}`,
        }}
      />
    )
  }
  const filled = slotIndex < day.points
  return (
    <div
      style={{
        flex: 1,
        borderRadius: RADIUS.ribbonSegment,
        background: filled ? color : tint(color, theme, TINT_STEP_RIBBON_EMPTY_SEGMENT),
      }}
    />
  )
}

function RibbonDetail({
  theme,
  row,
  day,
  monthShortLabel,
}: {
  theme: ThemeSurfaces
  row: RibbonRow | undefined
  day: RibbonDayCell | undefined
  monthShortLabel: string
}) {
  if (!row || !day) {
    return (
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 8, lineHeight: 1.5 }}>
        Tap any day to see that person&rsquo;s breakdown.
      </p>
    )
  }

  const dayOfMonth = Number(day.log_date.slice(-2))
  const ruleKeys = Object.keys(day.rules)

  return (
    <div
      style={{
        marginTop: 8,
        padding: '9px 12px',
        borderRadius: RADIUS.ruleRowIconTile,
        background: theme.surfaceAlt,
        border: `1px solid ${theme.hairline}`,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, color: theme.ink }}>
          {row.emoji} {row.display_name} — {monthShortLabel} {dayOfMonth}
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, color: theme.ink }}>
          {day.points}/{day.max_points_for_date}
        </span>
      </div>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 4, marginBottom: 0 }}>
        {!day.eligible
          ? 'Not part of the challenge yet.'
          : ruleKeys.length === 0
            ? 'Nothing logged.'
            : ruleKeys.join(', ')}
      </p>
    </div>
  )
}
