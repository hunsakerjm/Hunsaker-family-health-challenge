// Challenge config — spec §4.1/§8.7: title, start/end dates, timezone, backfill limit,
// future-logging window, and the two prize display strings. Every field here is config-over-code
// (spec §4) — editable at runtime by anyone with the password, no redeploy.
import { useState } from 'react'
import { updateConfig, ApiError } from '../../api'
import { compareDates } from '../../lib/dates'
import type { ThemeSurfaces } from '../../theme'
import {
  ConfirmSheet, fieldLabelStyle, SettingsErrorText, SettingsHint, SettingsSection, textInputStyle,
} from './shared'
import type { AppConfig, UpdateConfigRequest } from '../../types'

interface ChallengeSectionProps {
  theme: ThemeSurfaces
  config: AppConfig
  onConfigUpdated: (config: AppConfig) => void
}

const GENERIC_ERROR = 'Could not save. Check your connection and try again.'

export function ChallengeSection({ theme, config, onConfigUpdated }: ChallengeSectionProps) {
  const [draft, setDraft] = useState(config)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWindowConfirm, setShowWindowConfirm] = useState(false)

  function updateField<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const windowChanged = draft.challenge_start !== config.challenge_start
    || draft.challenge_end !== config.challenge_end

  function requestSave() {
    if (compareDates(draft.challenge_start, draft.challenge_end) > 0) {
      setError('Start date must be on or before the end date.')
      return
    }
    if (windowChanged) {
      setShowWindowConfirm(true)
      return
    }
    void doSave()
  }

  async function doSave() {
    setShowWindowConfirm(false)
    setIsSubmitting(true)
    setError(null)
    try {
      const patch: UpdateConfigRequest = {
        challenge_title: draft.challenge_title,
        challenge_start: draft.challenge_start,
        challenge_end: draft.challenge_end,
        timezone: draft.timezone,
        backfill_limit_days: draft.backfill_limit_days,
        future_logging_days: draft.future_logging_days,
        prize_monthly: draft.prize_monthly,
        prize_final: draft.prize_final,
      }
      onConfigUpdated(await updateConfig(patch))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SettingsSection theme={theme} title="Challenge">
      <TextField theme={theme} label="Title" value={draft.challenge_title} onChange={(v) => updateField('challenge_title', v)} />
      <DateField theme={theme} label="Start date" value={draft.challenge_start} onChange={(v) => updateField('challenge_start', v)} />
      <DateField theme={theme} label="End date" value={draft.challenge_end} onChange={(v) => updateField('challenge_end', v)} />
      <TextField theme={theme} label="Time zone (IANA)" value={draft.timezone} onChange={(v) => updateField('timezone', v)} />
      <NumberField
        theme={theme}
        label="Backfill limit (days, 0 = unlimited)"
        value={draft.backfill_limit_days}
        onChange={(v) => updateField('backfill_limit_days', v)}
      />
      <NumberField
        theme={theme}
        label="Future logging window (days)"
        value={draft.future_logging_days}
        onChange={(v) => updateField('future_logging_days', v)}
      />
      <TextField theme={theme} label="Monthly prize (display text)" value={draft.prize_monthly} onChange={(v) => updateField('prize_monthly', v)} />
      <TextField theme={theme} label="Final prize (display text)" value={draft.prize_final} onChange={(v) => updateField('prize_final', v)} />

      <SettingsHint theme={theme}>
        Prizes are display text only — nothing here tracks payouts or winners.
      </SettingsHint>

      {error && <SettingsErrorText message={error} />}

      <SaveButton theme={theme} isSubmitting={isSubmitting} onClick={requestSave} />

      {showWindowConfirm && (
        <ConfirmSheet
          theme={theme}
          title="Change the challenge window?"
          confirmLabel="Save"
          isSubmitting={isSubmitting}
          onConfirm={doSave}
          onCancel={() => setShowWindowConfirm(false)}
          message="Nothing already logged is ever deleted. Entries outside the new start/end
            dates are hidden from standings from now on, but stay in the database and the CSV
            export."
        />
      )}
    </SettingsSection>
  )
}

function TextField({
  theme, label, value, onChange,
}: {
  theme: ThemeSurfaces
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={fieldLabelStyle(theme)}>{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} style={textInputStyle(theme)} />
    </div>
  )
}

function DateField({
  theme, label, value, onChange,
}: {
  theme: ThemeSurfaces
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <label style={fieldLabelStyle(theme)}>{label}</label>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} style={textInputStyle(theme)} />
    </div>
  )
}

function NumberField({
  theme, label, value, onChange,
}: {
  theme: ThemeSurfaces
  label: string
  value: number
  onChange: (next: number) => void
}) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const parsed = Number.parseInt(event.target.value, 10)
    onChange(Number.isFinite(parsed) ? parsed : 0)
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label style={fieldLabelStyle(theme)}>{label}</label>
      <input type="number" min={0} value={value} onChange={handleChange} style={textInputStyle(theme)} />
    </div>
  )
}

function SaveButton({
  theme, isSubmitting, onClick,
}: {
  theme: ThemeSurfaces
  isSubmitting: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSubmitting}
      className="w-full"
      style={{
        marginTop: 14, padding: '11px', borderRadius: 12, border: 'none',
        background: theme.ink, color: theme.surface, cursor: isSubmitting ? 'default' : 'pointer',
        fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
        opacity: isSubmitting ? 0.6 : 1,
      }}
    >
      {isSubmitting ? 'Saving…' : 'Save challenge settings'}
    </button>
  )
}
