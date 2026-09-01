// The one chart in this app that needs Recharts — spec §8.5 #3 replaced the old stacked-category
// bars with a per-RULE radar (one spoke per rule, not per category, so the two Movement blocks
// stay separate — spec §8.5). This module is the ONLY place `recharts` is imported anywhere in
// `src/`; `src/screens/Standings.tsx` reaches it exclusively via `React.lazy(() => import(...))`,
// which is what keeps Recharts out of the Today screen's bundle (CLAUDE.md hard rule, spec §12).
// Default export is required — React.lazy only resolves a module's `default`.
import {
  Radar,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import type { Rule, RuleStatsEntry } from '../../types'
import { ownPersonFirst } from '../../lib/ordering'
import { FONT_MONO, mix, paletteEntryFor, type ThemeSurfaces } from '../../theme'

export interface RadarPerson {
  id: string
  displayName: string
  colorKey: string
}

interface HabitRadarProps {
  theme: ThemeSurfaces
  rules: readonly Rule[]
  entries: readonly RuleStatsEntry[]
  people: readonly RadarPerson[]
  /** Display order — the caller already hoists the viewer's own person to index 0 here (spec
   *  §8.5, owner request) so the chips/legend read "you first." Paint order is derived from this
   *  below and is deliberately NOT the same order — see the comment at the render site. */
  selectedIds: readonly string[]
  ownUserId: string
}

const CHART_HEIGHT = 232
const OUTER_RADIUS = '72%'
const CHART_MARGIN = { top: 12, right: 22, bottom: 6, left: 22 }
const AXIS_TICK_COUNT = 5
const PERCENT_DOMAIN: [number, number] = [0, 100]
const STROKE_WIDTH = 2

// §8.5: "Fill opacity thins as more people are layered (roughly 0.32 → 0.20 → 0.10) so three
// overlapping shapes stay readable. Strokes stay at full color and weight."
const FILL_OPACITY_BY_LAYER_COUNT = [0.32, 0.2, 0.1] as const
const MIN_FILL_OPACITY = 0.1

function fillOpacityFor(selectedCount: number): number {
  const index = selectedCount - 1
  if (index < 0) return FILL_OPACITY_BY_LAYER_COUNT[0]
  return FILL_OPACITY_BY_LAYER_COUNT[index] ?? MIN_FILL_OPACITY
}

interface RadarRow {
  rule: string
  [personId: string]: string | number
}

const PERCENT_MULTIPLIER = 100

function buildRadarData(
  rules: readonly Rule[],
  entries: readonly RuleStatsEntry[],
  selectedIds: readonly string[],
): RadarRow[] {
  const sortedRules = [...rules].sort((a, b) => a.sort_order - b.sort_order)
  const rateByKey = new Map(entries.map((e) => [`${e.user_id}:${e.rule_key}`, e.completion_rate]))

  return sortedRules.map((rule) => {
    const row: RadarRow = { rule: rule.short_label ?? rule.label }
    for (const personId of selectedIds) {
      const rate = rateByKey.get(`${personId}:${rule.key}`) ?? 0
      row[personId] = Math.round(rate * PERCENT_MULTIPLIER)
    }
    return row
  })
}

function tooltipLabelFor(people: readonly RadarPerson[], personId: string): string {
  return people.find((p) => p.id === personId)?.displayName ?? personId
}

/** Spec §8.5: percent-of-days-hit per rule, never raw points — Movement's two blocks would
 * otherwise dominate the shape regardless of actual behavior (it's worth 2 pts/day). */
export default function HabitRadar({
  theme, rules, entries, people, selectedIds, ownUserId,
}: HabitRadarProps) {
  const data = buildRadarData(rules, entries, selectedIds)
  const fillOpacity = fillOpacityFor(selectedIds.length)
  const axisTickColor = mix(theme.muted, theme.surface, 0.45)

  // Draw (paint) order deliberately differs from display order. `selectedIds` is already
  // "own person first" for the chips/legend (spec §8.5, owner request), but Recharts paints
  // later <Radar> elements OVER earlier ones, and fills are thin and semi-transparent as more
  // people layer (0.32 → 0.20 → 0.10 — see FILL_OPACITY_BY_LAYER_COUNT above). Drawing in
  // display order would put the viewer's own shape first, i.e. on the BOTTOM, buried under
  // everyone else's fill — the opposite of why it's hoisted to the front in the first place.
  // So here we move the own person's id to the END instead of the front: reverse the array,
  // reuse the same `ownPersonFirst` hoist (own-to-front-of-the-reversed-array is own-to-back-of-
  // the-original), then reverse back. Everyone else keeps their existing relative order either
  // way. If the own person isn't in `selectedIds` at all, this is a no-op, same as `ownPersonFirst`.
  //
  // Do NOT "clean this up" by drawing in `selectedIds` order directly — that would silently
  // re-bury the viewer's own polygon under everyone else's again.
  const paintOrderIds = ownPersonFirst([...selectedIds].reverse(), ownUserId, (id) => id).reverse()

  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <RadarChart data={data} outerRadius={OUTER_RADIUS} margin={CHART_MARGIN}>
        <PolarGrid stroke={theme.hairline} />
        <PolarAngleAxis
          dataKey="rule"
          tick={{ fontSize: 10.5, fill: theme.muted, fontFamily: FONT_MONO }}
        />
        <PolarRadiusAxis
          domain={PERCENT_DOMAIN}
          tickCount={AXIS_TICK_COUNT}
          axisLine={false}
          tick={{ fontSize: 8.5, fill: axisTickColor, fontFamily: FONT_MONO }}
        />
        <Tooltip
          contentStyle={{
            background: theme.surface,
            border: `1px solid ${theme.hairline}`,
            borderRadius: 10,
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: theme.ink,
          }}
          formatter={(value, name) => [`${String(value)}%`, tooltipLabelFor(people, String(name))]}
        />
        {paintOrderIds.map((personId) => {
          const person = people.find((p) => p.id === personId)
          if (!person) return null
          const color = paletteEntryFor(person.colorKey).hex
          return (
            <Radar
              key={personId}
              dataKey={personId}
              name={personId}
              stroke={color}
              fill={color}
              fillOpacity={fillOpacity}
              strokeWidth={STROKE_WIDTH}
              isAnimationActive={false}
            />
          )
        })}
      </RadarChart>
    </ResponsiveContainer>
  )
}
