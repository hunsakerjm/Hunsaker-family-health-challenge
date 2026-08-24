// Shared `users` row parsing and loaders (spec §3.2, §5). Used by `functions/api/bootstrap.ts`,
// `functions/api/users/index.ts`, and `functions/api/users/[id]/claim.ts` so all three agree on
// exactly one mapping from the D1 row shape to the wire `User` type.
import type { User, UserStatus } from '../../src/types'

export interface UserRow {
  id: string
  display_name: string
  color_key: string
  emoji: string | null
  sort_order: number
  in_points_challenge: number // D1 stores 0|1
  in_weight_challenge: number
  claimed_at: string | null
  active_from: string | null
  active_to: string | null
  status: string
  created_at: string
  updated_at: string
}

const USER_COLUMNS = `id, display_name, color_key, emoji, sort_order, in_points_challenge,
              in_weight_challenge, claimed_at, active_from, active_to, status, created_at, updated_at`

export function parseUserRow(row: UserRow): User {
  return {
    id: row.id,
    display_name: row.display_name,
    color_key: row.color_key,
    emoji: row.emoji,
    sort_order: row.sort_order,
    in_points_challenge: row.in_points_challenge === 1,
    in_weight_challenge: row.in_weight_challenge === 1,
    claimed_at: row.claimed_at,
    active_from: row.active_from,
    active_to: row.active_to,
    status: row.status as UserStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Every person, active and archived. Spec §9's bootstrap contract says "users with claim state"
 * with no status filter, and Settings (Phase 3C) will need archived rows too — callers that only
 * want the identity-picker set (spec §3.2) filter to `status === 'active'` themselves.
 */
export async function loadAllUsers(db: D1Database): Promise<User[]> {
  const result = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY sort_order ASC, created_at ASC`)
    .all<UserRow>()
  return (result.results ?? []).map(parseUserRow)
}

export async function loadUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(id)
    .first<UserRow>()
  return row ? parseUserRow(row) : null
}
