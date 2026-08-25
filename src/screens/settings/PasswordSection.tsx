// Password change — spec §3.1, §8.7. PBKDF2-SHA256, hashed server-side (functions/api/config.ts)
// — this screen only ever sends the plaintext new password over the already-authenticated,
// HTTPS-only session, exactly once, and never stores or logs it.
//
// This is a rare, blast-radius action gated behind three explicit steps (owner request): a
// "Change password" button, a first confirm asking whether they're sure, the actual change form,
// then a final confirm before the request fires. Because this flow is the one deliberate path to
// changing the shared password, it always signs out every other device on submit — that's a hard
// fact about this shared-password app (bumping app_config.session_version, spec §3.1), not an
// opt-in, so the final confirm states it plainly rather than hiding it behind a toggle.
import { useState } from 'react'
import { updateConfig, ApiError } from '../../api'
import type { ThemeSurfaces } from '../../theme'
import {
  ConfirmSheet, fieldLabelStyle, SettingsErrorText, SettingsHint, SettingsSection, textInputStyle,
} from './shared'

interface PasswordSectionProps {
  theme: ThemeSurfaces
}

const MIN_PASSWORD_LENGTH = 8
const GENERIC_ERROR = 'Could not change the password. Check your connection and try again.'
const MISMATCH_ERROR = 'New password and confirmation do not match.'
const TOO_SHORT_ERROR = `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`

export function PasswordSection({ theme }: PasswordSectionProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [showStartConfirm, setShowStartConfirm] = useState(false)
  const [showFinalConfirm, setShowFinalConfirm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  function requestStart() {
    setSuccessMessage(null)
    setShowStartConfirm(true)
  }

  function confirmStart() {
    setShowStartConfirm(false)
    setFormOpen(true)
  }

  function cancelForm() {
    setFormOpen(false)
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
  }

  function requestFinalConfirm() {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(TOO_SHORT_ERROR)
      return
    }
    if (newPassword !== confirmPassword) {
      setError(MISMATCH_ERROR)
      return
    }
    setError(null)
    setShowFinalConfirm(true)
  }

  async function doSave() {
    setIsSubmitting(true)
    setError(null)
    try {
      await updateConfig({ new_password: newPassword, sign_out_all_devices: true })
      setShowFinalConfirm(false)
      setFormOpen(false)
      setNewPassword('')
      setConfirmPassword('')
      setSuccessMessage('Password changed. Every other device has been signed out.')
    } catch (err) {
      setShowFinalConfirm(false)
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SettingsSection theme={theme} title="Password">
      {!formOpen && (
        <>
          <SettingsHint theme={theme}>
            This is the one shared family password — it proves someone here is family, not who.
          </SettingsHint>

          {successMessage && (
            <p style={{
              ...fieldLabelStyle(theme), color: theme.ink, marginTop: 8, textTransform: 'none',
            }}
            >
              {successMessage}
            </p>
          )}

          <button
            type="button"
            onClick={requestStart}
            className="w-full"
            style={{
              marginTop: 14, padding: '11px', borderRadius: 12, border: 'none',
              background: theme.ink, color: theme.surface, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
            }}
          >
            Change password
          </button>
        </>
      )}

      {formOpen && (
        <>
          <label style={fieldLabelStyle(theme)} htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            style={textInputStyle(theme)}
          />

          <div style={{ marginTop: 10 }}>
            <label style={fieldLabelStyle(theme)} htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              style={textInputStyle(theme)}
            />
          </div>

          {error && <SettingsErrorText message={error} />}

          <div className="flex" style={{ gap: 10, marginTop: 14 }}>
            <button
              type="button"
              onClick={cancelForm}
              disabled={isSubmitting}
              className="flex-1"
              style={{
                padding: '11px', borderRadius: 12, border: `1px solid ${theme.hairline}`,
                background: 'none', color: theme.ink, cursor: isSubmitting ? 'default' : 'pointer',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={requestFinalConfirm}
              disabled={isSubmitting}
              className="flex-1"
              style={{
                padding: '11px', borderRadius: 12, border: 'none',
                background: theme.ink, color: theme.surface,
                cursor: isSubmitting ? 'default' : 'pointer',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              Change password
            </button>
          </div>
        </>
      )}

      {showStartConfirm && (
        <ConfirmSheet
          theme={theme}
          title="Change the shared password?"
          confirmLabel="Continue"
          onConfirm={confirmStart}
          onCancel={() => setShowStartConfirm(false)}
          message="This resets the one password every family member uses to open the app. Only
            continue if you're ready to share the new password with everyone right away."
        />
      )}

      {showFinalConfirm && (
        <ConfirmSheet
          theme={theme}
          title="This signs everyone else out"
          confirmLabel={isSubmitting ? 'Changing…' : 'Change password'}
          isSubmitting={isSubmitting}
          onConfirm={doSave}
          onCancel={() => setShowFinalConfirm(false)}
          message="Every other phone and tablet signed in to the family app will be signed out and
            will need the new password to get back in. This device stays signed in."
        />
      )}
    </SettingsSection>
  )
}
