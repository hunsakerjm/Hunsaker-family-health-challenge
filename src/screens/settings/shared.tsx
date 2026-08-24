// Small pieces shared across every Settings section (spec §8.7) — kept local to
// src/screens/settings/** per Phase 3C's file ownership rather than added to src/components/,
// which this track may read but must not modify.
import type { ReactNode } from 'react'
import { Card } from '../../components/Card'
import { Sheet, SheetButton } from '../../components/Sheet'
import { SectionTitle } from '../../components/SectionTitle'
import {
  FONT_BODY, RADIUS, TYPE_SCALE, type ThemeSurfaces,
} from '../../theme'

export const SETTINGS_ERROR_COLOR = '#E5484D' // matches Whoami/Today's inline-error red

interface SettingsSectionProps {
  theme: ThemeSurfaces
  title: string
  kicker?: string
  children: ReactNode
}

/** Card + heading wrapper every Settings section uses, so spacing is identical across all six. */
export function SettingsSection({ theme, title, kicker, children }: SettingsSectionProps) {
  return (
    <div style={{ marginBottom: 22 }}>
      <SectionTitle theme={theme} kicker={kicker}>{title}</SectionTitle>
      <Card theme={theme} padded>
        {children}
      </Card>
    </div>
  )
}

export function SettingsHint({ theme, children }: { theme: ThemeSurfaces; children: ReactNode }) {
  return (
    <p style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 9, lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

export function SettingsErrorText({ message }: { message: string }) {
  return (
    <p role="alert" style={{ ...TYPE_SCALE.caption, color: SETTINGS_ERROR_COLOR, marginTop: 8 }}>
      {message}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch — no equivalent primitive exists in src/components/ yet, so it lives here rather
// than there (Phase 3C may read that directory but must not add to or modify it).
// ---------------------------------------------------------------------------

interface ToggleProps {
  theme: ThemeSurfaces
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  activeColor?: string
  disabled?: boolean
}

const TOGGLE_WIDTH = 42
const TOGGLE_HEIGHT = 25
const TOGGLE_KNOB_SIZE = 21
const TOGGLE_KNOB_INSET = 2

export function Toggle({
  theme, checked, onChange, label, activeColor, disabled = false,
}: ToggleProps) {
  function handleClick() {
    if (!disabled) onChange(!checked)
  }

  const trackColor = checked ? (activeColor ?? theme.ink) : theme.hairline

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={handleClick}
      disabled={disabled}
      style={{
        position: 'relative',
        width: TOGGLE_WIDTH,
        height: TOGGLE_HEIGHT,
        borderRadius: RADIUS.full,
        background: trackColor,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        transition: 'background 160ms ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: TOGGLE_KNOB_INSET,
          left: checked ? TOGGLE_WIDTH - TOGGLE_KNOB_SIZE - TOGGLE_KNOB_INSET : TOGGLE_KNOB_INSET,
          width: TOGGLE_KNOB_SIZE,
          height: TOGGLE_KNOB_SIZE,
          borderRadius: RADIUS.full,
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  )
}

interface ToggleRowProps {
  theme: ThemeSurfaces
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
  activeColor?: string
  disabled?: boolean
}

/** A labeled row wrapping `Toggle` — the shape used for "Points" / "Weight" participation. */
export function ToggleRow({
  theme, label, description, checked, onChange, activeColor, disabled,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: '9px 0' }}>
      <div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: theme.ink }}>
          {label}
        </div>
        {description && (
          <div style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>
      <Toggle
        theme={theme}
        checked={checked}
        onChange={onChange}
        label={label}
        activeColor={activeColor}
        disabled={disabled}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirm sheet — every destructive/fairness-affecting action (archive, backdate, sign-out-all)
// funnels through this one shape so the "confirm and state the blast radius" rule (spec §4.1)
// looks the same everywhere.
// ---------------------------------------------------------------------------

interface ConfirmSheetProps {
  theme: ThemeSurfaces
  title: string
  message: ReactNode
  confirmLabel: string
  isSubmitting?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmSheet({
  theme, title, message, confirmLabel, isSubmitting = false, onConfirm, onCancel,
}: ConfirmSheetProps) {
  return (
    <Sheet theme={theme} onDismiss={isSubmitting ? undefined : onCancel}>
      <h2 style={{ ...TYPE_SCALE.sectionTitle, color: theme.ink }}>{title}</h2>
      <div style={{ ...TYPE_SCALE.caption, color: theme.muted, marginTop: 6, lineHeight: 1.5 }}>
        {message}
      </div>
      <div className="flex" style={{ gap: 10, marginTop: 16 }}>
        <SheetButton
          theme={theme}
          label="Cancel"
          onClick={onCancel}
          primary={false}
          disabled={isSubmitting}
        />
        <SheetButton
          theme={theme}
          label={isSubmitting ? 'Working…' : confirmLabel}
          onClick={onConfirm}
          primary
          disabled={isSubmitting}
        />
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Plain text input — Settings has many; one style definition avoids repeating the same object
// literal in every section file.
// ---------------------------------------------------------------------------

export function textInputStyle(theme: ThemeSurfaces) {
  return {
    width: '100%',
    fontFamily: FONT_BODY,
    fontSize: 14,
    color: theme.ink,
    background: theme.surfaceAlt,
    border: `1px solid ${theme.hairline}`,
    borderRadius: RADIUS.checkbox,
    padding: '9px 10px',
  } as const
}

export function fieldLabelStyle(theme: ThemeSurfaces) {
  return {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: 700,
    color: theme.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 5,
    display: 'block',
  }
}
