// Settings — spec §8.7. People, Rules, and Challenge are occasional administrative settings the
// owner asked to move behind a disclosure each, so the everyday items (This device, Password) lead
// the screen. This file owns no routing; see the file header note in Docs/PHASE3C_LOG.md for the
// exact prop contract the App.tsx orchestrator wires in.
import { useState } from 'react'
import { PeopleSection } from './settings/PeopleSection'
import { RulesSection } from './settings/RulesSection'
import { ChallengeSection } from './settings/ChallengeSection'
import { DeviceSection } from './settings/DeviceSection'
import { PasswordSection } from './settings/PasswordSection'
import { ExportSection } from './settings/ExportSection'
import { AdminDisclosure } from './settings/shared'
import { SPACING, TYPE_SCALE, type ThemeSurfaces } from '../theme'
import type { AppConfig, Rule, User } from '../types'

export interface SettingsScreenProps {
  theme: ThemeSurfaces
  reducedMotion: boolean
  config: AppConfig
  serverToday: string
  rules: Rule[]
  users: User[]
  ownUserId: string
  /** Settings → This device → "Switch person" (spec §8.7); same action as the header
   * avatar long-press already wired on the Today screen. */
  onSwitchPerson: () => void
  /** Clears this device's session (spec §8.7 "sign out"). App.tsx owns returning to the login
   * gate once this fires — Settings only calls the shared /api/auth/logout + clears
   * localStorage identity before invoking it. */
  onSignOut: () => void
  /** Best-effort notification that server state changed underneath bootstrap's cached copy
   * (a new person, a renamed rule, a changed prize string) — optional because Settings stays
   * fully correct on its own via local state; a parent that wants Today/Calendar/Standings to
   * pick up the change without a full reload can pass a bootstrap refetch here. */
  onDataChanged?: () => void
}

/** Which of the three button-gated admin sections, if any, is currently open. Only one at a
 * time — three long forms open together on a 390px phone would just recreate the wall of
 * scroll the disclosure pattern exists to remove. */
type AdminSectionKey = 'challenge' | 'people' | 'rules'

export function SettingsScreen({
  theme, reducedMotion, config, serverToday, rules, users, ownUserId, onSwitchPerson, onSignOut,
  onDataChanged,
}: SettingsScreenProps) {
  const [localUsers, setLocalUsers] = useState(users)
  const [localRules, setLocalRules] = useState(rules)
  const [localConfig, setLocalConfig] = useState(config)
  const [openAdminSection, setOpenAdminSection] = useState<AdminSectionKey | null>(null)

  function handleUserCreated(user: User) {
    setLocalUsers((prev) => [...prev, user])
    onDataChanged?.()
  }

  function handleUserUpdated(user: User) {
    setLocalUsers((prev) => prev.map((existing) => (existing.id === user.id ? user : existing)))
    onDataChanged?.()
  }

  function handleRuleCreated(rule: Rule) {
    setLocalRules((prev) => [...prev, rule])
    onDataChanged?.()
  }

  function handleRuleUpdated(rule: Rule) {
    setLocalRules((prev) => prev.map((existing) => (existing.id === rule.id ? rule : existing)))
    onDataChanged?.()
  }

  function handleConfigUpdated(next: AppConfig) {
    setLocalConfig(next)
    onDataChanged?.()
  }

  function toggleAdminSection(section: AdminSectionKey) {
    setOpenAdminSection((prev) => (prev === section ? null : section))
  }

  const ownUser = localUsers.find((user) => user.id === ownUserId)

  return (
    <div style={{ padding: SPACING.screenGutter, paddingBottom: 40 }}>
      <h1 style={{ ...TYPE_SCALE.screenTitle, color: theme.ink, marginBottom: 18 }}>
        Settings
      </h1>

      {ownUser && (
        <DeviceSection
          theme={theme}
          ownUser={ownUser}
          users={localUsers}
          reducedMotion={reducedMotion}
          onUserUpdated={handleUserUpdated}
          onSwitchPerson={onSwitchPerson}
          onSignOut={onSignOut}
        />
      )}

      <AdminDisclosure
        theme={theme}
        title="Challenge"
        subtitle="Dates, timezone, and prize text"
        expanded={openAdminSection === 'challenge'}
        onToggle={() => toggleAdminSection('challenge')}
      >
        <ChallengeSection theme={theme} config={localConfig} onConfigUpdated={handleConfigUpdated} />
      </AdminDisclosure>

      <AdminDisclosure
        theme={theme}
        title="People"
        subtitle="Add, rename, recolor, or archive family members"
        expanded={openAdminSection === 'people'}
        onToggle={() => toggleAdminSection('people')}
      >
        <PeopleSection
          theme={theme}
          users={localUsers}
          serverToday={serverToday}
          challengeStart={localConfig.challenge_start}
          onUserCreated={handleUserCreated}
          onUserUpdated={handleUserUpdated}
        />
      </AdminDisclosure>

      <AdminDisclosure
        theme={theme}
        title="Rules"
        subtitle="Add, edit, reorder, or retire scoring rules"
        expanded={openAdminSection === 'rules'}
        onToggle={() => toggleAdminSection('rules')}
      >
        <RulesSection
          theme={theme}
          rules={localRules}
          serverToday={serverToday}
          onRuleCreated={handleRuleCreated}
          onRuleUpdated={handleRuleUpdated}
        />
      </AdminDisclosure>

      <PasswordSection theme={theme} />

      <ExportSection theme={theme} />

      <p style={{
        ...TYPE_SCALE.caption, color: theme.muted, textAlign: 'center', marginTop: 28,
      }}
      >
        Version {__APP_VERSION__}
      </p>
    </div>
  )
}
