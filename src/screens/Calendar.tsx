// Calendar — spec §8.4. Month grid with per-date pip meters (denominators always come from
// `maxPointsForDate`, never hardcoded per CLAUDE.md), the null-vs-zero-day distinction (the
// existing `Pips` component already implements this exactly — see its own header comment), a
// weight glyph on the viewer's own calendar only, and a person switcher for browsing anyone's
// history. Structure/visual detail ported from HealthChallengeMockup.jsx's CalendarScreen, which
// is the mockup's own documented authority for the grid, the pip treatment, and the help caption.
import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
} from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Scale } from 'lucide-react'
import { getLogs, getWeights, ApiError } from '../api'
import { Card } from '../components/Card'
import { Pips } from '../components/Pips'
import { Sheet } from '../components/Sheet'
import { PendingIndicator } from '../components/PendingIndicator'
import type { PersonSummary } from '../components/person'
import { queuedPutWeight } from '../lib/offline/queue'
import { useAmbientMotion } from '../lib/useAmbientMotion'
import { WeightEntrySheet } from './WeightDetail'
import {
  compareDates,
  daysBetween,
  formatDisplayDate,
  getMonthBoundaries,
  getMonthKey,
  getWeekdayIndex,
  maxPointsForDate,
  stepMonthKey,
} from '../lib/dates'
import {
  calendarCellTintStep,
  desat,
  FONT_BODY,
  FONT_MONO,
  paletteEntryFor,
  RADIUS,
  SPACING,
  tint,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'
import type { AppConfig, LogEntry, Rule, User } from '../types'

interface CalendarScreenProps {
  theme: ThemeSurfaces
  config: AppConfig
  serverToday: string
  /** Rules effective "today," per bootstrap's contract — same documented limitation as
   * Today.tsx: a rule whose effective window starts or ends mid-month won't be reflected for
   * dates on the other side of that boundary within this grid. See Docs/PHASE3A_LOG.md. */
  rules: Rule[]
  users: User[]
  ownUserId: string
  /** Deep-link only, mirrors Today.tsx's `?u=` pattern — defaults to ownUserId when omitted or
   * invalid. Calendar owns its own in-screen person switcher for changing this afterward. */
  initialUserId?: string
  /** Bootstrap's current-month logs (every user), spec §9 — seeds the cache for the first paint. */
  initialLogs: LogEntry[]
  /** Spec §8.4: "Tapping a day opens that day's log, respecting §3.4." Calendar doesn't own the
   * Today tab, so it hands the (date, userId) pair to the orchestrator to switch tabs there. */
  onOpenDay: (date: string, userId: string) => void
  /** Spec §8.6: the full sparkline/percent/entry-list screen, reached from here too — shown only
   * for the viewer's own person, when `in_weight_challenge` is set. */
  onOpenWeightDetail: (userId: string) => void
}

const CACHE_KEY_SEPARATOR = ':'
const SWIPE_THRESHOLD_PX = 40
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function cacheKeyFor(userId: string, monthKey: string): string {
  return `${userId}${CACHE_KEY_SEPARATOR}${monthKey}`
}

function dateStringForDay(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

function seedMonthCache(initialLogs: LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>()
  for (const entry of initialLogs) {
    const key = cacheKeyFor(entry.user_id, getMonthKey(entry.log_date))
    const list = map.get(key) ?? []
    list.push(entry)
    map.set(key, list)
  }
  return map
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
})

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)))
}

