import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { useTheme } from '../components/ThemeProvider'
import { Card } from '../components/Card'
import { Segmented, type SegmentedOption } from '../components/Segmented'
import { SectionTitle } from '../components/SectionTitle'
import { PersonChip } from '../components/PersonChip'
import { CelebrationBanner } from '../components/CelebrationBanner'
import type { PersonSummary } from '../components/person'
import {
  getCelebrationIntensity,
  originFromPointerEvent,
  playCelebration,
  resetCelebration,
  setCelebrationIntensity,
  type CelebrationIntensity,
} from '../lib/celebration'
import {
  FONT_MONO,
  PALETTE,
  SPACING,
  TYPE_SCALE,
  type ThemeSurfaces,
} from '../theme'

// Demo-only roster so a reviewer can see the burst render in a claimed color, per §11.2's "user's
// color with white and gold accents." Not real people — Phase 2a's Today screen supplies the
// real roster via the API.
const DEMO_PEOPLE: PersonSummary[] = [
  { name: 'Josh', emoji: '🪓', color: 'blue' },
  { name: 'Marie', emoji: '🌿', color: 'plum' },
  { name: 'Caleb', emoji: '🏃', color: 'grass' },
]

const INTENSITY_OPTIONS: Array<SegmentedOption<CelebrationIntensity>> = [
  { value: 'full', label: 'Full' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'off', label: 'Off' },
]

// The escalation ladder, verbatim from spec §11.2's table. Ratio drives the tier, never box
// count — demonstrated here with an arbitrary demo denominator (below) that is deliberately NOT
// today's real 6-rule max, to prove the ratio-based curve doesn't care how many rules exist.
const ESCALATION_LADDER: Array<{ ratio: number; feel: string; shape: string }> = [
  { ratio: 0.17, feel: 'barely there', shape: '6-8 particles, tight spread' },
  { ratio: 0.33, feel: 'barely there', shape: '10 particles, slightly wider' },
  { ratio: 0.5, feel: 'small', shape: '16 particles, a little lift' },
  { ratio: 0.67, feel: 'noticeable', shape: '24 particles, wider arc' },
  { ratio: 0.83, feel: 'generous', shape: '40 particles, two staggered bursts' },
  { ratio: 1, feel: 'fireworks', shape: 'multi-burst launch, gold + white accents' },
]

// Deliberately not 6 (CLAUDE.md: never hardcode the real daily max) — a different denominator
// than today's live rule set, so this screen proves the tier math is ratio-based, not count-based.
const DEMO_MAX_POINTS = 7
const CONTENT_MAX_WIDTH = 480
const SECTION_GAP = 28

/**
 * Phase 2b demo route (spec §14 review vehicle) — every escalation tier fireable on demand, plus
 * the device intensity control, without logging six real items. Reachable at /celebration-demo;
 * Phase 2a wires the route in App.tsx (this file does not touch routing — see file-ownership
 * boundary in Docs/PHASE2B_LOG.md).
 */
