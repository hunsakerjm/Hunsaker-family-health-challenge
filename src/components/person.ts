import type { PersonColorKey } from '../theme'

/**
 * The minimal person shape the design-system primitives need to render.
 *
 * This is intentionally NOT the full API person record (that shape belongs
 * in the shared `src/types.ts` contract, owned by the foundation track).
 * Primitives here only ever need a name, an emoji, and a claimed color.
 */
export interface PersonSummary {
  name: string
  emoji: string
  color: PersonColorKey
}
