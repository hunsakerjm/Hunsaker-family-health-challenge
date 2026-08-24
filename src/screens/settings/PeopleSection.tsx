// People manager — spec §8.7. Drag to reorder; add, rename, recolor, re-emoji (§7.1); toggle
// points/weight participation independently; archive. Archiving preserves history, removes the
// person from standings from that date forward, and frees their color (enforced server-side by
// `status`/`active_to` — this file only ever sets those fields, never deletes a row).
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createUser, updateUser, ApiError } from '../../api'
import { computeDefaultActiveFrom } from '../../lib/settingsHelpers'
import { paletteEntryFor, PALETTE_ORDER, RADIUS, TYPE_SCALE, type ThemeSurfaces } from '../../theme'
import { ReorderableList } from './ReorderableList'
import { IdentityEditor } from './IdentityEditor'
import {
  ConfirmSheet, SettingsErrorText, SettingsHint, SettingsSection, textInputStyle, fieldLabelStyle,
  ToggleRow,
} from './shared'
import type { CreateUserRequest, UpdateUserRequest, User } from '../../types'

interface PeopleSectionProps {
  theme: ThemeSurfaces
  users: User[]
  serverToday: string
  challengeStart: string
  onUserCreated: (user: User) => void
  onUserUpdated: (user: User) => void
}

const ROW_HEIGHT = 52
const GENERIC_ERROR = 'Could not save. Check your connection and try again.'

export function PeopleSection({
  theme, users, serverToday, challengeStart, onUserCreated, onUserUpdated,
}: PeopleSectionProps) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  const activeUsers = [...users.filter((u) => u.status === 'active')]
    .sort((a, b) => a.sort_order - b.sort_order)
  const archivedUsers = [...users.filter((u) => u.status === 'archived')]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))

  function handleReorder(orderedIds: string[]) {
    orderedIds.forEach((id, index) => {
      const user = activeUsers.find((u) => u.id === id)
      if (user && user.sort_order !== index) {
        updateUser(id, { sort_order: index }).then(onUserUpdated).catch(() => {})
      }
    })
  }

  const editingUser = editingId && editingId !== 'new'
    ? users.find((u) => u.id === editingId) ?? null
    : null

  return (
    <SettingsSection theme={theme} title="People" kicker={`${activeUsers.length} active`}>
      <ReorderableList
        theme={theme}
        items={activeUsers}
        rowHeight={ROW_HEIGHT}
        onReorder={handleReorder}
        renderItem={(user) => (
          <PersonRow theme={theme} user={user} onTap={() => setEditingId(user.id)} />
        )}
      />

      <AddPersonButton theme={theme} onTap={() => setEditingId('new')} />

      {archivedUsers.length > 0 && (
        <ArchivedList theme={theme} users={archivedUsers} onTap={(id) => setEditingId(id)} />
      )}

      {editingId === 'new' && (
        <PersonEditSheet
          theme={theme}
          users={users}
          serverToday={serverToday}
          challengeStart={challengeStart}
          onClose={() => setEditingId(null)}
          onCreated={(user) => { onUserCreated(user); setEditingId(null) }}
          onUpdated={() => {}}
        />
      )}
      {editingUser && (
        <PersonEditSheet
          theme={theme}
          users={users}
          serverToday={serverToday}
          challengeStart={challengeStart}
          existing={editingUser}
          onClose={() => setEditingId(null)}
          onCreated={() => {}}
          onUpdated={(user) => { onUserUpdated(user); setEditingId(null) }}
        />
      )}
    </SettingsSection>
  )
}

function PersonRow({ theme, user, onTap }: { theme: ThemeSurfaces; user: User; onTap: () => void }) {
  const palette = paletteEntryFor(user.color_key)
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center gap-2.5 text-left"
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{ width: 30, height: 30, background: palette.hex, fontSize: 15, flexShrink: 0 }}
      >
        {user.emoji ?? '🙂'}
      </span>
      <span className="flex-1 min-w-0 truncate" style={{ ...TYPE_SCALE.bodyCopy, color: theme.ink }}>
        {user.display_name}
      </span>
      {user.claimed_at === null && (
        <span style={{ ...TYPE_SCALE.caption, color: theme.muted }}>Unclaimed</span>
      )}
    </button>
  )
}

function AddPersonButton({ theme, onTap }: { theme: ThemeSurfaces; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full flex items-center justify-center gap-1.5"
      style={{
        marginTop: 8, padding: '10px', borderRadius: RADIUS.calendarCell,
        border: `1px dashed ${theme.hairline}`, background: 'none', cursor: 'pointer',
        color: theme.muted, fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      }}
    >
      <Plus size={15} /> Add person
    </button>
  )
}

