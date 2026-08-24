// Settings — spec §8.7. "Plain, utilitarian, one long scroll": People, Rules, Challenge, This
// device, Password, Export. No admin role — everyone with the family password reaches every
// section (spec §4.1). This file owns no routing; see the file header note in
// Docs/PHASE3C_LOG.md for the exact prop contract the App.tsx orchestrator wires in.
import { useState } from 'react'
import { PeopleSection } from './settings/PeopleSection'
import { RulesSection } from './settings/RulesSection'
import { ChallengeSection } from './settings/ChallengeSection'
import { DeviceSection } from './settings/DeviceSection'
import { PasswordSection } from './settings/PasswordSection'
import { ExportSection } from './settings/ExportSection'
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

export function SettingsScreen({
  theme, reducedMotion, config, serverToday, rules, users, ownUserId, onSwitchPerson, onSignOut,
  onDataChanged,
}: SettingsScreenProps) {
  const [localUsers, setLocalUsers] = useState(users)
  const [localRules, setLocalRules] = useState(rules)
  const [localConfig, setLocalConfig] = useState(config)

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

  const ownUser = localUsers.find((user) => user.id === ownUserId)

  return (
    <div style={{ padding: SPACING.screenGutter, paddingBottom: 40 }}>
      <h1 style={{ ...TYPE_SCALE.screenTitle, color: theme.ink, marginBottom: 18 }}>
        Settings
      </h1>

      <PeopleSection
        theme={theme}
        users={localUsers}
        serverToday={serverToday}
        challengeStart={localConfig.challenge_start}
        onUserCreated={handleUserCreated}
        onUserUpdated={handleUserUpdated}
      />

      <RulesSection
        theme={theme}
        rules={localRules}
        serverToday={serverToday}
        onRuleCreated={handleRuleCreated}
        onRuleUpdated={handleRuleUpdated}
      />

      <ChallengeSection theme={theme} config={localConfig} onConfigUpdated={handleConfigUpdated} />

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

      <PasswordSection theme={theme} />

      <ExportSection theme={theme} />
    </div>
  )
}