export function CalendarScreen({
  theme,
  config,
  serverToday,
  rules,
  users,
  ownUserId,
  initialUserId,
  initialLogs,
  onOpenDay,
  onOpenWeightDetail,
}: CalendarScreenProps) {
  const isInitialUserValid = initialUserId !== undefined
    && users.some((user) => user.id === initialUserId)
  const [viewedUserId, setViewedUserId] = useState(
    isInitialUserValid ? (initialUserId as string) : ownUserId,
  )
  const [monthKey, setMonthKey] = useState(getMonthKey(serverToday))
  const [logsByMonth, setLogsByMonth] = useState<Map<string, LogEntry[]>>(() => (
    seedMonthCache(initialLogs)
  ))
  // Keyed by log_date -> weight_lb, for the viewer's own person only — this is the ONLY weight
  // data Calendar ever holds, and it never fetches anyone else's (spec §8.4: the glyph doesn't
  // even render on someone else's calendar). Enough to render the glyph AND correctly prefill the
  // quick-edit sheet when correcting an existing entry.
  const [ownWeightByDate, setOwnWeightByDate] = useState<Map<string, number>>(new Map())
  const [showPersonSheet, setShowPersonSheet] = useState(false)
  const [weightSheetDate, setWeightSheetDate] = useState<string | null>(null)
  const [weightError, setWeightError] = useState<string | null>(null)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const viewedUser = users.find((user) => user.id === viewedUserId)
  const ownUser = users.find((user) => user.id === ownUserId)
  const isOwn = viewedUserId === ownUserId

  const cacheKey = cacheKeyFor(viewedUserId, monthKey)
  const monthEntries = useMemo(
    () => logsByMonth.get(cacheKey) ?? [],
    [logsByMonth, cacheKey],
  )

  // Fetch a month's logs the first time it's viewed for this person — mirrors Today.tsx's cache,
  // duplicated locally rather than imported since Today.tsx is not this track's file to change.
  useEffect(() => {
    if (logsByMonth.has(cacheKey)) return
    let cancelled = false
    const { start, end } = getMonthBoundaries(monthKey)
    getLogs({ userId: viewedUserId, from: start, to: end })
      .then((entries) => {
        if (cancelled) return
        setLogsByMonth((prev) => new Map(prev).set(cacheKey, entries))
      })
      .catch(() => {
        // Best-effort: an empty cache entry still renders an honest (if momentarily incomplete)
        // grid rather than blocking the screen.
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, monthKey, viewedUserId, logsByMonth])

  // The weight glyph only ever shows on the viewer's own calendar (spec §8.4), so this is the
  // only weight fetch Calendar ever makes — never for anyone else's userId.
  useEffect(() => {
    let cancelled = false
    getWeights(ownUserId)
      .then((entries) => {
        if (cancelled) return
        setOwnWeightByDate(new Map(entries.map((entry) => [entry.log_date, entry.weight_lb])))
      })
      .catch(() => {
        // Best-effort: the glyph simply won't render until the next successful fetch.
      })
    return () => {
      cancelled = true
    }
  }, [ownUserId])

  // Ambient motion (spec §11.2): pips stagger in fresh each time the viewed month changes. Called
  // unconditionally, alongside the other hooks above, so the early return below never skips it.
  const ambientMotion = useAmbientMotion(monthKey)

  if (!viewedUser || !ownUser) {
    return <MissingPersonNotice theme={theme} />
  }

  const color = paletteEntryFor(viewedUser.color_key)
  const viewedPerson: PersonSummary = {
    name: viewedUser.display_name,
    emoji: viewedUser.emoji ?? '🙂',
    color: viewedUser.color_key as PersonSummary['color'],
  }

  const { start: monthStart, end: monthEnd } = getMonthBoundaries(monthKey)
  const totalDays = daysBetween(monthStart, monthEnd) + 1
  const leadBlanks = getWeekdayIndex(monthStart)
  const cells: Array<number | null> = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, index) => index + 1),
  ]

  const stats = computeMonthStats(monthEntries)
  const showWeightLink = isOwn && viewedUser.in_weight_challenge

  // Bounded to the challenge window — swiping/tapping past it would only ever show empty months,
  // and the window is exactly what `config` (otherwise unused by this screen) is for.
  const earliestMonthKey = getMonthKey(config.challenge_start)
  const latestMonthKey = getMonthKey(config.challenge_end)

  function handlePrevMonth() {
    setMonthKey((prev) => clampMonthKey(stepMonthKey(prev, -1), earliestMonthKey, latestMonthKey))
  }

  function handleNextMonth() {
    setMonthKey((prev) => clampMonthKey(stepMonthKey(prev, 1), earliestMonthKey, latestMonthKey))
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    setTouchStartX(event.touches[0]?.clientX ?? null)
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX === null) return
    const endX = event.changedTouches[0]?.clientX ?? touchStartX
    const deltaX = endX - touchStartX
    setTouchStartX(null)
    if (deltaX > SWIPE_THRESHOLD_PX) handlePrevMonth()
    if (deltaX < -SWIPE_THRESHOLD_PX) handleNextMonth()
  }

  function handleOpenSwitcher() {
    setShowPersonSheet(true)
  }

  function handleSelectPerson(userId: string) {
    setViewedUserId(userId)
    setShowPersonSheet(false)
  }

  function handleTapDay(date: string) {
    onOpenDay(date, viewedUserId)
  }

  function handleTapWeightGlyph(date: string) {
    setWeightSheetDate(date)
  }

  async function handleSaveWeight(weightLb: number) {
    if (!weightSheetDate) return
    const date = weightSheetDate
    try {
      const result = await queuedPutWeight(ownUserId, date, weightLb, ownUserId)
      // Optimistic either way (spec §10): a queued result has no server-confirmed value to read
      // back, so the glyph and the entered value are applied from what the person just typed —
      // exactly the value `queuedPutWeight` already persisted to the offline queue.
      const savedWeightLb = result.status === 'synced' ? result.data.weight_lb : weightLb
      setOwnWeightByDate((prev) => new Map(prev).set(date, savedWeightLb))
      setWeightError(null)
      setWeightSheetDate(null)
    } catch (error) {
      setWeightError(error instanceof ApiError ? error.message : 'Could not save. Try again.')
    }
  }

  return (
    <div>
      <CalendarHeader
        theme={theme}
        monthLabel={formatMonthLabel(monthKey)}
        viewedPerson={viewedPerson}
        isOwn={isOwn}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onOpenSwitcher={handleOpenSwitcher}
      />

      <div className="px-4" style={{ paddingTop: 4, paddingBottom: 24 }}>
        <MonthStatsLine theme={theme} stats={stats} />

        {weightError && <ErrorNotice message={weightError} />}
        <PendingIndicator theme={theme} />

        <Card theme={theme} padded>
          <WeekdayLabelsRow theme={theme} />
          <div
            className="grid grid-cols-7"
            style={{ gap: SPACING.calendarCellGap }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {cells.map((day, index) => {
              if (day === null) return <div key={`blank-${index}`} />
              const date = dateStringForDay(monthKey, day)
              return (
                <DayCell
                  key={date}
                  theme={theme}
                  day={day}
                  date={date}
                  points={computeDayPoints(monthEntries, date)}
                  max={maxPointsForDate(rules, date)}
                  color={color.hex}
                  isToday={date === serverToday}
                  isFuture={compareDates(date, serverToday) > 0}
                  hasWeight={isOwn && ownWeightByDate.has(date)}
                  onTapDay={handleTapDay}
                  onTapWeight={handleTapWeightGlyph}
                  staggerIndex={day}
                  ambientEnabled={ambientMotion.enabled}
                  ambientRevealed={ambientMotion.revealed}
                />
              )
            })}
          </div>
        </Card>

        <CalendarHelpCaption theme={theme} />

        {showWeightLink && (
          <WeightSummaryLink
            theme={theme}
            onTap={() => onOpenWeightDetail(ownUserId)}
          />
        )}
      </div>

      {showPersonSheet && (
        <PersonSwitcherSheet
          theme={theme}
          users={users}
          viewedUserId={viewedUserId}
          onSelect={handleSelectPerson}
          onDismiss={() => setShowPersonSheet(false)}
        />
      )}

      {weightSheetDate && (
        <WeightEntrySheet
          theme={theme}
          dateLabel={formatDisplayDate(weightSheetDate)}
          initialWeightLb={ownWeightByDate.get(weightSheetDate) ?? DEFAULT_QUICK_WEIGHT_LB}
          color={color.hex}
          onColor={color.on}
          onSave={handleSaveWeight}
          onDismiss={() => setWeightSheetDate(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Null means the day was never touched (spec §8.4) — distinct from a day whose entries sum to
 * zero. Any log_entries row at all, regardless of its point value, counts as "touched." */
function computeDayPoints(entries: LogEntry[], date: string): number | null {
  const dayEntries = entries.filter((entry) => entry.log_date === date)
  if (dayEntries.length === 0) return null
  return dayEntries.reduce((sum, entry) => sum + entry.points, 0)
}

interface MonthStats {
  totalPoints: number
  daysLogged: number
  bestDay: number
}

function computeMonthStats(entries: LogEntry[]): MonthStats {
  const byDate = new Map<string, number>()
  for (const entry of entries) {
    byDate.set(entry.log_date, (byDate.get(entry.log_date) ?? 0) + entry.points)
  }
  const dayTotals = [...byDate.values()]
  return {
    totalPoints: dayTotals.reduce((sum, points) => sum + points, 0),
    daysLogged: byDate.size,
    bestDay: dayTotals.length > 0 ? Math.max(...dayTotals) : 0,
  }
}

// Only used as a fallback when opening the quick-edit sheet for a date with no cached weight yet
// (i.e. logging a brand new entry, not correcting one — the glyph, and therefore the sheet's
// prefill, only ever appears for dates that already have a real value).
const DEFAULT_QUICK_WEIGHT_LB = 150

/** Keeps month navigation inside the challenge window — spec §6's dates are the only ones with
 * real content to show. */
function clampMonthKey(monthKey: string, min: string, max: string): string {
  if (monthKey < min) return min
  if (monthKey > max) return max
  return monthKey
}

// ---------------------------------------------------------------------------
// Header, stats, grid chrome
// ---------------------------------------------------------------------------

function CalendarHeader({
  theme, monthLabel, viewedPerson, isOwn, onPrevMonth, onNextMonth, onOpenSwitcher,
}: {
  theme: ThemeSurfaces
  monthLabel: string
  viewedPerson: PersonSummary
  isOwn: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  onOpenSwitcher: () => void
}) {
  return (
    <div className="px-4 flex items-center justify-between" style={{ paddingTop: 16 }}>
      <div className="flex items-center gap-1">
        <MonthNavButton theme={theme} direction="prev" onClick={onPrevMonth} />
        <h2
          style={{
            ...TYPE_SCALE.screenTitle, color: theme.ink, minWidth: 168, textAlign: 'center',
          }}
        >
          {monthLabel}
        </h2>
        <MonthNavButton theme={theme} direction="next" onClick={onNextMonth} />
      </div>
      <PersonSwitcherChip theme={theme} person={viewedPerson} isOwn={isOwn} onClick={onOpenSwitcher} />
    </div>
  )
}

function MonthNavButton({
  theme, direction, onClick,
}: {
  theme: ThemeSurfaces
  direction: 'prev' | 'next'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous month' : 'Next month'}
      className="flex items-center justify-center"
      style={{
        width: 30, height: 30, borderRadius: RADIUS.full,
        border: `1px solid ${theme.hairline}`, background: theme.surfaceAlt,
        color: theme.ink, cursor: 'pointer',
      }}
    >
      {direction === 'prev' ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
    </button>
  )
}

function PersonSwitcherChip({
  theme, person, isOwn, onClick,
}: {
  theme: ThemeSurfaces
  person: PersonSummary
  isOwn: boolean
  onClick: () => void
}) {
  const base = paletteEntryFor(person.color).hex
  const background = isOwn ? base : desat(base, theme)
  const on = isOwn ? paletteEntryFor(person.color).on : theme.ink
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5"
      style={{
        padding: '4px 8px 4px 4px', borderRadius: RADIUS.full, border: 'none', cursor: 'pointer',
        background: theme.surfaceAlt,
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 24, height: 24, borderRadius: RADIUS.full, background, fontSize: 12, color: on,
        }}
      >
        {person.emoji}
      </span>
      <span style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: theme.ink }}>
        {person.name}
      </span>
      <ChevronDown size={13} color={theme.muted} />
    </button>
  )
}

function MonthStatsLine({ theme, stats }: { theme: ThemeSurfaces; stats: MonthStats }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO, fontSize: 11, color: theme.muted, margin: '10px 0 14px',
        letterSpacing: '0.04em',
      }}
    >
      {stats.totalPoints} PTS · {stats.daysLogged} DAYS LOGGED · BEST DAY {stats.bestDay}
    </div>
  )
}

function WeekdayLabelsRow({ theme }: { theme: ThemeSurfaces }) {
  return (
    <div className="grid grid-cols-7" style={{ marginBottom: 6 }}>
      {WEEKDAY_LABELS.map((label, index) => (
        <div
          key={index}
          className="text-center"
          style={{ fontFamily: FONT_MONO, fontSize: 10, color: theme.muted, fontWeight: 600 }}
        >
          {label}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day cell
// ---------------------------------------------------------------------------

// Ambient motion (spec §11.2): pips stagger in on month load. Capping the stagger keeps a
// 31/28/30-day grid's total reveal under half a second rather than trailing off cell by cell.
const AMBIENT_STAGGER_STEP_MS = 14
const AMBIENT_STAGGER_MAX_STEPS = 24
const AMBIENT_REVEAL_DURATION_MS = 220

function DayCell({
  theme, day, date, points, max, color, isToday, isFuture, hasWeight, onTapDay, onTapWeight,
  staggerIndex = 0, ambientEnabled = false, ambientRevealed = true,
}: {
  theme: ThemeSurfaces
  day: number
  date: string
  points: number | null
  max: number
  color: string
  isToday: boolean
  isFuture: boolean
  hasWeight: boolean
  onTapDay: (date: string) => void
  onTapWeight: (date: string) => void
  /** Deleting `src/lib/useAmbientMotion.ts`: drop these three props here and at the call site,
   *  and this cell renders exactly as it did before ambient motion existed — nothing else here
   *  depends on them. */
  staggerIndex?: number
  ambientEnabled?: boolean
  ambientRevealed?: boolean
}) {
  const wasTouched = points !== null
  const isPerfect = wasTouched && max > 0 && points === max
  const tintStep = wasTouched ? calendarCellTintStep(points, max) : 0
  const background = wasTouched ? tint(color, theme, tintStep) : 'transparent'
  const border = isToday
    ? `1.5px solid ${color}`
    : `1px solid ${wasTouched ? theme.hairline : 'transparent'}`
  const futureOpacity = isFuture ? 0.35 : 1
  const ambientDelayMs = Math.min(staggerIndex, AMBIENT_STAGGER_MAX_STEPS) * AMBIENT_STAGGER_STEP_MS

  function handleClick() {
    onTapDay(date)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onTapDay(date)
  }

  function handleWeightClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    onTapWeight(date)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="flex flex-col items-center justify-center relative"
      style={{
        height: SPACING.calendarCellSize,
        borderRadius: RADIUS.calendarCell,
        border,
        background,
        opacity: ambientEnabled && !ambientRevealed ? 0 : futureOpacity,
        transform: ambientEnabled && !ambientRevealed ? 'translateY(4px) scale(0.94)' : 'none',
        transition: ambientEnabled
          ? `opacity ${AMBIENT_REVEAL_DURATION_MS}ms ease ${ambientDelayMs}ms, `
            + `transform ${AMBIENT_REVEAL_DURATION_MS}ms ease ${ambientDelayMs}ms`
          : 'none',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11.5,
          fontWeight: isPerfect ? 700 : 500,
          color: wasTouched ? theme.ink : theme.muted,
          marginBottom: 3,
        }}
      >
        {day}
      </span>
      <Pips theme={theme} points={isFuture ? null : points} max={max} color={color} />
      {hasWeight && (
        <button
          type="button"
          onClick={handleWeightClick}
          aria-label="Edit weight for this date"
          className="absolute flex items-center justify-center"
          style={{
            top: 2, right: 2, width: 15, height: 15, borderRadius: RADIUS.full,
            background: theme.surface, border: 'none', padding: 0, cursor: 'pointer',
          }}
        >
          <Scale size={9} color={color} />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Person switcher sheet
// ---------------------------------------------------------------------------

function PersonSwitcherSheet({
  theme, users, viewedUserId, onSelect, onDismiss,
}: {
  theme: ThemeSurfaces
  users: User[]
  viewedUserId: string
  onSelect: (userId: string) => void
  onDismiss: () => void
}) {
  const sorted = [...users].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <Sheet theme={theme} onDismiss={onDismiss}>
      <h2 style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink, marginBottom: 12 }}>
        View calendar
      </h2>
      <div className="flex flex-col" style={{ gap: 4 }}>
        {sorted.map((user) => (
          <PersonSwitcherRow
            key={user.id}
            theme={theme}
            user={user}
            selected={user.id === viewedUserId}
            onClick={() => onSelect(user.id)}
          />
        ))}
      </div>
    </Sheet>
  )
}

function PersonSwitcherRow({
  theme, user, selected, onClick,
}: {
  theme: ThemeSurfaces
  user: User
  selected: boolean
  onClick: () => void
}) {
  const color = paletteEntryFor(user.color_key)
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3"
      style={{
        padding: '10px 12px', borderRadius: RADIUS.calendarCell, border: 'none', cursor: 'pointer',
        background: selected ? tint(color.hex, theme, 0.10) : 'transparent',
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 30, height: 30, borderRadius: RADIUS.full, background: color.hex, fontSize: 14,
        }}
      >
        {user.emoji ?? '🙂'}
      </span>
      <span
        style={{
          fontFamily: FONT_BODY, fontSize: 14, fontWeight: selected ? 700 : 500, color: theme.ink,
        }}
      >
        {user.display_name}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Footer chrome
// ---------------------------------------------------------------------------

function CalendarHelpCaption({ theme }: { theme: ThemeSurfaces }) {
  return (
    <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 12 }}>
      An outlined cell with hollow pips is a day logged at zero. A cell with no pips was never
      opened. That difference is the whole point of the treatment.
    </p>
  )
}

function WeightSummaryLink({ theme, onTap }: { theme: ThemeSurfaces; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-3"
      style={{
        marginTop: 12, padding: '13px 14px', borderRadius: RADIUS.calendarCell,
        background: theme.surface, border: `1px solid ${theme.hairline}`, cursor: 'pointer',
      }}
    >
      <Scale size={17} color={theme.muted} />
      <span
        className="flex-1 text-left"
        style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: theme.muted }}
      >
        Weight history
      </span>
      <ChevronRight size={16} color={theme.muted} />
    </button>
  )
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <p role="alert" style={{ ...TYPE_SCALE.caption, color: '#E5484D', marginBottom: 10 }}>
      {message}
    </p>
  )
}

function MissingPersonNotice({ theme }: { theme: ThemeSurfaces }) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-6"
      style={{ background: theme.paper }}
    >
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, textAlign: 'center' }}>
        This person could not be found.
      </p>
    </div>
  )
}
