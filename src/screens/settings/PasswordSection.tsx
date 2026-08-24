// Password change — spec §3.1, §8.7. PBKDF2-SHA256, hashed server-side (functions/api/config.ts)
// — this screen only ever sends the plaintext new password over the already-authenticated,
// HTTPS-only session, exactly once, and never stores or logs it. "Optionally signing out every
// device" bumps app_config.session_version server-side (spec §3.1) — that's a hard fact about
// this shared-password app, not a UI decoration, so it gets its own confirm.
import { useState } from 'react'
import { updateConfig, ApiError } from '../../api'
import type { ThemeSurfaces } from '../../theme'
import {
  ConfirmSheet, fieldLabelStyle, SettingsErrorText, SettingsHint, SettingsSection, textInputStyle,
  ToggleRow,
} from './shared'

interface PasswordSectionProps {
  theme: ThemeSurfaces
}

const MIN_PASSWORD_LENGTH = 8
const GENERIC_ERROR = 'Could not change the password. Check your connection and try again.'
const MISMATCH_ERROR = 'New password and confirmation do not match.'
const TOO_SHORT_ERROR = `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`

export function PasswordSection({ theme }: PasswordSectionProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [signOutAll, setSignOutAll] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  function requestSave() {
    setSuccessMessage(null)
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(TOO_SHORT_ERROR)
      return
    }
    if (newPassword !== confirmPassword) {
      setError(MISMATCH_ERROR)
      return
    }
    setError(null)
    if (signOutAll) {
      setShowSignOutConfirm(true)
      return
    }
    void doSave()
  }

  async function doSave() {
    setShowSignOutConfirm(false)
    setIsSubmitting(true)
    setError(null)
    try {
      await updateConfig({ new_password: newPassword, sign_out_all_devices: signOutAll })
      setNewPassword('')
      setConfirmPassword('')
      setSuccessMessage('Password changed.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SettingsSection theme={theme} title="Password">
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
        <label style={fieldLabelStyle(theme)} htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          style={textInputStyle(theme)}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <ToggleRow
          theme={theme}
          label="Sign out every device"
          description="Everyone re-enters the new password next time they open the app."
          checked={signOutAll}
          onChange={setSignOutAll}
        />
      </div>

      <SettingsHint theme={theme}>
        This is the one shared family password — it proves someone here is family, not who.
      </SettingsHint>

      {error && <SettingsErrorText message={error} />}
      {successMessage && (
        <p style={{ ...fieldLabelStyle(theme), color: theme.ink, marginTop: 8, textTransform: 'none' }}>
          {successMessage}
        </p>
      )}

      <button
        type="button"
        onClick={requestSave}
        disabled={isSubmitting}
        className="w-full"
        style={{
          marginTop: 14, padding: '11px', borderRadius: 12, border: 'none',
          background: theme.ink, color: theme.surface, cursor: isSubmitting ? 'default' : 'pointer',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, opacity: isSubmitting ? 0.6 : 1,
        }}
      >
        {isSubmitting ? 'Changing…' : 'Change password'}
      </button>

      {showSignOutConfirm && (
        <ConfirmSheet
          theme={theme}
          title="Sign out every device?"
          confirmLabel="Change password and sign out everyone"
          isSubmitting={isSubmitting}
          onConfirm={doSave}
          onCancel={() => setShowSignOutConfirm(false)}
          message="Every phone and tablet currently signed in — including this one — will need
            the new password to open the app again."
        />
      )}
    </SettingsSection>
  )
}
