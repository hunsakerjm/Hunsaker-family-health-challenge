// Weight detail — spec §8.6. Own page only: reached from the Today weight row or a tap on the
// weight glyph on your own calendar day (spec §8.4). Nothing here is reachable, or ever fetched,
// for anyone but the viewer's own person — the server route this calls (GET /api/weights/:userId)
// is a single-user query with no aggregate variant (see functions/_lib/weights.ts), and this
// screen only ever passes its own userId to it.
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, Pencil, Plus, Scale, Star, Trash2, TrendingDown, TrendingUp, X,
} from 'lucide-react'
import { deleteWeight, getWeights, setWeightBaseline, ApiError } from '../api'
import { Card } from '../components/Card'
import { Sheet } from '../components/Sheet'
import { PendingIndicator } from '../components/PendingIndicator'
import { queuedPutWeight } from '../lib/offline/queue'
import {
  computePercentLost,
  findMostRecentEntry,
  resolveBaselineEntry,
  sortEntriesByDateAscending,
} from '../lib/weight'
import { formatDisplayDate, isDateEditable } from '../lib/dates'
import {
  FONT_BODY,
  FONT_MONO,
  paletteEntryFor,
  RADIUS,
  TINT_STEP_CHECKED_ROW,
  tint,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'
import type { AppConfig, User, WeightEntry } from '../types'

interface WeightDetailScreenProps {
  theme: ThemeSurfaces
  config: AppConfig
  serverToday: string
  ownUser: User
  onBack: () => void
}

const GENERIC_ERROR = 'Could not save. Check your connection and try again.'
const DEFAULT_STARTING_WEIGHT_LB = 150

export function WeightDetailScreen({
  theme, config, serverToday, ownUser, onBack,
}: WeightDetailScreenProps) {
  const [entries, setEntries] = useState<WeightEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheetDate, setSheetDate] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const color = paletteEntryFor(ownUser.color_key)

  useEffect(() => {
    let cancelled = false
    getWeights(ownUser.id)
      .then((data) => {
        if (!cancelled) setEntries(data)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error instanceof ApiError ? error.message : GENERIC_ERROR)
      })
    return () => {
      cancelled = true
    }
  }, [ownUser.id])

  const sorted = useMemo(() => sortEntriesByDateAscending(entries ?? []), [entries])
  const percentLost = useMemo(() => computePercentLost(sorted), [sorted])
  const baseline = useMemo(() => resolveBaselineEntry(sorted), [sorted])
  const sheetEntry = sheetDate ? sorted.find((entry) => entry.log_date === sheetDate) ?? null : null
  const defaultNewWeight = findMostRecentEntry(sorted)?.weight_lb ?? DEFAULT_STARTING_WEIGHT_LB

  function openNewEntry() {
    setSheetDate(serverToday)
  }

  function openEditEntry(date: string) {
    setSheetDate(date)
  }

  function closeSheet() {
    setSheetDate(null)
  }

  async function handleSave(weightLb: number) {
    if (!sheetDate) return
    const date = sheetDate
    try {
      const result = await queuedPutWeight(ownUser.id, date, weightLb, ownUser.id)
      // Optimistic either way (spec §10): a queued result has no server-confirmed row, so the
      // list is updated from what was just entered, preserving whatever `is_baseline` the date
      // already carried locally (a queued write never changes baseline — see upsertWeightEntry's
      // own header comment for why the server side preserves it too).
      const entry = result.status === 'synced'
        ? result.data
        : buildOptimisticWeightEntry(ownUser.id, date, weightLb, entries ?? [])
      setEntries((prev) => replaceEntry(prev ?? [], entry))
      setActionError(null)
      closeSheet()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : GENERIC_ERROR)
    }
  }

  async function handleDelete(date: string) {
    try {
      await deleteWeight(ownUser.id, date, ownUser.id)
      setEntries((prev) => (prev ?? []).filter((entry) => entry.log_date !== date))
      setActionError(null)
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : GENERIC_ERROR)
    }
  }

  async function handleSetBaseline(date: string) {
    try {
      await setWeightBaseline(ownUser.id, date, ownUser.id)
      setEntries((prev) => markBaseline(prev ?? [], date))
      setActionError(null)
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : GENERIC_ERROR)
    }
  }

  return (
    <div>
      <WeightHeader color={color.hex} onColor={color.on} onBack={onBack} />
      <div className="px-4" style={{ paddingTop: 16, paddingBottom: 28 }}>
        {loadError && <ErrorNotice message={loadError} />}
        {actionError && <ErrorNotice message={actionError} />}
        <PendingIndicator theme={theme} />

        <PercentHero theme={theme} color={color.hex} percentLost={percentLost} />

        {sorted.length >= 2 && (
          <div style={{ marginTop: 16 }}>
            <Sparkline theme={theme} color={color.hex} entries={sorted} />
          </div>
        )}

        <button
          type="button"
          onClick={openNewEntry}
          className="w-full flex items-center justify-center gap-2"
          style={{
            marginTop: 16,
            padding: '13px 14px',
            borderRadius: RADIUS.calendarCell,
            background: color.hex,
            color: color.on,
            border: 'none',
            cursor: 'pointer',
            fontFamily: FONT_BODY,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <Plus size={16} />
          Log today&rsquo;s weight
        </button>

        <div style={{ marginTop: 20 }}>
          <EntryList
            theme={theme}
            color={color.hex}
            entries={sorted}
            baselineDate={baseline?.log_date ?? null}
            config={config}
            serverToday={serverToday}
            onEdit={openEditEntry}
            onDelete={handleDelete}
            onSetBaseline={handleSetBaseline}
          />
        </div>
      </div>

      {sheetDate && (
        <WeightEntrySheet
          theme={theme}
          dateLabel={formatDisplayDate(sheetDate)}
          initialWeightLb={sheetEntry?.weight_lb ?? defaultNewWeight}
          color={color.hex}
          onColor={color.on}
          onSave={handleSave}
          onDismiss={closeSheet}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function replaceEntry(entries: WeightEntry[], saved: WeightEntry): WeightEntry[] {
  const withoutThisDate = entries.filter((entry) => entry.log_date !== saved.log_date)
  return [...withoutThisDate, saved]
}

/** Built only when `queuedPutWeight` reports `{status:'queued'}` — there is no server response to
 * read a canonical row from yet. Mirrors the shape `PUT /api/weights/:userId/:date` would return,
 * carrying forward whatever `is_baseline` the date already had locally (a plain upsert never moves
 * that flag — see functions/_lib/weights.ts's own header comment). */
function buildOptimisticWeightEntry(
  userId: string,
  date: string,
  weightLb: number,
  existing: WeightEntry[],
): WeightEntry {
  const priorEntry = existing.find((entry) => entry.log_date === date)
  return {
    user_id: userId,
    log_date: date,
    weight_lb: weightLb,
    is_baseline: priorEntry?.is_baseline ?? false,
    updated_at: new Date().toISOString(),
  }
}

function markBaseline(entries: WeightEntry[], date: string): WeightEntry[] {
  return entries.map((entry) => ({ ...entry, is_baseline: entry.log_date === date }))
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function WeightHeader({
  color, onColor, onBack,
}: {
  color: string
  onColor: string
  onBack: () => void
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={{ background: color, padding: '18px 16px 16px' }}
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex items-center justify-center"
        style={{
          width: 30, height: 30, borderRadius: RADIUS.full,
          background: 'rgba(255,255,255,0.2)', border: 'none', color: onColor, cursor: 'pointer',
        }}
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex items-center gap-2">
        <Scale size={18} color={onColor} />
        <span style={{ ...TYPE_SCALE.sectionTitle, color: onColor }}>Weight</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Percent hero + sparkline
// ---------------------------------------------------------------------------

function PercentHero({
  theme, color, percentLost,
}: {
  theme: ThemeSurfaces
  color: string
  percentLost: number | null
}) {
  const hasData = percentLost !== null
  const isLoss = hasData && percentLost >= 0
  const Icon = isLoss ? TrendingDown : TrendingUp
  const displayValue = hasData ? `${percentLost.toFixed(1)}%` : '—'

  return (
    <Card theme={theme} padded style={{ textAlign: 'center' }}>
      <div style={{ ...TYPE_SCALE.kicker, color: theme.muted, marginBottom: 6 }}>
        SINCE BASELINE
      </div>
      <div className="flex items-center justify-center gap-2">
        {hasData && <Icon size={22} color={color} />}
        <span style={{ fontFamily: FONT_MONO, fontSize: 38, fontWeight: 600, color: theme.ink }}>
          {displayValue}
        </span>
      </div>
      {!hasData && (
        <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 6 }}>
          Log a weight to start tracking.
        </p>
      )}
    </Card>
  )
}

const SPARKLINE_WIDTH = 320
const SPARKLINE_HEIGHT = 56
const SPARKLINE_PADDING = 4

function Sparkline({
  theme, color, entries,
}: {
  theme: ThemeSurfaces
  color: string
  entries: WeightEntry[]
}) {
  const points = buildSparklinePoints(entries)
  return (
    <Card theme={theme} padded>
      <svg
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        width="100%"
        height={SPARKLINE_HEIGHT}
        preserveAspectRatio="none"
        role="img"
        aria-label="Weight over time"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </Card>
  )
}

function buildSparklinePoints(entries: WeightEntry[]): string {
  const weights = entries.map((entry) => entry.weight_lb)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min || 1
  const innerWidth = SPARKLINE_WIDTH - SPARKLINE_PADDING * 2
  const innerHeight = SPARKLINE_HEIGHT - SPARKLINE_PADDING * 2
  const step = entries.length > 1 ? innerWidth / (entries.length - 1) : 0

  return entries
    .map((entry, index) => {
      const x = SPARKLINE_PADDING + step * index
      const normalized = (entry.weight_lb - min) / range
      // SVG y grows downward — a higher weight should plot higher on screen (lower y).
      const y = SPARKLINE_PADDING + innerHeight * (1 - normalized)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// ---------------------------------------------------------------------------
// Entry list
// ---------------------------------------------------------------------------

function EntryList({
  theme, color, entries, baselineDate, config, serverToday, onEdit, onDelete, onSetBaseline,
}: {
  theme: ThemeSurfaces
  color: string
  entries: WeightEntry[]
  baselineDate: string | null
  config: AppConfig
  serverToday: string
  onEdit: (date: string) => void
  onDelete: (date: string) => void
  onSetBaseline: (date: string) => void
}) {
  if (entries.length === 0) {
    return (
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, textAlign: 'center' }}>
        No entries yet.
      </p>
    )
  }

  // Newest first for the list — the sparkline reads chronologically, but a correction list is
  // more useful with the most recent (most likely to need fixing) entry at the top.
  const newestFirst = [...entries].reverse()

  return (
    <Card theme={theme}>
      {newestFirst.map((entry, index) => (
        <EntryRow
          key={entry.log_date}
          theme={theme}
          color={color}
          entry={entry}
          isBaseline={entry.log_date === baselineDate}
          isFirst={index === 0}
          editable={isDateEditable(entry.log_date, config, serverToday)}
          onEdit={() => onEdit(entry.log_date)}
          onDelete={() => onDelete(entry.log_date)}
          onSetBaseline={() => onSetBaseline(entry.log_date)}
        />
      ))}
    </Card>
  )
}

function EntryRow({
  theme, color, entry, isBaseline, isFirst, editable, onEdit, onDelete, onSetBaseline,
}: {
  theme: ThemeSurfaces
  color: string
  entry: WeightEntry
  isBaseline: boolean
  isFirst: boolean
  editable: boolean
  onEdit: () => void
  onDelete: () => void
  onSetBaseline: () => void
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: '11px 14px',
        borderTop: isFirst ? 'none' : `1px solid ${theme.hairline}`,
        background: isBaseline ? tint(color, theme, TINT_STEP_CHECKED_ROW) : 'transparent',
      }}
    >
      <div className="flex-1">
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: theme.ink }}>
          {formatDisplayDate(entry.log_date)}
        </div>
        {isBaseline && (
          <div className="flex items-center gap-1" style={{ marginTop: 2 }}>
            <Star size={10} fill={color} color={color} />
            <span style={{ ...TYPE_SCALE.caption, color, lineHeight: 1 }}>Starting weight</span>
          </div>
        )}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, color: theme.ink }}>
        {entry.weight_lb.toFixed(1)}
      </div>
      {!isBaseline && (
        <RowIconButton theme={theme} label="Set as starting weight" onClick={onSetBaseline}>
          <Star size={14} />
        </RowIconButton>
      )}
      <RowIconButton theme={theme} label="Edit" onClick={onEdit} disabled={!editable}>
        <Pencil size={14} />
      </RowIconButton>
      <RowIconButton theme={theme} label="Delete" onClick={onDelete} disabled={!editable}>
        <Trash2 size={14} />
      </RowIconButton>
    </div>
  )
}

function RowIconButton({
  theme, label, onClick, disabled, children,
}: {
  theme: ThemeSurfaces
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex items-center justify-center"
      style={{
        width: 30, height: 30, borderRadius: RADIUS.full,
        border: `1px solid ${theme.hairline}`, background: theme.surfaceAlt,
        color: theme.muted, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
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

// ---------------------------------------------------------------------------
// Weight entry sheet — reused by Calendar.tsx's weight-glyph tap. Also what Today.tsx's weight
// row should eventually open once the orchestrator wires it in (see the final report).
// ---------------------------------------------------------------------------

interface WeightEntrySheetProps {
  theme: ThemeSurfaces
  dateLabel: string
  initialWeightLb: number
  /** The viewer's claimed color/on-color — mirrors the mockup's WeightSheet, which fills the Save
   * button in the person's own color rather than the generic sheet-button ink. */
  color: string
  onColor: string
  onSave: (weightLb: number) => void | Promise<void>
  onDismiss: () => void
}

const WEIGHT_STEP_LB = 0.5
const WEIGHT_DECIMAL_PLACES = 1
const MIN_WEIGHT_LB = 1
const MAX_WEIGHT_LB = 1000
const SAVE_BUTTON_HEIGHT = 46

export function WeightEntrySheet({
  theme, dateLabel, initialWeightLb, color, onColor, onSave, onDismiss,
}: WeightEntrySheetProps) {
  const [value, setValue] = useState(initialWeightLb)
  const [saving, setSaving] = useState(false)

  function handleDecrease() {
    setValue((prev) => clampWeight(round(prev - WEIGHT_STEP_LB)))
  }

  function handleIncrease() {
    setValue((prev) => clampWeight(round(prev + WEIGHT_STEP_LB)))
  }

  async function handleSave() {
    setSaving(true)
    await onSave(value)
    setSaving(false)
  }

  return (
    <Sheet theme={theme} onDismiss={onDismiss}>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <span style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink }}>
          Weight for {dateLabel}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={18} color={theme.muted} />
        </button>
      </div>

      <div className="flex items-center justify-center gap-4" style={{ marginBottom: 18 }}>
        <StepperButton theme={theme} label="Decrease" onClick={handleDecrease}>−</StepperButton>
        <div
          style={{
            fontFamily: FONT_MONO, fontSize: 38, fontWeight: 600, color: theme.ink,
            minWidth: 120, textAlign: 'center',
          }}
        >
          {value.toFixed(WEIGHT_DECIMAL_PLACES)}
        </div>
        <StepperButton theme={theme} label="Increase" onClick={handleIncrease}>+</StepperButton>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full"
        style={{
          height: SAVE_BUTTON_HEIGHT,
          borderRadius: RADIUS.primaryButton,
          border: 'none',
          background: color,
          color: onColor,
          fontFamily: FONT_BODY,
          fontSize: 14.5,
          fontWeight: 700,
          opacity: saving ? 0.6 : 1,
          cursor: saving ? 'default' : 'pointer',
        }}
      >
        Save
      </button>

      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 10, textAlign: 'center' }}>
        No celebration fires here, in either direction.
      </p>
    </Sheet>
  )
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function clampWeight(value: number): number {
  return Math.min(MAX_WEIGHT_LB, Math.max(MIN_WEIGHT_LB, value))
}

function StepperButton({
  theme, label, onClick, children,
}: {
  theme: ThemeSurfaces
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-full flex items-center justify-center"
      style={{
        width: 42, height: 42, border: `1px solid ${theme.hairline}`,
        background: theme.surfaceAlt, color: theme.ink, fontSize: 20, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
