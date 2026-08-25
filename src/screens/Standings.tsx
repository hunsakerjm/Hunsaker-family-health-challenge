// Standings screen — spec §8.5. The social screen: leaderboard, the ribbon (signature element),
// the per-rule completion radar, consistency, and a weight-percentage tab. Highest visual-risk
// track in the build (spec §14) — every visual choice here matches `Docs/HealthChallengeMockup.jsx`
// exactly; every aggregate/tie/window rule matches the spec text over the mockup's illustrative
// demo data where the two diverge (see Docs/PHASE3B_LOG.md for the specific conflicts found).
//
// Recharts isolation (CLAUDE.md hard rule, spec §12): this file never imports `recharts` itself —
// only `src/components/charts/HabitRadar.tsx` does, and it's reached exclusively through
// `React.lazy` below. That keeps Recharts out of this screen's own static import graph, so even
// though `Standings.tsx` can be statically imported by App.tsx exactly like `Today.tsx` is, the
// heavy chart library still lands in its own lazy chunk — see the build's chunk list for proof.
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { getLeaderboard, getRibbon, getRuleStats, getWeightStats, ApiError } from '../api'
import type {
  AppConfig, LeaderboardEntry, LeaderboardResponse, Rule, RuleStatsResponse, RibbonResponse,
  StatsPeriod, User, WeightStatsEntry, WeightStatsResponse,
} from '../types'
import { Card } from '../components/Card'
import { SectionTitle } from '../components/SectionTitle'
import { Segmented, type SegmentedOption } from '../components/Segmented'
import { PersonChip } from '../components/PersonChip'
import { Sheet, SheetButton } from '../components/Sheet'
import { Ribbon, type RibbonRow } from '../components/charts/Ribbon'
import type { RadarPerson } from '../components/charts/HabitRadar'
import {
  FONT_BODY,
  FONT_MONO,
  RADIUS,
  TINT_STEP_LEADERBOARD_LEADER_ROW,
  TYPE_SCALE,
  paletteEntryFor,
  tint,
  type PersonColorKey,
  type ThemeSurfaces,
} from '../theme'
import { compareDates, getMonthBoundaries, getMonthKey } from '../lib/dates'
import { useAmbientMotion } from '../lib/useAmbientMotion'

const HabitRadar = lazy(() => import('../components/charts/HabitRadar'))

type StandingsTab = 'month' | 'all' | 'weight'

interface StandingsScreenProps {
  theme: ThemeSurfaces
  config: AppConfig
  serverToday: string
  rules: Rule[]
  users: User[]
  ownUserId: string
}

const MONTH_LONG_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' })
const MONTH_SHORT_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })

