// Standings screen (spec §8.5): the owner wants their own device's person to appear first in the
// radar's person-toggle chips, the radar's list of selected people, and the ribbon rows — so
// whoever is looking at their own phone can find themselves instantly, without disturbing anyone
// else's order. Everyone else's relative order is the server's own `ORDER BY sort_order ASC,
// created_at ASC` (functions/_lib/users.ts) — the manual order the owner controls in Settings →
// People — so this is a pure "stable hoist," never a re-sort.
//
// Deliberately generic (`getId`) rather than three copies of the same find/filter tuned to
// LeaderboardEntry, RibbonRow, and a plain string[] of ids — all three shapes carry a user id
// under a different key (or *are* the id, for the radar's `selectedIds`).

/**
 * Moves the item whose id (via `getId`) equals `ownUserId` to index 0, preserving every other
 * item's existing relative order. Always returns a new array — the input is never mutated.
 *
 * If `ownUserId` is absent, or no item matches it (not in this list, archived, not selected —
 * whatever the reason), the list comes back unchanged: no gap, no crash, no reordering of anyone
 * else. That "no-op on absence" behavior is intentional, not an edge case to special-case away.
 */
export function ownPersonFirst<T>(
  items: readonly T[],
  ownUserId: string | null | undefined,
  getId: (item: T) => string,
): T[] {
  if (ownUserId == null) return [...items]

  const own = items.find((item) => getId(item) === ownUserId)
  if (!own) return [...items]

  const rest = items.filter((item) => getId(item) !== ownUserId)
  return [own, ...rest]
}