function ArchivedList({
  theme, users, onTap,
}: {
  theme: ThemeSurfaces
  users: User[]
  onTap: (id: string) => void
}) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.hairline}` }}>
      <span style={fieldLabelStyle(theme)}>Archived</span>
      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          onClick={() => onTap(user.id)}
          className="w-full flex items-center gap-2.5 text-left"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', opacity: 0.6 }}
        >
          <span style={{ fontSize: 15 }}>{user.emoji ?? '🙂'}</span>
          <span className="flex-1 min-w-0 truncate" style={{ ...TYPE_SCALE.bodyCopy, color: theme.ink }}>
            {user.display_name}
          </span>
          <span style={{ ...TYPE_SCALE.caption, color: theme.muted }}>Archived</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add / edit sheet
// ---------------------------------------------------------------------------

interface PersonEditSheetProps {
  theme: ThemeSurfaces
  users: User[]
  serverToday: string
  challengeStart: string
  existing?: User
  onClose: () => void
  onCreated: (user: User) => void
  onUpdated: (user: User) => void
}

function PersonEditSheet({
  theme, users, serverToday, challengeStart, existing, onClose, onCreated, onUpdated,
}: PersonEditSheetProps) {
  const [name, setName] = useState(existing?.display_name ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🙂')
  const [colorKey, setColorKey] = useState(existing?.color_key ?? firstAvailableColor(users, existing?.id))
  const [inPoints, setInPoints] = useState(existing?.in_points_challenge ?? true)
  const [inWeight, setInWeight] = useState(existing?.in_weight_challenge ?? false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  const takenColors: Record<string, string> = {}
  for (const user of users) {
    if (user.status === 'active' && user.id !== existing?.id) takenColors[user.color_key] = user.display_name
  }

  async function handleSave() {
    if (name.trim().length === 0) {
      setError('Name is required.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      if (existing) {
        const patch: UpdateUserRequest = {
          display_name: name.trim(), emoji, color_key: colorKey,
          in_points_challenge: inPoints, in_weight_challenge: inWeight,
        }
        onUpdated(await updateUser(existing.id, patch))
      } else {
        const body: CreateUserRequest = {
          display_name: name.trim(), emoji, color_key: colorKey,
          in_points_challenge: inPoints, in_weight_challenge: inWeight,
          active_from: computeDefaultActiveFrom(serverToday, challengeStart),
        }
        onCreated(await createUser(body))
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleArchiveToggle() {
    if (!existing) return
    setIsSubmitting(true)
    setError(null)
    try {
      const nextStatus = existing.status === 'active' ? 'archived' : 'active'
      onUpdated(await updateUser(existing.id, { status: nextStatus }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : GENERIC_ERROR)
    } finally {
      setIsSubmitting(false)
      setShowArchiveConfirm(false)
    }
  }

  return (
    <ConfirmSheet
      theme={theme}
      title={existing ? 'Edit person' : 'Add person'}
      confirmLabel={isSubmitting ? 'Saving…' : 'Save'}
      isSubmitting={isSubmitting}
      onConfirm={handleSave}
      onCancel={onClose}
      message={(
        <div>
          <label style={fieldLabelStyle(theme)} htmlFor="person-name">Name</label>
          <input
            id="person-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={textInputStyle(theme)}
            placeholder="Name"
          />

          <div style={{ marginTop: 14 }}>
            <IdentityEditor
              theme={theme}
              emoji={emoji}
              colorKey={colorKey}
              onEmojiChange={setEmoji}
              onColorChange={setColorKey}
              takenColors={takenColors}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <ToggleRow
              theme={theme}
              label="Points challenge"
              checked={inPoints}
              onChange={setInPoints}
              activeColor={paletteEntryFor(colorKey).hex}
            />
            <ToggleRow
              theme={theme}
              label="Weight challenge"
              checked={inWeight}
              onChange={setInWeight}
              activeColor={paletteEntryFor(colorKey).hex}
            />
          </div>

          {existing && (
            <ArchiveControl
              theme={theme}
              user={existing}
              onRequestArchive={() => setShowArchiveConfirm(true)}
              onRestore={handleArchiveToggle}
            />
          )}

          {error && <SettingsErrorText message={error} />}

          {showArchiveConfirm && (
            <ConfirmSheet
              theme={theme}
              title={`Archive ${existing?.display_name}?`}
              confirmLabel="Archive"
              isSubmitting={isSubmitting}
              onConfirm={handleArchiveToggle}
              onCancel={() => setShowArchiveConfirm(false)}
              message="This preserves every day already logged. They drop out of standings from
                today forward and their color frees up for someone new. You can restore them
                later — nothing is deleted."
            />
          )}
        </div>
      )}
    />
  )
}

function ArchiveControl({
  theme, user, onRequestArchive, onRestore,
}: {
  theme: ThemeSurfaces
  user: User
  onRequestArchive: () => void
  onRestore: () => void
}) {
  if (user.status === 'archived') {
    return (
      <div style={{ marginTop: 14 }}>
        <SettingsHint theme={theme}>
          Archived — hidden from standings, history intact.
        </SettingsHint>
        <ArchiveActionButton theme={theme} label="Restore" onClick={onRestore} />
      </div>
    )
  }
  return (
    <div style={{ marginTop: 14 }}>
      <ArchiveActionButton theme={theme} label="Archive this person" onClick={onRequestArchive} destructive />
    </div>
  )
}

function ArchiveActionButton({
  theme, label, onClick, destructive,
}: {
  theme: ThemeSurfaces
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  const color = destructive ? '#E5484D' : theme.ink
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', padding: '9px', borderRadius: RADIUS.checkbox,
        border: `1px solid ${destructive ? color : theme.hairline}`,
        background: 'none', color, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function firstAvailableColor(users: User[], excludeUserId: string | undefined): string {
  const taken = new Set(
    users.filter((u) => u.status === 'active' && u.id !== excludeUserId).map((u) => u.color_key),
  )
  return PALETTE_ORDER.find((key) => !taken.has(key)) ?? PALETTE_ORDER[0]
}