function monthInstant(monthKey: string): Date {
  const { start } = getMonthBoundaries(monthKey)
  const [year, month, day] = start.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function monthLongLabel(monthKey: string): string {
  return MONTH_LONG_FORMATTER.format(monthInstant(monthKey))
}

function monthShortLabel(monthKey: string): string {
  return MONTH_SHORT_FORMATTER.format(monthInstant(monthKey))
}

function enumerateMonths(startMonthKey: string, endMonthKey: string): string[] {
  const months: string[] = []
  let year = Number(startMonthKey.slice(0, 4))
  let month = Number(startMonthKey.slice(5, 7))
  const endYear = Number(endMonthKey.slice(0, 4))
  const endMonth = Number(endMonthKey.slice(5, 7))

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

export function StandingsScreen({ theme, config, serverToday, rules, users, ownUserId }: StandingsScreenProps) {
  const challengeRange = { start: config.challenge_start, end: config.challenge_end }
  const currentMonthKey = getMonthKey(serverToday)
  const latestPickableMonth = compareDates(serverToday, config.challenge_end) <= 0
    ? currentMonthKey
    : getMonthKey(config.challenge_end)

  const [tab, setTab] = useState<StandingsTab>('month')
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([ownUserId])

  function handleTabChange(next: StandingsTab) {
    if (next === 'month' && tab === 'month') {
      setMonthPickerOpen(true)
      return
    }
    setTab(next)
  }

  function handlePickMonth(monthKey: string) {
    setSelectedMonth(monthKey)
    setTab('month')
    setMonthPickerOpen(false)
  }

  function togglePerson(userId: string) {
    setSelectedPersonIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    )
  }

  const period: StatsPeriod = tab === 'all' ? 'all' : 'month'
  const leaderboard = useLeaderboardAndRules(period, selectedMonth, tab !== 'weight')
  const ribbon = useRibbon(selectedMonth)
  const weight = useWeightStats(tab === 'weight')

  const tabOptions: SegmentedOption<StandingsTab>[] = [
    { value: 'month', label: monthLongLabel(selectedMonth) },
    { value: 'all', label: 'All time' },
    { value: 'weight', label: 'Weight' },
  ]

  return (
    <div className="px-4" style={{ paddingTop: 16, paddingBottom: 20 }}>
      <h2 style={{ ...TYPE_SCALE.screenTitle, color: theme.ink, marginBottom: 12 }}>Standings</h2>

      <Segmented
        theme={theme}
        label="Standings period"
        value={tab}
        onChange={handleTabChange}
        options={tabOptions}
      />

      {tab === 'weight' ? (
        <WeightSection theme={theme} config={config} weight={weight} />
      ) : (
        <>
          <LeaderboardSection theme={theme} config={config} tab={tab} leaderboard={leaderboard} />
          <RibbonSection theme={theme} selectedMonth={selectedMonth} ribbon={ribbon} users={users} />
          <RadarSection
            theme={theme}
            rules={rules}
            leaderboard={leaderboard}
            selectedPersonIds={selectedPersonIds}
            onTogglePerson={togglePerson}
          />
          <ConsistencySection theme={theme} leaderboard={leaderboard} />
        </>
      )}

      {monthPickerOpen && (
        <MonthPickerSheet
          theme={theme}
          months={enumerateMonths(getMonthKey(challengeRange.start), latestPickableMonth)}
          selectedMonth={selectedMonth}
          onPick={handlePickMonth}
          onDismiss={() => setMonthPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data hooks — "latest request wins" via a generation counter, since api.ts's fetch wrapper has
// no cancellation and a family member flicking between month/all/weight faster than a response
// returns must never let a stale response clobber a newer one.
// ---------------------------------------------------------------------------

interface LeaderboardState {
  data: LeaderboardResponse | null
  ruleStats: RuleStatsResponse | null
  loading: boolean
  error: string | null
}

function useLeaderboardAndRules(period: StatsPeriod, month: string, enabled: boolean): LeaderboardState {
  const [state, setState] = useState<LeaderboardState>({
    data: null, ruleStats: null, loading: enabled, error: null,
  })
  const generation = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const myGeneration = (generation.current += 1)
    setState((s) => ({ ...s, loading: true, error: null }))

    Promise.all([
      getLeaderboard({ period, month: period === 'month' ? month : undefined }),
      getRuleStats({ period, month: period === 'month' ? month : undefined }),
    ])
      .then(([data, ruleStats]) => {
        if (generation.current !== myGeneration) return
        setState({ data, ruleStats, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (generation.current !== myGeneration) return
        setState({ data: null, ruleStats: null, loading: false, error: errorMessage(error) })
      })
  }, [period, month, enabled])

  return state
}

interface RibbonState {
  data: RibbonResponse | null
  loading: boolean
  error: string | null
}

function useRibbon(month: string): RibbonState {
  const [state, setState] = useState<RibbonState>({ data: null, loading: true, error: null })
  const generation = useRef(0)

  useEffect(() => {
    const myGeneration = (generation.current += 1)
    setState((s) => ({ ...s, loading: true, error: null }))

    getRibbon({ month })
      .then((data) => {
        if (generation.current !== myGeneration) return
        setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (generation.current !== myGeneration) return
        setState({ data: null, loading: false, error: errorMessage(error) })
      })
  }, [month])

  return state
}

interface WeightState {
  data: WeightStatsResponse | null
  loading: boolean
  error: string | null
}

function useWeightStats(enabled: boolean): WeightState {
  const [state, setState] = useState<WeightState>({ data: null, loading: enabled, error: null })
  const generation = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const myGeneration = (generation.current += 1)
    setState((s) => ({ ...s, loading: true, error: null }))

    getWeightStats()
      .then((data) => {
        if (generation.current !== myGeneration) return
        setState({ data, loading: false, error: null })
      })
      .catch((error: unknown) => {
        if (generation.current !== myGeneration) return
        setState({ data: null, loading: false, error: errorMessage(error) })
      })
  }, [enabled])

  return state
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Could not load standings. Try again.'
}

// ---------------------------------------------------------------------------
// Leaderboard (spec §8.5 #1)
// ---------------------------------------------------------------------------

function LeaderboardSection({
  theme,
  config,
  tab,
  leaderboard,
}: {
  theme: ThemeSurfaces
  config: AppConfig
  tab: StandingsTab
  leaderboard: LeaderboardState
}) {
  const entries = leaderboard.data?.entries ?? []
  const topPoints = entries.reduce((max, entry) => Math.max(max, entry.points_total), 0)
  const anyTie = entries.some((entry) => entry.tied)
  const kicker = tab === 'month' ? config.prize_monthly : 'Whole challenge'
  // Ambient motion (spec §11.2): bars grow from zero on each fresh leaderboard fetch. Keyed on
  // the response object itself so switching month/all-time (a new fetch, a new object) replays it.
  const barMotion = useAmbientMotion(leaderboard.data)

  // Finishing order, first at the top. The API assigns `rank` but does not promise row order,
  // and a leaderboard that isn't in rank order isn't a leaderboard.
  const sortedByRank = [...entries].sort((a, b) => a.rank - b.rank)

  return (
    <div style={{ marginTop: 18 }}>
      <SectionTitle theme={theme} kicker={kicker}>Leaderboard</SectionTitle>
      <Card theme={theme}>
        {entries.length === 0 ? (
          <EmptyRow theme={theme} loading={leaderboard.loading} error={leaderboard.error} />
        ) : (
          sortedByRank.map((entry, index) => (
            <LeaderboardRow
              key={entry.user_id}
              theme={theme}
              entry={entry}
              topPoints={topPoints}
              isFirst={index === 0}
              staggerIndex={index}
              ambientEnabled={barMotion.enabled}
              ambientRevealed={barMotion.revealed}
            />
          ))
        )}
      </Card>
      {anyTie && (
        <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 8 }}>
          Tied — settle it as a family.
        </p>
      )}
    </div>
  )
}

const LEADERBOARD_BAR_HEIGHT = 4
// Ambient motion (spec §11.2): each row's bar grows a beat after the one above it.
const AMBIENT_BAR_STAGGER_STEP_MS = 60
const AMBIENT_BAR_GROWTH_DURATION_MS = 700

function LeaderboardRow({
  theme,
  entry,
  topPoints,
  isFirst,
  staggerIndex = 0,
  ambientEnabled = false,
  ambientRevealed = true,
}: {
  theme: ThemeSurfaces
  entry: LeaderboardEntry
  topPoints: number
  isFirst: boolean
  /** Deleting `src/lib/useAmbientMotion.ts`: drop these three props here and at the call site,
   *  then hardcode the bar's `width`/`transition` below back to their un-gated always-`barPercent`
   *  / always-600ms-ease form. Nothing else in this row depends on them. */
  staggerIndex?: number
  ambientEnabled?: boolean
  ambientRevealed?: boolean
}) {
  const color = paletteEntryFor(entry.color_key).hex
  const isLeader = entry.rank === 1
  const barPercent = topPoints > 0 ? (entry.points_total / topPoints) * 100 : 0
  const barWidthPercent = ambientEnabled && !ambientRevealed ? 0 : barPercent
  const barTransition = ambientEnabled
    ? `width ${AMBIENT_BAR_GROWTH_DURATION_MS}ms cubic-bezier(.16,1,.3,1) `
      + `${staggerIndex * AMBIENT_BAR_STAGGER_STEP_MS}ms`
    : 'width 600ms ease'

  return (
    <div
      className="flex items-center gap-2.5"
      style={{
        padding: '11px 13px',
        borderTop: isFirst ? 'none' : `1px solid ${theme.hairline}`,
        background: isLeader ? tint(color, theme, TINT_STEP_LEADERBOARD_LEADER_ROW) : 'transparent',
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, width: 20,
          color: isLeader ? color : theme.muted,
        }}
      >
        {entry.tied ? `T${entry.rank}` : entry.rank}
      </span>
      <span style={{ fontSize: 14 }}>{entry.emoji}</span>
      <div className="flex-1" style={{ minWidth: 0 }}>
        <div
          className="truncate"
          style={{
            fontFamily: FONT_BODY, fontSize: 13.5, color: theme.ink,
            fontWeight: isLeader ? 700 : 600,
          }}
        >
          {entry.display_name}
        </div>
        <div
          className="rounded-full"
          style={{ height: LEADERBOARD_BAR_HEIGHT, background: theme.surfaceAlt, marginTop: 4, overflow: 'hidden' }}
        >
          <div
            style={{
              width: `${barWidthPercent}%`, height: '100%', background: color, borderRadius: 4,
              transition: barTransition,
            }}
          />
        </div>
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, color: theme.ink }}>
        {entry.points_total}
      </span>
    </div>
  )
}

