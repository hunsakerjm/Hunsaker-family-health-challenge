// Month recap — spec §11.2 "Month recap". A full-screen, tap-to-dismiss panel shown once per new
// calendar month, on first open, reporting the device's own claimed person's previous-month
// total. All eligibility/formatting logic lives in `src/lib/recap.ts` (pure, unit-tested); this
// file only owns the fetch, the localStorage write, and the visual.
//
// Never blocks or slows first paint: this component fetches its own data in a `useEffect` and
// renders nothing until it resolves, exactly like Calendar.tsx's own month-fetch pattern. It never
// touches the Today screen's render path at all — the orchestrator mounts it independently.
import { useEffect, useState } from 'react'
import { getLogs } from '../api'
import { getCelebrationIntensity, playCelebration } from '../lib/celebration'
import { getMonthBoundaries } from '../lib/dates'
import {
  buildRecapDisplay,
  getRecapEligibility,
  hasAnyEntries,
  monthLongLabel,
  shouldFireRecapBurst,
  sumPointsForMonth,
  type RecapDisplay,
} from '../lib/recap'
import type { AppConfig, User } from '../types'
import {
  mix,
  paletteEntryFor,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'

export interface MonthRecapProps {
  theme: ThemeSurfaces
  config: AppConfig
  serverToday: string
  /** The device's own claimed person (spec §11.2: this is always "your" recap — there is no
   *  "viewing someone else's" variant of this panel). */
  user: User
}

// Exact key name pinned by spec §11.2 — deliberately NOT namespaced like celebration.ts's `hhc:`
// keys, and NOT scoped by user id. A device carries one claimed identity at a time (spec §2, §3),
// so "once per person per device" and "once per this localStorage key per device" coincide.
const STORAGE_KEY_LAST_RECAP_SHOWN = 'lastRecapShown'

function readLastRecapShown(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY_LAST_RECAP_SHOWN)
  } catch {
    return null
  }
}

function writeLastRecapShown(monthKey: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY_LAST_RECAP_SHOWN, monthKey)
  } catch {
    // Best-effort, same guard as celebration.ts — a blocked write must never throw through render.
  }
}

// Centered, slightly above screen-middle — behind where the hero number sits.
const RECAP_BURST_ORIGIN = { x: 0.5, y: 0.4 }

interface RecapState {
  display: RecapDisplay
  currentMonthKey: string
}

export function MonthRecap({ theme, config, serverToday, user }: MonthRecapProps) {
  const [state, setState] = useState<RecapState | null>(null)

  useEffect(() => {
    let cancelled = false

    const eligibility = getRecapEligibility({
      serverToday,
      challengeStart: config.challenge_start,
      challengeEnd: config.challenge_end,
      lastRecapShown: readLastRecapShown(),
    })
    if (!eligibility.eligible || !eligibility.recapMonthKey) {
      return
    }

    const recapMonthKey = eligibility.recapMonthKey
    const { start, end } = getMonthBoundaries(recapMonthKey)

    getLogs({ userId: user.id, from: start, to: end })
      .then((entries) => {
        if (cancelled) return
        const withEntries = hasAnyEntries(entries)
        const total = sumPointsForMonth(entries)
        const display = buildRecapDisplay(monthLongLabel(recapMonthKey), total, withEntries)
        setState({ display, currentMonthKey: eligibility.currentMonthKey })

        if (shouldFireRecapBurst(getCelebrationIntensity(), withEntries)) {
          // Fire-and-forget, matching playCelebration's own contract — this is decoration over a
          // panel that's already rendered, never something the panel waits on.
          playCelebration({
            pointsAfter: 1,
            maxPointsForDay: 1,
            color: paletteEntryFor(user.color_key).hex,
            origin: RECAP_BURST_ORIGIN,
          })
        }
      })
      .catch(() => {
        // Best-effort, mirrors Calendar.tsx's month-fetch pattern: show nothing rather than block
        // anything on the ten-second logging path. `lastRecapShown` is only written after a
        // successful, dismissed showing, so the next new-month open retries this fetch.
      })

    return () => {
      cancelled = true
    }
    // `getRecapEligibility` (keyed on the localStorage read taken at mount) is itself the guard
    // against re-showing within a month, so this intentionally doesn't re-run on its own output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverToday, config.challenge_start, config.challenge_end, user.id])

  if (!state) {
    return null
  }

  // Captured as a plain non-null local: `state` itself stays a possibly-null field on the closure
  // as far as the compiler is concerned once it's referenced from the nested function below.
  const shownState = state

  function handleDismiss() {
    writeLastRecapShown(shownState.currentMonthKey)
    setState(null)
  }

  const color = paletteEntryFor(user.color_key)

  return (
    <RecapPanel
      theme={theme}
      display={shownState.display}
      color={color.hex}
      person={user}
      onDismiss={handleDismiss}
    />
  )
}

// Above the celebration canvas's own z-index (40, `src/lib/celebration.ts`) so the panel and hero
// number stay legible over an in-flight burst, and above modals/sheets (also 40) — a new month is
// the very first thing a person should see, before anything else in the app competes for the tap.
const RECAP_PANEL_Z_INDEX = 45

function RecapPanel({
  theme,
  display,
  color,
  person,
  onDismiss,
}: {
  theme: ThemeSurfaces
  display: RecapDisplay
  color: string
  person: User
  onDismiss: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${person.display_name}'s month recap`}
      className="fixed inset-0 flex flex-col items-center justify-center text-center"
      style={{
        zIndex: RECAP_PANEL_Z_INDEX,
        padding: '0 32px',
        background: `radial-gradient(circle at 50% 38%, ${mix(theme.surface, color, 0.14)} 0%, `
          + `${theme.paper} 72%)`,
        cursor: 'pointer',
      }}
      onClick={onDismiss}
    >
      <span style={{ fontSize: 42, marginBottom: 6 }}>{person.emoji ?? '🙂'}</span>
      <span
        style={{
          ...TYPE_SCALE.kicker,
          color: theme.muted,
          marginBottom: display.hasEntries ? 14 : 20,
        }}
      >
        {person.display_name}&rsquo;s month
      </span>

      {display.hasEntries && (
        <span
          style={{
            ...TYPE_SCALE.recapHero,
            color,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {display.heroValue}
        </span>
      )}

      <span
        style={{
          ...TYPE_SCALE.bodyCopy,
          color: display.hasEntries ? theme.muted : theme.ink,
          marginTop: display.hasEntries ? 10 : 0,
          maxWidth: 260,
        }}
      >
        {display.message}
      </span>

      <span
        style={{
          ...TYPE_SCALE.caption,
          color: theme.muted,
          marginTop: 32,
          opacity: 0.7,
        }}
      >
        Tap anywhere to continue
      </span>
    </div>
  )
}
