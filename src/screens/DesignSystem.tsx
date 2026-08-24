import { useState, type ReactNode } from 'react'
import { Check, CalendarDays, Settings as SettingsIcon, Trophy } from 'lucide-react'
import { useTheme } from '../components/ThemeProvider'
import { Card } from '../components/Card'
import { Segmented, type SegmentedOption } from '../components/Segmented'
import { SectionTitle } from '../components/SectionTitle'
import { Pips } from '../components/Pips'
import { Banner } from '../components/Banner'
import { PersonChip } from '../components/PersonChip'
import { BottomNav, type BottomNavItem } from '../components/BottomNav'
import type { PersonSummary } from '../components/person'
import {
  buildColorRamp,
  FONT_MONO,
  MOTION,
  motionOrInstant,
  PALETTE,
  PALETTE_ORDER,
  SPACING,
  THEME_DARK,
  THEME_LIGHT,
  TYPE_SCALE,
  type PersonColorKey,
  type ThemePreference,
} from '../theme'

// Demo-only cast data — this screen exists to prove the primitives and the
// palette, not to model the real API. Names/emoji/colors mirror the mockup's
// mock roster loosely so reviewers recognize the pattern.
const DEMO_PEOPLE: PersonSummary[] = [
  { name: 'Josh', emoji: '🪓', color: 'blue' },
  { name: 'Marie', emoji: '🌿', color: 'plum' },
  { name: 'Caleb', emoji: '🏃', color: 'grass' },
  { name: 'Nora', emoji: '☀️', color: 'amber' },
]

