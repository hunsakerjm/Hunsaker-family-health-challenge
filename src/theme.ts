/**
 * Design tokens, palette, and color helpers — spec §7 and §11.1.
 *
 * This file is part of the parallelism contract (repo CLAUDE.md): every later
 * phase codes against these exports and never against a competing copy. It has
 * no React dependency on purpose, so non-UI code (celebration math, exports)
 * can import it too.
 *
 * Values here are lifted verbatim from the approved mockup / spec §11.1 and
 * are exact, not suggestions — sampled colors are Phase 0's "done when" bar.
 */

// ---------------------------------------------------------------------------
// Theme surfaces (§11.1 "Theme surfaces")
// ---------------------------------------------------------------------------

export type ThemeMode = 'light' | 'dark'

/** Three-way user preference; 'system' resolves to a ThemeMode via matchMedia. */
export type ThemePreference = 'system' | ThemeMode

export interface ThemeSurfaces {
  paper: string
  surface: string
  surfaceAlt: string
  ink: string
  muted: string
  hairline: string
  scrim: string
}

// Dark mode is NOT a programmatic inversion of light — surfaces lift above
// paper in both themes, and hairline sits on opposite sides of paper in each.
// Both palettes are hand-specified per spec §11.1.
export const THEME_LIGHT: ThemeSurfaces = {
  paper: '#F1F2F0',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F8F6',
  ink: '#16191C',
  muted: '#6C7278',
  hairline: '#DEE1DD',
  scrim: 'rgba(16,18,20,0.45)',
}

export const THEME_DARK: ThemeSurfaces = {
  paper: '#101214',
  surface: '#1A1D20',
  surfaceAlt: '#212528',
  ink: '#E8EBEC',
  muted: '#8A9196',
  hairline: '#2C3135',
  scrim: 'rgba(0,0,0,0.6)',
}

export const THEMES: Record<ThemeMode, ThemeSurfaces> = {
  light: THEME_LIGHT,
  dark: THEME_DARK,
}

// ---------------------------------------------------------------------------
// 16-color identity palette (§7)
// ---------------------------------------------------------------------------

/** Ordered around the hue wheel, with two neutrals (brown, slate) at the end. */
export const PALETTE_ORDER = [
  'tomato', 'orange', 'amber', 'lime', 'grass', 'forest', 'teal', 'cyan',
  'blue', 'indigo', 'violet', 'plum', 'pink', 'ruby', 'brown', 'slate',
] as const

export type PersonColorKey = (typeof PALETTE_ORDER)[number]

export interface PaletteEntry {
  /** The claimable swatch color. */
  hex: string
  /** Text/glyph color that clears AA against `hex`. amber and lime need dark ink. */
  on: string
}

// The `on` column is not advisory — amber and lime fail AA with white text.
export const PALETTE: Record<PersonColorKey, PaletteEntry> = {
  tomato: { hex: '#E54D2E', on: '#FFFFFF' },
  orange: { hex: '#F76B15', on: '#FFFFFF' },
  amber: { hex: '#FFB224', on: '#1A1A1A' },
  lime: { hex: '#A8C81A', on: '#1A1A1A' },
  grass: { hex: '#46A758', on: '#FFFFFF' },
  forest: { hex: '#2A6A45', on: '#FFFFFF' },
  teal: { hex: '#12A594', on: '#FFFFFF' },
  cyan: { hex: '#00A2C7', on: '#FFFFFF' },
  blue: { hex: '#0090FF', on: '#FFFFFF' },
  indigo: { hex: '#3E63DD', on: '#FFFFFF' },
  violet: { hex: '#6E56CF', on: '#FFFFFF' },
  plum: { hex: '#AB4ABA', on: '#FFFFFF' },
  pink: { hex: '#D6409F', on: '#FFFFFF' },
  ruby: { hex: '#E03A5C', on: '#FFFFFF' },
  brown: { hex: '#AD7F58', on: '#FFFFFF' },
  slate: { hex: '#7B8794', on: '#FFFFFF' },
}

// `users.color_key` (spec §5) is plain TEXT in the DB and `string` on `User` in types.ts — not
// narrowed to `PersonColorKey` at the type level, since the server never validates it against the
// palette either. Every screen that renders a person's color goes through this one safe lookup
// rather than an unchecked `PALETTE[user.color_key]` cast repeated at each call site.
export function paletteEntryFor(colorKey: string): PaletteEntry {
  return PALETTE[colorKey as PersonColorKey] ?? PALETTE.slate
}