function EmptyRow({ theme, loading, error }: { theme: ThemeSurfaces; loading: boolean; error: string | null }) {
  const message = error ?? (loading ? 'Loading…' : 'Nobody was part of the challenge this period.')
  return (
    <p style={{ ...TYPE_SCALE.caption, color: theme.muted, padding: 14, margin: 0 }}>{message}</p>
  )
}

// ---------------------------------------------------------------------------
// Ribbon (spec §8.5 #2) — always scoped to `selectedMonth` regardless of the month/all-time tab;
// see Docs/PHASE3B_LOG.md for why (a ribbon fundamentally can't represent an all-time span at
// 390px, and neither the spec nor the mockup's illustrative demo data resolves this cleanly).
// ---------------------------------------------------------------------------

function RibbonSection({
  theme,
  selectedMonth,
  ribbon,
  users,
}: {
  theme: ThemeSurfaces
  selectedMonth: string
  ribbon: RibbonState
  users: User[]
}) {
  const emojiByUserId = new Map(users.map((u) => [u.id, u.emoji]))
  const rows: RibbonRow[] = (ribbon.data?.users ?? []).map((row) => ({
    ...row,
    emoji: emojiByUserId.get(row.user_id) ?? null,
  }))
  // Ambient motion (spec §11.2): the whole ribbon wipes in left to right on each fresh month's
  // data. `Ribbon` itself isn't a file this track owns, so the wipe wraps its rendered output
  // rather than reaching into its per-row internals — deleting the hook drops this wrapper `div`
  // (and the `ribbonMotion` line above it) with `<Ribbon .../>` unwrapped in its place.
  const ribbonMotion = useAmbientMotion(ribbon.data)

  return (
    <div style={{ marginTop: 22 }}>
      <SectionTitle theme={theme} kicker="signature">The ribbon</SectionTitle>
      {ribbon.loading && rows.length === 0 ? (
        <Card theme={theme} padded>
          <p style={{ ...TYPE_SCALE.caption, color: theme.muted, margin: 0 }}>Loading…</p>
        </Card>
      ) : ribbon.error ? (
        <Card theme={theme} padded>
          <p style={{ ...TYPE_SCALE.caption, color: theme.muted, margin: 0 }}>{ribbon.error}</p>
        </Card>
      ) : (
        <div
          style={{
            clipPath: ribbonMotion.enabled && !ribbonMotion.revealed
              ? 'inset(0 100% 0 0)'
              : 'inset(0 0 0 0)',
            transition: ribbonMotion.enabled ? 'clip-path 650ms cubic-bezier(.16,1,.3,1)' : 'none',
          }}
        >
          <Ribbon theme={theme} rows={rows} monthShortLabel={monthShortLabel(selectedMonth)} />
        </div>
      )}
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 8, lineHeight: 1.5 }}>
        One column per day, one segment per point. Consistency and collapse are visible without
        reading a single number.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Habit shape / radar (spec §8.5 #3) — lazy-loaded, Recharts-backed.
// ---------------------------------------------------------------------------

function RadarSection({
  theme,
  rules,
  leaderboard,
  selectedPersonIds,
  onTogglePerson,
}: {
  theme: ThemeSurfaces
  rules: Rule[]
  leaderboard: LeaderboardState
  selectedPersonIds: string[]
  onTogglePerson: (userId: string) => void
}) {
  const entries = leaderboard.data?.entries ?? []
  const people: RadarPerson[] = entries.map((e) => ({
    id: e.user_id, displayName: e.display_name, colorKey: e.color_key,
  }))
  const validSelectedIds = selectedPersonIds.filter((id) => people.some((p) => p.id === id))

  return (
    <div style={{ marginTop: 22 }}>
      <SectionTitle theme={theme} kicker="% of days hit">Habit shape</SectionTitle>
      <Card theme={theme} style={{ padding: '6px 0 10px' }}>
        {people.length === 0 || !leaderboard.ruleStats ? (
          <p style={{ ...TYPE_SCALE.caption, color: theme.muted, padding: 14, margin: 0 }}>
            {leaderboard.loading ? 'Loading…' : 'Nothing to show yet.'}
          </p>
        ) : (
          <Suspense fallback={<RadarFallback theme={theme} />}>
            <HabitRadar
              theme={theme}
              rules={rules}
              entries={leaderboard.ruleStats.entries}
              people={people}
              selectedIds={validSelectedIds}
            />
          </Suspense>
        )}
      </Card>

      <div className="flex flex-wrap" style={{ gap: 5, marginTop: 10 }}>
        {entries.map((entry) => (
          <PersonChip
            key={entry.user_id}
            theme={theme}
            person={{
              name: entry.display_name,
              emoji: entry.emoji ?? '',
              // src/types.ts's User.color_key is plain `string` (unvalidated at the DB layer),
              // same unchecked cast paletteEntryFor() itself makes internally when the key isn't
              // one of the 16 palette entries; PersonChip needs the narrower PersonColorKey type.
              color: entry.color_key as PersonColorKey,
            }}
            selected={validSelectedIds.includes(entry.user_id)}
            onClick={() => onTogglePerson(entry.user_id)}
          />
        ))}
      </div>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 9, lineHeight: 1.5 }}>
        Each spoke is the share of eligible days that habit was hit — not raw points, so Movement&rsquo;s
        two blocks don&rsquo;t distort the shape. You start on your own; add anyone to compare.
      </p>
    </div>
  )
}

