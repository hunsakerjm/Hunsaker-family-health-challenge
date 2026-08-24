// This device — spec §8.7: switch person, edit your own emoji/color (§7.1), celebration level
// (Full/Subtle/Off, §11.2), sign out. Celebration level is device-local (localStorage), not
// server state (spec §3.3) — read/write through the existing src/lib/celebration.ts API rather
// than reimplementing it.
import { useState } from 'react'
import { updateUser, logout, ApiError } from '../../api'
import { clearActiveUserId } from '../../lib/identity'
import {
  getCelebrationIntensity, setCelebrationIntensity, type CelebrationIntensity,
} from '../../lib/celebration'
import { Segmented } from '../../components/Segmented'
import type { ThemeSurfaces } from '../../theme'
import { IdentityEditor } from './IdentityEditor'
import { SettingsErrorText, SettingsHint, SettingsSection } from './shared'
import type { User } from '../../types'

interface DeviceSectionProps {
  theme: ThemeSurfaces
  ownUser: User
  users: User[]
  reducedMotion: boolean
  onUserUpdated: (user: User) => void
  onSwitchPerson: () => void
  onSignOut: () => void
}

const GENERIC_ERROR = 'Could not save. Check your connection and try again.'

export function DeviceSection({
  theme, ownUser, users, reducedMotion, onUserUpdated, onSwitchPerson, onSignOut,
}: DeviceSectionProps) {
  const [celebration, setCelebration] = useState<CelebrationIntensity>(getCelebrationIntensity)
  const [error, setError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const takenColors: Record<string, string> = {}
  for (const user of users) {
    if (user.status === 'active' && user.id !== ownUser.id) takenColors[user.color_key] = user.display_name
  }

  function handleCelebrationChange(next: CelebrationIntensity) {
    setCelebration(next)
    setCelebrationIntensity(next)
  }

  async function handleEmojiChange(next: string) {
    try {
      onUserUpdated(await updateUser(ownUser.id, { emoji: next }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    }
  }

  async function handleColorChange(next: string) {
    try {
      onUserUpdated(await updateUser(ownUser.id, { color_key: next }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await logout()
    } catch {
      // Best-effort: clear the local device claim and hand back to App.tsx regardless — an
      // unreachable server must never trap someone on a "signing out" screen.
    } finally {
      clearActiveUserId()
      setIsSigningOut(false)
      onSignOut()
    }
  }

  return (
    <SettingsSection theme={theme} title="This device" kicker={ownUser.display_name}>
      <button
        type="button"
        onClick={onSwitchPerson}
        className="w-full text-left"
        style={{
          padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: theme.ink,
        }}
      >
        Switch person →
      </button>

      <div style={{ height: 1, background: theme.hairline, margin: '10px 0 14px' }} />

      <IdentityEditor
        theme={theme}
        emoji={ownUser.emoji ?? '🙂'}
        colorKey={ownUser.color_key}
        onEmojiChange={handleEmojiChange}
        onColorChange={handleColorChange}
        takenColors={takenColors}
      />

      <div style={{ height: 1, background: theme.hairline, margin: '14px 0' }} />

      <div>
        <span style={{
          fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: theme.muted,
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block',
        }}
        >
          Celebrations
        </span>
        <Segmented
          theme={theme}
          label="Celebration level"
          value={celebration}
          onChange={handleCelebrationChange}
          options={[
            { value: 'full', label: 'Full' },
            { value: 'subtle', label: 'Subtle' },
            { value: 'off', label: 'Off' },
          ]}
        />
        <SettingsHint theme={theme}>
          {reducedMotion
            ? 'Your system asks for reduced motion, so this started at Off.'
            : 'Each item you log raises the celebration a step. The last one is the big one.'}
        </SettingsHint>
      </div>

      {error && <SettingsErrorText message={error} />}

      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
        className="w-full"
        style={{
          marginTop: 18, padding: '11px', borderRadius: 12, border: `1px solid ${theme.hairline}`,
          background: 'none', color: '#E5484D', cursor: isSigningOut ? 'default' : 'pointer',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 700, opacity: isSigningOut ? 0.6 : 1,
        }}
      >
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </button>
    </SettingsSection>
  )
}