export function CelebrationDemo() {
  const { theme, reducedMotion } = useTheme()
  const [intensity, setIntensity] = useState<CelebrationIntensity>(getCelebrationIntensity)
  const [selectedPerson, setSelectedPerson] = useState(DEMO_PEOPLE[0])
  const [showPerfectDayBanner, setShowPerfectDayBanner] = useState(false)

  // No leaks across navigation: cancel any in-flight burst/timer when the demo route unmounts.
  useEffect(() => resetCelebration, [])

  function handleIntensityChange(next: CelebrationIntensity) {
    setCelebrationIntensity(next)
    setIntensity(next)
  }

  function handleSelectPerson(person: PersonSummary) {
    setSelectedPerson(person)
  }

  function handleFireTier(ratio: number, event: MouseEvent<HTMLButtonElement>) {
    const pointsAfter = Math.round(ratio * DEMO_MAX_POINTS)
    playCelebration({
      pointsAfter,
      maxPointsForDay: DEMO_MAX_POINTS,
      color: PALETTE[selectedPerson.color].hex,
      origin: originFromPointerEvent(event),
    })
    if (ratio >= 1) {
      setShowPerfectDayBanner(true)
    }
  }

  function handleBannerOff() {
    setIntensity('off')
    setShowPerfectDayBanner(false)
  }

  return (
    <div style={{ background: theme.paper, minHeight: '100dvh' }}>
      <div style={{ maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto', padding: SPACING.screenGutter }}>
        <PageHeader theme={theme} reducedMotion={reducedMotion} />

        <Section title="This device" kicker="§11.2" theme={theme}>
          <Segmented
            theme={theme}
            label="Celebration intensity"
            value={intensity}
            onChange={handleIntensityChange}
            options={INTENSITY_OPTIONS}
          />
          <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 9 }}>
            {reducedMotion
              ? 'Your system asks for reduced motion. A fresh device would default to Off here; this one already has a stored choice.'
              : 'Each item logged raises the celebration a step. The last one is the big one.'}
          </p>
        </Section>

        <Section title="Fire as" kicker="user color" theme={theme}>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {DEMO_PEOPLE.map((person) => (
              <PersonChip
                key={person.name}
                theme={theme}
                person={person}
                selected={person.name === selectedPerson.name}
                onClick={() => handleSelectPerson(person)}
              />
            ))}
          </div>
        </Section>

        <Section title="Escalation ladder" kicker={`out of ${DEMO_MAX_POINTS}`} theme={theme}>
          <Card theme={theme} padded>
            <div className="flex flex-col" style={{ gap: 10 }}>
              {ESCALATION_LADDER.map((tier) => (
                <TierRow
                  key={tier.ratio}
                  theme={theme}
                  ratio={tier.ratio}
                  feel={tier.feel}
                  shape={tier.shape}
                  onFire={handleFireTier}
                />
              ))}
            </div>
          </Card>
        </Section>

        {showPerfectDayBanner && (
          <Section title="Day-complete banner" kicker="top tier only" theme={theme}>
            <CelebrationBanner
              theme={theme}
              color={PALETTE[selectedPerson.color].hex}
              points={DEMO_MAX_POINTS}
              max={DEMO_MAX_POINTS}
              onIntensityOff={handleBannerOff}
            />
          </Section>
        )}
      </div>
    </div>
  )
}

function PageHeader({ theme, reducedMotion }: { theme: ThemeSurfaces; reducedMotion: boolean }) {
  return (
    <header style={{ marginBottom: SECTION_GAP }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <Sparkles size={20} color={theme.ink} />
        <h1 style={{ ...TYPE_SCALE.screenTitle, color: theme.ink }}>Celebration demo</h1>
      </div>
      <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 6 }}>
        Reduced motion: <strong>{reducedMotion ? 'on' : 'off'}</strong> · fires the real
        `canvas-confetti` engine at each tier's exact particle counts (§11.2).
      </p>
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
  theme: ThemeSurfaces
  children: ReactNode
}) {
  return (
    <section style={{ marginBottom: SECTION_GAP }}>
      <SectionTitle theme={theme} kicker={kicker}>{title}</SectionTitle>
      {children}
    </section>
  )
}

function TierRow({
  theme,
  ratio,
  feel,
  shape,
  onFire,
}: {
  theme: ThemeSurfaces
  ratio: number
  feel: string
  shape: string
  onFire: (ratio: number, event: MouseEvent<HTMLButtonElement>) => void
}) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onFire(ratio, event)
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="flex items-baseline" style={{ gap: 6 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600, color: theme.ink }}>
            {ratio.toFixed(2)}
          </span>
          <span style={{ ...TYPE_SCALE.ruleRowLabel, color: theme.ink }}>{feel}</span>
        </div>
        <div style={{ ...TYPE_SCALE.caption, color: theme.muted }}>{shape}</div>
      </div>
      <button
        type="button"
        onClick={handleClick}
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          border: `1px solid ${theme.hairline}`,
          background: theme.surfaceAlt,
          color: theme.ink,
          fontFamily: TYPE_SCALE.bodyCopy.fontFamily,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Fire
      </button>
    </div>
  )
}