const RADAR_FALLBACK_HEIGHT = 232

function RadarFallback({ theme }: { theme: ThemeSurfaces }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: RADAR_FALLBACK_HEIGHT }}
    >
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, margin: 0 }}>Loading chart…</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Consistency (spec §8.5 #4) — no dedicated endpoint; days_logged/avg_points_per_logged_day ride
// on the same LeaderboardEntry the leaderboard already fetched (src/types.ts's own doc comment
// says as much). The mockup never built this widget's UI (see Docs/PHASE3B_LOG.md) — spec wins.
// ---------------------------------------------------------------------------

function ConsistencySection({ theme, leaderboard }: { theme: ThemeSurfaces; leaderboard: LeaderboardState }) {
  const entries = leaderboard.data?.entries ?? []
  const sortedByDaysLogged = [...entries].sort((a, b) => b.days_logged - a.days_logged)

  return (
    <div style={{ marginTop: 22 }}>
      <SectionTitle theme={theme}>Consistency</SectionTitle>
      <Card theme={theme}>
        {sortedByDaysLogged.length === 0 ? (
          <EmptyRow theme={theme} loading={leaderboard.loading} error={leaderboard.error} />
        ) : (
          sortedByDaysLogged.map((entry, index) => (
            <ConsistencyRow key={entry.user_id} theme={theme} entry={entry} isFirst={index === 0} />
          ))
        )}
      </Card>
    </div>
  )
}

function ConsistencyRow({ theme, entry, isFirst }: { theme: ThemeSurfaces; entry: LeaderboardEntry; isFirst: boolean }) {
  const dayWord = entry.days_logged === 1 ? 'day' : 'days'
  return (
    <div
      className="flex items-center gap-2.5"
      style={{ padding: '10px 13px', borderTop: isFirst ? 'none' : `1px solid ${theme.hairline}` }}
    >
      <span style={{ fontSize: 14 }}>{entry.emoji}</span>
      <span className="flex-1 truncate" style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: theme.ink }}>
        {entry.display_name}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: theme.muted }}>
        {entry.days_logged} {dayWord} logged
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: theme.ink, minWidth: 62, textAlign: 'right' }}>
        {entry.avg_points_per_logged_day.toFixed(1)} avg
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weight (spec §8.5 #5, §13#9) — percentages only, never pounds. `WeightStatsEntry` has no
// `weight_lb` field at the type level (src/types.ts), so there is nothing here to accidentally
// render even if a future edit tried to.
// ---------------------------------------------------------------------------

function WeightSection({ theme, config, weight }: { theme: ThemeSurfaces; config: AppConfig; weight: WeightState }) {
  const entries = weight.data?.entries ?? []

  return (
    <div style={{ marginTop: 18 }}>
      <SectionTitle theme={theme} kicker={config.prize_final}>Percent lost</SectionTitle>
      <Card theme={theme}>
        {entries.length === 0 ? (
          <EmptyRow theme={theme} loading={weight.loading} error={weight.error} />
        ) : (
          entries.map((entry, index) => (
            <WeightRow key={entry.user_id} theme={theme} entry={entry} rank={index + 1} isFirst={index === 0} />
          ))
        )}
      </Card>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 10, lineHeight: 1.5 }}>
        Percentages only. Nobody&rsquo;s actual weight appears here, or anywhere outside their own page.
      </p>
    </div>
  )
}