const NAV_ITEMS: BottomNavItem[] = [
  { key: 'today', label: 'Today', Icon: Check },
  { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { key: 'standings', label: 'Standings', Icon: Trophy },
  { key: 'device', label: 'Device', Icon: SettingsIcon },
]

const THEME_PREFERENCE_OPTIONS: Array<SegmentedOption<ThemePreference>> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const TAB_DEMO_OPTIONS: Array<SegmentedOption<'month' | 'all' | 'weight'>> = [
  { value: 'month', label: 'September' },
  { value: 'all', label: 'All time' },
  { value: 'weight', label: 'Weight' },
]

// A day's max points at demo time — real max comes from maxPointsForDate(),
// owned by src/lib/dates.ts. This screen only demos the Pips primitive.
const DEMO_MAX_POINTS = 6
const CONTENT_MAX_WIDTH = 480
const SECTION_GAP = 28

/**
 * Phase 0 demo route — every shared primitive plus all 16 identity colors,
 * in both themes, toggling live. Reachable at /design-system in local dev.
 * Spec §14 Phase 0: "done when sampled colors match §11.1 exactly."
 */
export function DesignSystem() {
  const { themePreference, setThemePreference, resolvedMode, theme, reducedMotion } = useTheme()
  const [activeNavKey, setActiveNavKey] = useState('today')
  const [tabDemo, setTabDemo] = useState<'month' | 'all' | 'weight'>('month')
  const [selectedNames, setSelectedNames] = useState<string[]>(['Josh'])

  function toggleSelected(name: string) {
    setSelectedNames((prev) => (
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    ))
  }

  return (
    <div
      style={{
        background: theme.paper,
        minHeight: '100dvh',
        transition: motionOrInstant(`background ${MOTION.themeChange}`, reducedMotion),
      }}
    >
      <div style={{ maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto', padding: SPACING.screenGutter }}>
        <PageHeader
          resolvedMode={resolvedMode}
          reducedMotion={reducedMotion}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
        />

        <Section
          title="Banner"
          kicker="§3.4 / §8.3"
          theme={theme}
        >
          <BannerGallery theme={theme} />
        </Section>

        <Section
          title="Card + Pips"
          kicker="§8.4"
          theme={theme}
        >
          <PipsGallery theme={theme} />
        </Section>

        <Section
          title="Segmented"
          kicker="§11"
          theme={theme}
        >
          <Segmented
            theme={theme}
            label="Standings tab"
            value={tabDemo}
            onChange={setTabDemo}
            options={TAB_DEMO_OPTIONS}
          />
        </Section>

        <Section
          title="Person chip"
          kicker="§8.5"
          theme={theme}
        >
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {DEMO_PEOPLE.map((person) => (
              <PersonChip
                key={person.name}
                theme={theme}
                person={person}
                selected={selectedNames.includes(person.name)}
                onClick={() => toggleSelected(person.name)}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Bottom nav"
          kicker="§8"
          theme={theme}
        >
          <Card theme={theme} style={{ maxWidth: 360 }}>
            <BottomNav
              theme={theme}
              items={NAV_ITEMS}
              activeKey={activeNavKey}
              onSelect={setActiveNavKey}
              activeColor={PALETTE[DEMO_PEOPLE[0].color].hex}
            />
          </Card>
        </Section>

        <Section
          title="Identity palette — all 16 colors"
          kicker="§7 / §11.1"
          theme={theme}
        >
          <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginBottom: 14 }}>
            Each row: the claimed swatch, its `on` glyph color, then the five-step tint ramp
            against light surface and against dark surface. Tints adapt to surface, per §11.1.
          </p>
          <div className="flex flex-col" style={{ gap: 10 }}>
            {PALETTE_ORDER.map((key) => (
              <PaletteRow key={key} colorKey={key} />
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

function PageHeader({
  resolvedMode,
  reducedMotion,
  themePreference,
  onThemePreferenceChange,
}: {
  resolvedMode: string
  reducedMotion: boolean
  themePreference: ThemePreference
  onThemePreferenceChange: (pref: ThemePreference) => void
}) {
  const { theme } = useTheme()
  return (
    <header style={{ marginBottom: SECTION_GAP }}>
      <h1 style={{ ...TYPE_SCALE.screenTitle, color: theme.ink, marginBottom: 4 }}>
        Design system
      </h1>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginBottom: 14 }}>
        Resolved mode: <strong>{resolvedMode}</strong> · Reduced motion:{' '}
        <strong>{reducedMotion ? 'on' : 'off'}</strong>
      </p>
      <Segmented
        theme={theme}
        label="Appearance"
        value={themePreference}
        onChange={onThemePreferenceChange}
        options={THEME_PREFERENCE_OPTIONS}
      />
    </header>
  )
}

function Section({
  title,
  kicker,
  theme,
  children,
}: {
  title: string
  kicker: string
  theme: ReturnType<typeof useTheme>['theme']
  children: ReactNode
}) {
  return (
    <section style={{ marginBottom: SECTION_GAP }}>
      <SectionTitle theme={theme} kicker={kicker}>{title}</SectionTitle>
      {children}
    </section>
  )
}

function BannerGallery({ theme }: { theme: ReturnType<typeof useTheme>['theme'] }) {
  const [ownDate, setOwnDate] = useState(0)
  const owner = DEMO_PEOPLE[0]
  const viewer = DEMO_PEOPLE[1]

  function stepOwnDate(delta: number) {
    setOwnDate((current) => current + delta)
  }

  function noop() {
    // Read-only and future-dated examples are static in this gallery.
  }

  return (
    <>
      <Card theme={theme} style={{ marginBottom: 14 }}>
        <Banner
          theme={theme}
          person={owner}
          isOwn
          dateLabel="Wednesday, Sep 9"
          navLabel={ownDate === 0 ? 'Today' : 'Earlier'}
          points={4}
          max={DEMO_MAX_POINTS}
          onPrev={() => stepOwnDate(-1)}
          onNext={() => stepOwnDate(1)}
        />
      </Card>
      <Card theme={theme} style={{ marginBottom: 14 }}>
        <Banner
          theme={theme}
          person={viewer}
          isOwn={false}
          dateLabel="Wednesday, Sep 9"
          navLabel="Today"
          points={2}
          max={DEMO_MAX_POINTS}
          onPrev={noop}
          onNext={noop}
        />
      </Card>
      <Card theme={theme}>
        <Banner
          theme={theme}
          person={owner}
          isOwn
          isFuture
          dateLabel="Saturday, Sep 12"
          navLabel="Logging ahead"
          points={0}
          max={DEMO_MAX_POINTS}
          onPrev={noop}
          onNext={noop}
        />
      </Card>
    </>
  )
}

function PipsGallery({ theme }: { theme: ReturnType<typeof useTheme>['theme'] }) {
  const color = PALETTE[DEMO_PEOPLE[0].color].hex
  const rows: Array<{ label: string; points: number | null }> = [
    { label: 'Never logged', points: null },
    { label: 'Logged, zero', points: 0 },
    { label: 'Partial — 4 of 6', points: 4 },
    { label: 'Perfect day', points: DEMO_MAX_POINTS },
  ]

  return (
    <Card theme={theme} padded>
      <div className="flex flex-col" style={{ gap: 12 }}>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: theme.muted }}>
              {row.label}
            </span>
            <Pips
              theme={theme}
              points={row.points}
              max={DEMO_MAX_POINTS}
              color={color}
              size={8}
              gap={4}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}

function PaletteRow({ colorKey }: { colorKey: PersonColorKey }) {
  const entry = PALETTE[colorKey]
  const lightRamp = buildColorRamp(colorKey, THEME_LIGHT)
  const darkRamp = buildColorRamp(colorKey, THEME_DARK)

  return (
    <div className="flex items-center gap-3">
      <SwatchLabel colorKey={colorKey} entry={entry} />
      <RampStrip ramp={lightRamp} surfaceLabel="L" />
      <RampStrip ramp={darkRamp} surfaceLabel="D" />
    </div>
  )
}

const SWATCH_SIZE = 32
const SWATCH_LABEL_WIDTH = 108

interface SwatchLabelProps {
  colorKey: PersonColorKey
  entry: { hex: string; on: string }
}

function SwatchLabel({ colorKey, entry }: SwatchLabelProps) {
  return (
    <div className="flex items-center gap-2" style={{ width: SWATCH_LABEL_WIDTH, flexShrink: 0 }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: SWATCH_SIZE,
          height: SWATCH_SIZE,
          borderRadius: SWATCH_SIZE,
          background: entry.hex,
        }}
      >
        <Check
          size={14}
          strokeWidth={3}
          color={entry.on}
        />
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10.5, textTransform: 'uppercase' }}>
        {colorKey}
      </span>
    </div>
  )
}

interface Ramp {
  color: string
  u100: string
  u200: string
  u300: string
  u400: string
  u500: string
}

const RAMP_LABEL_WIDTH = 10
const RAMP_CHIP_SIZE = 18
const RAMP_CHIP_RADIUS = 4
const RAMP_CHIP_BORDER = '1px solid rgba(0,0,0,0.06)'

function RampStrip({ ramp, surfaceLabel }: { ramp: Ramp; surfaceLabel: string }) {
  const steps = [ramp.u100, ramp.u200, ramp.u300, ramp.u400, ramp.u500]
  return (
    <div className="flex items-center gap-1">
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 9,
          color: THEME_DARK.muted,
          width: RAMP_LABEL_WIDTH,
        }}
      >
        {surfaceLabel}
      </span>
      {steps.map((step, index) => (
        <div
          key={index}
          style={{
            width: RAMP_CHIP_SIZE,
            height: RAMP_CHIP_SIZE,
            borderRadius: RAMP_CHIP_RADIUS,
            background: step,
            border: RAMP_CHIP_BORDER,
          }}
        />
      ))}
    </div>
  )
}
