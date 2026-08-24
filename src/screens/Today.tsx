// The Today screen — spec §8.3, the primary screen. THE GOVERNING CONSTRAINT: daily logging must
// take under ten seconds on a phone. Opens on today's date for the device's own person; tapping a
// row toggles instantly (optimistic), writes in the background, and — on your own page, for
// today only — escalates a celebration per spec §11.2. Structure and exact visual detail (row
// height, checkbox shape, perfect-day banner) are ported from HealthChallengeMockup.jsx's
// TodayScreen, which is the mockup's own documented authority for this screen.
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from 'react'
import { Check, ChevronRight, Flame, Scale } from 'lucide-react'
import { putLog, getLogs, ApiError } from '../api'
import { Sheet, SheetButton } from '../components/Sheet'
import { Banner } from '../components/Banner'
import type { PersonSummary } from '../components/person'
import { iconForRule } from '../lib/ruleIcons'
import {
  originFromPointerEvent,
  playCelebration,
  recordCelebratedRatio,
  shouldCelebrate,
} from '../lib/celebration'
import {
  addDays,
  compareDates,
  formatDisplayDate,
  getEditableDateRange,
  getMonthBoundaries,
  getMonthKey,
  isDateEditable,
  maxPointsForDate,
} from '../lib/dates'
import {
  FONT_BODY,
  FONT_MONO,
  MOTION,
  motionOrInstant,
  paletteEntryFor,
  RADIUS,
  SPACING,
  TINT_STEP_CHECKED_ROW,
  TINT_STEP_PERFECT_DAY_BORDER,
  TINT_STEP_PERFECT_DAY_FILL,
  tint,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'
import type {
  AppConfig,
  CounterRuleConfig,
  DayLogState,
  LogEntry,
  Rule,
  ThresholdRuleConfig,
  User,
} from '../types'

interface TodayScreenProps {
  theme: ThemeSurfaces
  reducedMotion: boolean
  config: AppConfig
  serverToday: string
  /** Rules effective "now," per spec §9's bootstrap contract. Known Phase 2a limitation: if a
   * rule's effective window starts or ends between `serverToday` and a backfilled/future date
   * being viewed, this list won't reflect that — bootstrap only ever returns today's set. The
   * server (PUT /api/logs) always scores correctly regardless; only this client-side row list can
   * momentarily be stale across a rule boundary. See Docs/PHASE2A_LOG.md. */
  rules: Rule[]
  users: User[]
  ownUserId: string
  /** Defaults to `ownUserId`. Deep-link only (`/?u=<id>`) in this phase — Calendar/Standings
   * (Phase 3) own the real in-app entry point for viewing someone else's page. */
  viewedUserId: string
  /** Bootstrap's current-month logs, spec §9 — seeds the cache so the first render needs no
   * extra round trip. */
  initialLogs: LogEntry[]
  onSwitchPerson: () => void
}

const EMOJI_FALLBACK = '🙂'
const GENERIC_SAVE_ERROR = 'Could not save. Check your connection and try again.'
const AMBER_BAR_TEXT = 'not your log'
const CACHE_KEY_SEPARATOR = ':'

function cacheKeyFor(userId: string, monthKey: string): string {
  return `${userId}${CACHE_KEY_SEPARATOR}${monthKey}`
}

export function TodayScreen({
  theme,
  reducedMotion,
  config,
  serverToday,
  rules,
  users,
  ownUserId,
  viewedUserId,
  initialLogs,
  onSwitchPerson,
}: TodayScreenProps) {
  const [date, setDate] = useState(serverToday)
  const [logsByMonth, setLogsByMonth] = useState<Map<string, LogEntry[]>>(() => (
    seedMonthCache(initialLogs)
  ))
  const [unlocked, setUnlocked] = useState(false)
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false)
  const [showWeightSheet, setShowWeightSheet] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isOwn = viewedUserId === ownUserId
  const viewedUser = users.find((user) => user.id === viewedUserId)
  const ownUser = users.find((user) => user.id === ownUserId)

  const monthKey = getMonthKey(date)
  const cacheKey = cacheKeyFor(viewedUserId, monthKey)
  const monthEntries = useMemo(
    () => logsByMonth.get(cacheKey) ?? [],
    [logsByMonth, cacheKey],
  )

  // A rule's effective window (and therefore max points) can only change per calendar date, not
  // per view — reset any stale unlock/error state whenever the viewed date or person changes.
  useEffect(() => {
    setUnlocked(false)
    setSaveError(null)
  }, [date, viewedUserId])

  // Fetch a month's logs the first time it's viewed for this person; bootstrap only ever seeds
  // the current month (spec §9), so day navigation across a month boundary needs a fresh call.
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
        // Best-effort: leave the cache empty for this month rather than blocking the screen.
        // The user still sees an accurate picture the moment connectivity returns.
      })
    return () => {
      cancelled = true
    }
  }, [cacheKey, monthKey, viewedUserId, logsByMonth])

  if (!viewedUser || !ownUser) {
    return <MissingPersonNotice theme={theme} />
  }

  const dayEntries = monthEntries.filter((entry) => entry.log_date === date)
  const dayValues: Record<string, number> = {}
  for (const entry of dayEntries) dayValues[entry.rule_key] = entry.value
  const dayPointsTotal = dayEntries.reduce((sum, entry) => sum + entry.points, 0)
  const maxPoints = maxPointsForDate(rules, date)
  const loggedDaysInMonth = new Set(monthEntries.map((entry) => entry.log_date)).size
  const isComplete = maxPoints > 0 && dayPointsTotal === maxPoints

  const isFuture = compareDates(date, serverToday) > 0
  const dateInRange = isDateEditable(date, config, serverToday)
  const canEdit = dateInRange && (isOwn || unlocked)
  const viewedPalette = paletteEntryFor(viewedUser.color_key)
  const viewedPerson: PersonSummary = {
    name: viewedUser.display_name,
    emoji: viewedUser.emoji ?? EMOJI_FALLBACK,
    color: viewedUser.color_key as PersonSummary['color'],
  }

  function handlePrevDay() {
    stepDate(-1)
  }

  function handleNextDay() {
    stepDate(1)
  }

  function stepDate(deltaDays: number) {
    const candidate = addDays(date, deltaDays)
    const { min, max } = getEditableDateRange(config, serverToday)
    // A day nav step never lands outside the editable window — the common case (§8.3) is "I
    // forgot yesterday," not exploring dead space before the challenge or past the future cap.
    if (compareDates(candidate, min) < 0 || compareDates(candidate, max) > 0) return
    setDate(candidate)
  }

  async function submitRuleValue(rule: Rule, rawValue: number, pointerEvent?: MouseEvent) {
    if (!canEdit) return
    const previousMap = logsByMonth
    const previousPointsTotal = dayPointsTotal

    const optimisticEntry: LogEntry = {
      user_id: viewedUserId,
      log_date: date,
      rule_key: rule.key,
      value: rawValue,
      points: estimateRulePoints(rule, rawValue),
      updated_at: new Date().toISOString(),
    }
    setLogsByMonth((prev) => upsertEntryInCache(prev, cacheKey, optimisticEntry))
    setSaveError(null)

    try {
      const response = await putLog(viewedUserId, date, { [rule.key]: rawValue }, ownUserId)
      setLogsByMonth((prev) => replaceDayInCache(prev, cacheKey, date, response))
      const turnedOn = response.points_total > previousPointsTotal
      // Spec §11.2: "Backfilling a past day plays the full sequence; it's the same
      // accomplishment." So this is deliberately NOT gated on the date being today —
      // only on the page being your own and the score actually going up. The
      // once-per-tier-per-date dedup inside celebrateIfNewTier is what stops replays.
      if (isOwn && turnedOn) {
        celebrateIfNewTier(response, pointerEvent)
      }
    } catch (error) {
      setLogsByMonth(previousMap)
      setSaveError(error instanceof ApiError ? error.message : GENERIC_SAVE_ERROR)
    }
  }

  function celebrateIfNewTier(response: DayLogState, pointerEvent?: MouseEvent) {
    if (response.max_points_for_date <= 0) return
    const ratio = response.points_total / response.max_points_for_date
    if (!shouldCelebrate(date, ratio)) return
    playCelebration({
      pointsAfter: response.points_total,
      maxPointsForDay: response.max_points_for_date,
      color: viewedPalette.hex,
      origin: pointerEvent ? originFromPointerEvent(pointerEvent) : undefined,
    })
    recordCelebratedRatio(date, ratio)
  }

  function handleUnlockTap() {
    setShowUnlockConfirm(true)
  }

  function confirmUnlock() {
    setUnlocked(true)
    setShowUnlockConfirm(false)
  }

  function cancelUnlock() {
    setShowUnlockConfirm(false)
  }

  return (
    <div>
      <Banner
        theme={theme}
        person={viewedPerson}
        isOwn={isOwn}
        dateLabel={formatDisplayDate(date)}
        navLabel={navLabelFor(date, serverToday)}
        points={dayPointsTotal}
        max={maxPoints}
        isFuture={isFuture}
        onPrev={handlePrevDay}
        onNext={handleNextDay}
        onAvatarLongPress={onSwitchPerson}
      />

      {!isOwn && !unlocked && (
        <UnlockPrompt theme={theme} name={viewedUser.display_name} onTap={handleUnlockTap} />
      )}
      {!isOwn && unlocked && (
        <EditingAsBar name={viewedUser.display_name} />
      )}

      <div className="px-4" style={{ paddingTop: 14, paddingBottom: 20 }}>
        {saveError && <SaveErrorNotice message={saveError} />}

        <RuleList
          theme={theme}
          reducedMotion={reducedMotion}
          rules={rules}
          dayValues={dayValues}
          color={viewedPalette.hex}
          onColor={viewedPalette.on}
          editable={canEdit}
          onSubmit={submitRuleValue}
        />

        {isComplete && isOwn && (
          <PerfectDayBanner theme={theme} color={viewedPalette.hex} max={maxPoints} />
        )}

        {viewedUser.in_weight_challenge && isOwn && (
          <WeightRow theme={theme} onTap={() => setShowWeightSheet(true)} />
        )}

        <MonthLoggedCaption theme={theme} count={loggedDaysInMonth} monthKey={monthKey} />
      </div>

      {showUnlockConfirm && (
        <UnlockConfirmSheet
          theme={theme}
          targetName={viewedUser.display_name}
          ownName={ownUser.display_name}
          onConfirm={confirmUnlock}
          onCancel={cancelUnlock}
        />
      )}
      {showWeightSheet && (
        <WeightComingSoonSheet theme={theme} onDismiss={() => setShowWeightSheet(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function navLabelFor(date: string, serverToday: string): string {
  const comparison = compareDates(date, serverToday)
  if (comparison === 0) return 'Today'
  return comparison < 0 ? 'Earlier' : 'Logging ahead'
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

function upsertEntryInCache(
  map: Map<string, LogEntry[]>,
  cacheKey: string,
  entry: LogEntry,
): Map<string, LogEntry[]> {
  const next = new Map(map)
  const existing = next.get(cacheKey) ?? []
  const withoutThisRule = existing.filter(
    (row) => !(row.log_date === entry.log_date && row.rule_key === entry.rule_key),
  )
  next.set(cacheKey, [...withoutThisRule, entry])
  return next
}

function replaceDayInCache(
  map: Map<string, LogEntry[]>,
  cacheKey: string,
  date: string,
  dayState: DayLogState,
): Map<string, LogEntry[]> {
  const next = new Map(map)
  const existing = next.get(cacheKey) ?? []
  const withoutThisDate = existing.filter((row) => row.log_date !== date)
  const nowIso = new Date().toISOString()
  const freshEntries: LogEntry[] = Object.keys(dayState.values).map((ruleKey) => ({
    user_id: dayState.user_id,
    log_date: dayState.log_date,
    rule_key: ruleKey,
    value: dayState.values[ruleKey],
    points: dayState.points[ruleKey],
    updated_at: nowIso,
  }))
  next.set(cacheKey, [...withoutThisDate, ...freshEntries])
  return next
}

const BOOLEAN_CHECKED = 1
const BOOLEAN_UNCHECKED = 0

// Client-side estimate only, for the instant optimistic fill — the server's computeDayScore
// (functions/_lib/scoring.ts) is always the source of truth and overwrites this within one round
// trip. Mirrors that function's per-type logic minus clamping (nothing here is ever persisted).
function estimateRulePoints(rule: Rule, value: number): number {
  if (rule.type === 'boolean') {
    return value === BOOLEAN_CHECKED ? rule.points : 0
  }
  if (rule.type === 'counter') {
    return value * rule.points
  }
  const config = rule.config as ThresholdRuleConfig
  const comparisonHolds = config.compare === 'gte' ? value >= config.threshold : value <= config.threshold
  return comparisonHolds ? rule.points : 0
}

const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' })

function formatMonthName(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return MONTH_NAME_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)))
}

// ---------------------------------------------------------------------------
// Rule rows
// ---------------------------------------------------------------------------

interface RuleListProps {
  theme: ThemeSurfaces
  reducedMotion: boolean
  rules: Rule[]
  dayValues: Record<string, number>
  color: string
  onColor: string
  editable: boolean
  onSubmit: (rule: Rule, value: number, event?: MouseEvent) => void
}

function RuleList({
  theme,
  reducedMotion,
  rules,
  dayValues,
  color,
  onColor,
  editable,
  onSubmit,
}: RuleListProps) {
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.hairline}`,
        borderRadius: RADIUS.card,
        overflow: 'hidden',
      }}
    >
      {rules.map((rule, index) => (
        <RuleRow
          key={rule.key}
          theme={theme}
          reducedMotion={reducedMotion}
          rule={rule}
          value={dayValues[rule.key] ?? 0}
          color={color}
          onColor={onColor}
          editable={editable}
          isFirst={index === 0}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  )
}

interface RuleRowProps {
  theme: ThemeSurfaces
  reducedMotion: boolean
  rule: Rule
  value: number
  color: string
  onColor: string
  editable: boolean
  isFirst: boolean
  onSubmit: (rule: Rule, value: number, event?: MouseEvent) => void
}

function RuleRow(props: RuleRowProps) {
  if (props.rule.type === 'counter') {
    return <CounterRuleRow {...props} />
  }
  if (props.rule.type === 'threshold') {
    return <ThresholdRuleRow {...props} />
  }
  return <BooleanRuleRow {...props} />
}

function RuleRowShell({
  theme,
  isFirst,
  background,
  opacity,
  children,
}: {
  theme: ThemeSurfaces
  isFirst: boolean
  background: string
  opacity: number
  children: React.ReactNode
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        height: SPACING.ruleRowHeight,
        padding: '0 14px',
        borderTop: isFirst ? 'none' : `1px solid ${theme.hairline}`,
        background,
        opacity,
      }}
    >
      {children}
    </div>
  )
}

function RuleIconTile({
  theme,
  rule,
  on,
  color,
  onColor,
  reducedMotion,
}: {
  theme: ThemeSurfaces
  rule: Rule
  on: boolean
  color: string
  onColor: string
  reducedMotion: boolean
}) {
  const Icon = iconForRule(rule.icon)
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: SPACING.iconTileSize,
        height: SPACING.iconTileSize,
        borderRadius: RADIUS.ruleRowIconTile,
        background: on ? color : theme.surfaceAlt,
        color: on ? onColor : theme.muted,
        transition: motionOrInstant(MOTION.checkboxFill, reducedMotion),
        transform: on ? 'scale(1.04)' : 'scale(1)',
        flexShrink: 0,
      }}
    >
      <Icon size={16} strokeWidth={2.2} />
    </div>
  )
}

function RuleLabel({ theme, rule, on }: { theme: ThemeSurfaces; rule: Rule; on: boolean }) {
  return (
    <div
      className="flex-1 truncate"
      style={{
        ...(on ? TYPE_SCALE.ruleRowLabelChecked : TYPE_SCALE.ruleRowLabel),
        color: on ? theme.ink : theme.muted,
      }}
    >
      {rule.label}
    </div>
  )
}

function BooleanRuleRow({
  theme, reducedMotion, rule, value, color, onColor, editable, isFirst, onSubmit,
}: RuleRowProps) {
  const on = value === BOOLEAN_CHECKED

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!editable) return
    const next = on ? BOOLEAN_UNCHECKED : BOOLEAN_CHECKED
    onSubmit(rule, next, event)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!editable}
      aria-pressed={on}
      aria-label={rule.label}
      className="w-full flex items-center gap-3 text-left"
      style={{
        height: SPACING.ruleRowHeight,
        padding: '0 14px',
        border: 'none',
        borderTop: isFirst ? 'none' : `1px solid ${theme.hairline}`,
        background: on ? tint(color, theme, TINT_STEP_CHECKED_ROW) : 'transparent',
        cursor: editable ? 'pointer' : 'default',
        opacity: editable ? 1 : 0.72,
      }}
    >
      <RuleIconTile
        theme={theme}
        rule={rule}
        on={on}
        color={color}
        onColor={onColor}
        reducedMotion={reducedMotion}
      />
      <RuleLabel theme={theme} rule={rule} on={on} />
      <div
        style={{
          ...TYPE_SCALE.bannerScoreSmall,
          color: on ? color : theme.hairline,
          width: 26,
          textAlign: 'right',
        }}
      >
        {on ? `+${rule.points}` : '—'}
      </div>
      <div
        className="flex items-center justify-center"
        style={{
          width: SPACING.checkboxSize,
          height: SPACING.checkboxSize,
          borderRadius: RADIUS.checkbox,
          border: `${SPACING.checkboxBorderWidth}px solid ${on ? color : theme.hairline}`,
          background: on ? color : 'transparent',
          transition: motionOrInstant(MOTION.checkboxFill, reducedMotion),
          flexShrink: 0,
        }}
      >
        {on && <Check size={14} strokeWidth={3.4} color={onColor} />}
      </div>
    </button>
  )
}

const COUNTER_STEP_BUTTON_SIZE = 26

function CounterRuleRow({
  theme, reducedMotion, rule, value, color, onColor, editable, isFirst, onSubmit,
}: RuleRowProps) {
  const config = rule.config as CounterRuleConfig
  const on = value > 0

  function handleDecrease() {
    if (editable && value > 0) onSubmit(rule, value - 1)
  }

  function handleIncrease() {
    if (editable && value < config.max) onSubmit(rule, value + 1)
  }

  return (
    <RuleRowShell theme={theme} isFirst={isFirst} background="transparent" opacity={editable ? 1 : 0.72}>
      <RuleIconTile
        theme={theme}
        rule={rule}
        on={on}
        color={color}
        onColor={onColor}
        reducedMotion={reducedMotion}
      />
      <RuleLabel theme={theme} rule={rule} on={on} />
      <div className="flex items-center gap-2">
        <StepButton theme={theme} label="−" onClick={handleDecrease} disabled={!editable || value <= 0} />
        <div style={{ ...TYPE_SCALE.bannerScoreSmall, color: theme.ink, minWidth: 28, textAlign: 'center' }}>
          {value}/{config.max}
        </div>
        <StepButton theme={theme} label="+" onClick={handleIncrease} disabled={!editable || value >= config.max} />
      </div>
    </RuleRowShell>
  )
}

function StepButton({
  theme, label, onClick, disabled,
}: {
  theme: ThemeSurfaces
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label === '+' ? 'Increase' : 'Decrease'}
      className="flex items-center justify-center"
      style={{
        width: COUNTER_STEP_BUTTON_SIZE,
        height: COUNTER_STEP_BUTTON_SIZE,
        borderRadius: RADIUS.full,
        border: `1px solid ${theme.hairline}`,
        background: theme.surfaceAlt,
        color: theme.ink,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

const THRESHOLD_INPUT_WIDTH = 56

function ThresholdRuleRow({
  theme, reducedMotion, rule, value, color, onColor, editable, isFirst, onSubmit,
}: RuleRowProps) {
  const config = rule.config as ThresholdRuleConfig
  const comparisonHolds = config.compare === 'gte' ? value >= config.threshold : value <= config.threshold
  const on = value > 0 && comparisonHolds

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (!editable) return
    const parsed = Number.parseFloat(event.target.value)
    if (Number.isFinite(parsed)) onSubmit(rule, parsed)
  }

  return (
    <RuleRowShell theme={theme} isFirst={isFirst} background="transparent" opacity={editable ? 1 : 0.72}>
      <RuleIconTile
        theme={theme}
        rule={rule}
        on={on}
        color={color}
        onColor={onColor}
        reducedMotion={reducedMotion}
      />
      <RuleLabel theme={theme} rule={rule} on={on} />
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          defaultValue={value || undefined}
          disabled={!editable}
          onBlur={handleBlur}
          aria-label={`${rule.label} (${config.unit})`}
          style={{
            width: THRESHOLD_INPUT_WIDTH,
            fontFamily: FONT_MONO,
            fontSize: 13,
            color: theme.ink,
            background: theme.surfaceAlt,
            border: `1px solid ${theme.hairline}`,
            borderRadius: RADIUS.checkbox,
            padding: '4px 6px',
            textAlign: 'right',
          }}
        />
        <span style={{ ...TYPE_SCALE.caption, color: theme.muted }}>{config.unit}</span>
      </div>
    </RuleRowShell>
  )
}

// ---------------------------------------------------------------------------
// Own-vs-other-page treatment — spec §3.4
// ---------------------------------------------------------------------------

function UnlockPrompt({ theme, name, onTap }: { theme: ThemeSurfaces; name: string; onTap: () => void }) {
  return (
    <div className="px-4" style={{ paddingTop: 12 }}>
      <button
        type="button"
        onClick={onTap}
        className="w-full"
        style={{
          padding: '11px 14px',
          borderRadius: RADIUS.calendarCell,
          background: theme.surfaceAlt,
          border: `1px dashed ${theme.hairline}`,
          color: theme.muted,
          fontFamily: FONT_BODY,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Log for {name}
      </button>
    </div>
  )
}

function EditingAsBar({ name }: { name: string }) {
  const amber = paletteEntryFor('amber')
  return (
    <div
      style={{
        background: amber.hex,
        padding: '8px 16px',
        fontFamily: FONT_BODY,
        fontSize: 12,
        fontWeight: 700,
        color: amber.on,
      }}
    >
      Editing as {name} — {AMBER_BAR_TEXT}
    </div>
  )
}

function UnlockConfirmSheet({
  theme,
  targetName,
  ownName,
  onConfirm,
  onCancel,
}: {
  theme: ThemeSurfaces
  targetName: string
  ownName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet theme={theme} onDismiss={onCancel}>
      <h2 style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink }}>
        Log for {targetName}?
      </h2>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 6, lineHeight: 1.5 }}>
        You&rsquo;re about to change {targetName}&rsquo;s log, not yours. This device is set up as{' '}
        {ownName}.
      </p>
      <div className="flex" style={{ gap: 10, marginTop: 16 }}>
        <SheetButton theme={theme} label="Cancel" onClick={onCancel} primary={false} />
        <SheetButton theme={theme} label="Continue" onClick={onConfirm} primary />
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Perfect day, weight row, footer, misc
// ---------------------------------------------------------------------------

function PerfectDayBanner({ theme, color, max }: { theme: ThemeSurfaces; color: string; max: number }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: RADIUS.calendarCell,
        background: tint(color, theme, TINT_STEP_PERFECT_DAY_FILL),
        border: `1px solid ${tint(color, theme, TINT_STEP_PERFECT_DAY_BORDER)}`,
      }}
    >
      <Flame size={17} color={color} />
      <span style={{ fontFamily: FONT_BODY, fontSize: 15.5, fontWeight: 700, color: theme.ink }}>
        {max} / {max} — perfect day
      </span>
    </div>
  )
}

function WeightRow({ theme, onTap }: { theme: ThemeSurfaces; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-3"
      style={{
        marginTop: 12,
        padding: '13px 14px',
        borderRadius: RADIUS.calendarCell,
        background: theme.surface,
        border: `1px solid ${theme.hairline}`,
        cursor: 'pointer',
      }}
    >
      <Scale size={17} color={theme.muted} />
      <span className="flex-1 text-left" style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, color: theme.muted }}>
        Log today&rsquo;s weight
      </span>
      <ChevronRight size={16} color={theme.muted} />
    </button>
  )
}

// Weight persistence (functions/api/weights/**) belongs to Phase 3A (spec §8.6, §9) — this row
// stays visible per the §8.3 wireframe, but taps land on an honest placeholder rather than a
// broken write until that phase lands.
function WeightComingSoonSheet({ theme, onDismiss }: { theme: ThemeSurfaces; onDismiss: () => void }) {
  return (
    <Sheet theme={theme} onDismiss={onDismiss}>
      <h2 style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink }}>Weight tracking</h2>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 6, lineHeight: 1.5 }}>
        Arriving in a later phase.
      </p>
      <div style={{ marginTop: 16 }}>
        <SheetButton theme={theme} label="Close" onClick={onDismiss} primary />
      </div>
    </Sheet>
  )
}

function MonthLoggedCaption({ theme, count, monthKey }: { theme: ThemeSurfaces; count: number; monthKey: string }) {
  return (
    <div
      className="text-center"
      style={{
        marginTop: 18,
        fontFamily: FONT_MONO,
        fontSize: 11,
        color: theme.muted,
        letterSpacing: '0.04em',
      }}
    >
      {count} DAYS LOGGED IN {formatMonthName(monthKey).toUpperCase()}
    </div>
  )
}

function SaveErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      style={{
        ...TYPE_SCALE.caption, color: '#E5484D', marginBottom: 10,
      }}
    >
      {message}
    </p>
  )
}

function MissingPersonNotice({ theme }: { theme: ThemeSurfaces }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6" style={{ background: theme.paper }}>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, textAlign: 'center' }}>
        This person could not be found. Try switching identity from the header avatar.
      </p>
    </div>
  )
}
