const DEFAULT_SESSION_VERSION = 1

// app_config.session_version is stored as TEXT (schema §5). Anything
// unparsable falls back to the default rather than throwing, since a
// corrupt config value must never crash the request path.
export async function getSessionVersion(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT value FROM app_config WHERE key = 'session_version'`)
    .first<{ value: string }>()
  const parsed = row ? Number.parseInt(row.value, 10) : NaN
  return Number.isFinite(parsed) ? parsed : DEFAULT_SESSION_VERSION
}
