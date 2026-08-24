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

// Phase 3C (spec §7, §8.7): the DB enforces uniqueness with
// `CREATE UNIQUE INDEX ux_users_color_active ON users(color_key) WHERE status = 'active'`, but
// checking this proactively before INSERT/UPDATE gives a clean {code,message} error instead of
// string-matching a driver-level SQLITE_CONSTRAINT message (Docs/DECISIONS.md, 2026-08-24).
// `excludeUserId` lets an update ignore the row's own current color when re-saving unrelated
// fields — pass null when creating a brand new person.
export async function isColorTakenByActiveUser(
  db: D1Database,
  colorKey: string,
  excludeUserId: string | null,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM users WHERE color_key = ? AND status = 'active' AND id != ? LIMIT 1`)
    .bind(colorKey, excludeUserId ?? '')
    .first()
  return row !== null
}

/** New people append to the end of the People list (spec §8.7 drag-to-reorder starting point). */
export async function nextUserSortOrder(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM users`)
    .first<{ next: number }>()
  return row?.next ?? 0
}