function WeightRow({
  theme,
  entry,
  rank,
  isFirst,
}: {
  theme: ThemeSurfaces
  entry: WeightStatsEntry
  rank: number
  isFirst: boolean
}) {
  const color = paletteEntryFor(entry.color_key).hex
  // Spec §13#3: a gain shows as a negative number (toFixed already prints the "-") and sorts
  // last — no separate treatment beyond de-emphasizing the color, which the mockup also does.
  const isGain = entry.percent_lost < 0

  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: '12px 14px', borderTop: isFirst ? 'none' : `1px solid ${theme.hairline}` }}
    >
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: theme.muted, width: 14 }}>{rank}</span>
      <span style={{ fontSize: 14 }}>{entry.emoji}</span>
      <span className="flex-1 truncate" style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, color: theme.ink }}>
        {entry.display_name}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO, fontSize: 14, fontWeight: 600,
          color: isGain ? theme.muted : color,
        }}
      >
        {entry.percent_lost.toFixed(1)}%
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Month picker sheet — spec §8.5: "tapping [the month label] opens a picker for earlier months."
// ---------------------------------------------------------------------------

function MonthPickerSheet({
  theme,
  months,
  selectedMonth,
  onPick,
  onDismiss,
}: {
  theme: ThemeSurfaces
  months: string[]
  selectedMonth: string
  onPick: (monthKey: string) => void
  onDismiss: () => void
}) {
  const reversedMonths = [...months].reverse() // most recent first

  return (
    <Sheet theme={theme} onDismiss={onDismiss}>
      <h3 style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink, marginBottom: 12 }}>Choose a month</h3>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {reversedMonths.map((monthKey) => (
          <MonthPickerRow
            key={monthKey}
            theme={theme}
            monthKey={monthKey}
            selected={monthKey === selectedMonth}
            onPick={onPick}
          />
        ))}
      </div>
      <div className="flex" style={{ gap: 8, marginTop: 14 }}>
        <SheetButton theme={theme} label="Cancel" onClick={onDismiss} primary={false} />
      </div>
    </Sheet>
  )
}

function MonthPickerRow({
  theme,
  monthKey,
  selected,
  onPick,
}: {
  theme: ThemeSurfaces
  monthKey: string
  selected: boolean
  onPick: (monthKey: string) => void
}) {
  function handleClick() {
    onPick(monthKey)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left flex items-center"
      style={{
        minHeight: 44, // spec §11.1 quality floor: 44px minimum tap targets
        padding: '0 6px',
        borderRadius: RADIUS.ruleRowIconTile,
        background: selected ? theme.surfaceAlt : 'transparent',
        border: 'none',
        fontFamily: FONT_BODY,
        fontSize: 14.5,
        fontWeight: selected ? 700 : 500,
        color: theme.ink,
        cursor: 'pointer',
      }}
    >
      {monthLongLabel(monthKey)}
    </button>
  )
}
