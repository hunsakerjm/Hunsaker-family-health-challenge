// Shared environment bindings for all Pages Functions. Single source of
// truth for the Env shape so every handler and the host-lock middleware
// agree on what's available.
export interface Env {
  DB: D1Database
  // Pending: set by the orchestrator via `wrangler pages secret put`, not
  // by this build. Every reader must fail safe (500, no detail) if absent.
  INITIAL_FAMILY_PASSWORD?: string
  SESSION_SECRET?: string
  CANONICAL_HOST?: string
}