// ---------------------------------------------------------------------------
// Color helpers (§11.1 "Derived color") — implement once, everything reuses these
// ---------------------------------------------------------------------------

const HEX_PAIR = 2

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, HEX_PAIR), 16)
  const g = parseInt(clean.slice(HEX_PAIR, HEX_PAIR * 2), 16)
  const b = parseInt(clean.slice(HEX_PAIR * 2, HEX_PAIR * 3), 16)
  return [r, g, b]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(HEX_PAIR, '0')
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`
}

/** Linear RGB interpolation. t=0 returns a, t=1 returns b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  )
}

/**
 * A user color's tint against the current surface.
 *
 * §11.1 correction: this mixes against `surface`, not `paper` — an explicit
 * fix from an earlier spec version. Mixing against surface means every tint
 * automatically adapts when the theme changes, since surface itself does.
 */
export function tint(color: string, theme: ThemeSurfaces, step: number): string {
  return mix(theme.surface, color, step)
}

/** The read-only ("someone else's page") banner treatment. §3.4 */
const DESAT_STEP = 0.72

export function desat(color: string, theme: ThemeSurfaces): string {
  return mix(color, theme.muted, DESAT_STEP)
}

// ---------------------------------------------------------------------------
// Named tint steps in use (§11.1 "Tint steps in use") — never inline these
// ---------------------------------------------------------------------------

export const TINT_STEP_CHECKED_ROW = 0.10
export const TINT_STEP_RIBBON_EMPTY_SEGMENT = 0.09
export const TINT_STEP_LEADERBOARD_LEADER_ROW = 0.09
export const TINT_STEP_PERFECT_DAY_FILL = 0.16
export const TINT_STEP_PERFECT_DAY_BORDER = 0.35
export const TINT_STEP_SELECTED_CHIP_LOW = 0.16
export const TINT_STEP_SELECTED_CHIP_HIGH = 0.18
export const TINT_STEP_SELECTED_SWATCH_RING = 0.28

const CALENDAR_CELL_BASE_STEP = 0.045
const CALENDAR_CELL_RANGE_STEP = 0.12

/** Calendar day cell fill: 0.045 + (points ÷ max) × 0.12. §11.1 */
export function calendarCellTintStep(points: number, max: number): number {
  return CALENDAR_CELL_BASE_STEP + (points / max) * CALENDAR_CELL_RANGE_STEP
}

/**
 * The 5-step tint ramp exposed as CSS custom properties --u-100…--u-500.
 * §7 asks for "a 5-step tint ramp"; these are the five distinct step values
 * the spec's own "tint steps in use" table calls out, ascending, so the ramp
 * a component reaches for by index is never a value invented outside the spec.
 */
export const TINT_RAMP_STEPS = [
  TINT_STEP_RIBBON_EMPTY_SEGMENT, // u-100 (0.09) — also leaderboard leader row
  TINT_STEP_CHECKED_ROW, // u-200 (0.10)
  TINT_STEP_PERFECT_DAY_FILL, // u-300 (0.16) — also selected radar chip low
  TINT_STEP_SELECTED_SWATCH_RING, // u-400 (0.28)
  TINT_STEP_PERFECT_DAY_BORDER, // u-500 (0.35)
] as const

export interface ColorRamp {
  color: string
  on: string
  u100: string
  u200: string
  u300: string
  u400: string
  u500: string
}

/** Build the full --u-color/--u-on/--u-100…--u-500 set for one palette entry. */
export function buildColorRamp(key: PersonColorKey, theme: ThemeSurfaces): ColorRamp {
  const entry = PALETTE[key]
  const [s100, s200, s300, s400, s500] = TINT_RAMP_STEPS
  return {
    color: entry.hex,
    on: entry.on,
    u100: tint(entry.hex, theme, s100),
    u200: tint(entry.hex, theme, s200),
    u300: tint(entry.hex, theme, s300),
    u400: tint(entry.hex, theme, s400),
    u500: tint(entry.hex, theme, s500),
  }
}

/** CSS custom properties for one person's color, ready to spread into `style`. */
export function colorRampCssVars(
  key: PersonColorKey,
  theme: ThemeSurfaces,
): Record<string, string> {
  const ramp = buildColorRamp(key, theme)
  return {
    '--u-color': ramp.color,
    '--u-on': ramp.on,
    '--u-100': ramp.u100,
    '--u-200': ramp.u200,
    '--u-300': ramp.u300,
    '--u-400': ramp.u400,
    '--u-500': ramp.u500,
  }
}

// ---------------------------------------------------------------------------
// Type scale (§11.1 "Type scale")
// ---------------------------------------------------------------------------

// Self-hosted, per Appendix B — no runtime requests to a third-party font CDN.
export const FONT_DISPLAY = "'Bricolage Grotesque Variable', system-ui, sans-serif"
export const FONT_BODY = "'Public Sans', system-ui, sans-serif"
export const FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace"

export interface TypeStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  letterSpacing?: string
  lineHeight?: number
  textTransform?: 'uppercase'
  fontVariantNumeric?: string
}

// Every number the user reads as data — scores, dates, percentages, day
// cells, axis ticks — is mono AND tabular, regardless of context. §11.1
const TABULAR_NUMS = 'tabular-nums'

export const TYPE_SCALE = {
  screenTitle: {
    fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
  },
  bannerDate: {
    fontFamily: FONT_DISPLAY,
    fontSize: 25,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  },
  sectionTitle: {
    fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em',
  },
  recapHero: {
    fontFamily: FONT_DISPLAY, fontSize: 76, fontWeight: 800, letterSpacing: '-0.04em',
  },
  ruleRowLabel: { fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 500 },
  ruleRowLabelChecked: { fontFamily: FONT_BODY, fontSize: 14.5, fontWeight: 600 },
  bodyCopy: { fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600 },
  caption: {
    fontFamily: FONT_BODY, fontSize: 11.5, fontWeight: 400, lineHeight: 1.5,
  },
  bannerScoreLarge: {
    fontFamily: FONT_MONO, fontSize: 20, fontWeight: 600, fontVariantNumeric: TABULAR_NUMS,
  },
  bannerScoreMedium: {
    fontFamily: FONT_MONO, fontSize: 15, fontWeight: 600, fontVariantNumeric: TABULAR_NUMS,
  },
  bannerScoreSmall: {
    fontFamily: FONT_MONO, fontSize: 12.5, fontWeight: 600, fontVariantNumeric: TABULAR_NUMS,
  },
  kicker: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontVariantNumeric: TABULAR_NUMS,
  },
  chartAxis: {
    fontFamily: FONT_MONO, fontSize: 9.5, fontWeight: 400, fontVariantNumeric: TABULAR_NUMS,
  },
} as const satisfies Record<string, TypeStyle>

// ---------------------------------------------------------------------------
// Radius (§11.1 "Radius")
// ---------------------------------------------------------------------------

export const RADIUS = {
  card: 16,
  sheetTop: 16,
  primaryButton: 16,
  ruleRowIconTile: 9,
  checkbox: 8,
  calendarCell: 8,
  ribbonSegment: 1,
  full: 9999,
} as const

// ---------------------------------------------------------------------------
// Spacing and sizing (§11.1 "Spacing and sizing")
// ---------------------------------------------------------------------------

export const SPACING = {
  screenGutter: 16,
  cardPadding: 14,
  ruleRowHeight: 62,
  checkboxSize: 25,
  checkboxBorderWidth: 2,
  iconTileSize: 30,
  avatarHeader: 34,
  avatarIdentityEditor: 52,
  colorSwatchSize: 32,
  colorSwatchGap: 6,
  calendarCellSize: 44,
  calendarCellGap: 3,
  pipDiameter: 3.5,
  pipGap: 1.5,
  ribbonRowHeight: 26,
  ribbonDayGap: 1.5,
  ribbonSegmentGap: 1,
  bottomNavIconSize: 18,
  bottomNavLabelSize: 10,
} as const

// ---------------------------------------------------------------------------
// Motion (§11.1 "Motion")
// ---------------------------------------------------------------------------

export const MOTION = {
  checkboxFill: '180ms cubic-bezier(.34,1.56,.64,1)',
  themeChange: '240ms ease',
  leaderboardBarGrowth: '600ms ease',
} as const

/** Collapse a transition to an instant one under prefers-reduced-motion. */
export function motionOrInstant(transition: string, reducedMotion: boolean): string {
  return reducedMotion ? 'none' : transition
}
