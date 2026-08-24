import type { Env } from './env'
import { derivePbkdf2HashBase64, generateSaltBase64 } from './crypto'

interface PasswordRecord {
  hash: string
  salt: string
}

// DESIGN DECISION (see Docs/DECISIONS.md): spec §3.1 says the password hash
// is "seeded on first migration from secret INITIAL_FAMILY_PASSWORD," but a
// static .sql migration file cannot read a Cloudflare secret. Instead, this
// derives and persists the PBKDF2 hash from the secret the first time any
// request needs it — a bootstrap-on-first-use in the Function layer rather
// than in the migration. After the first successful bootstrap, this is a
// single read for the lifetime of the password (until changed in Settings).
export async function getOrBootstrapPasswordRecord(env: Env): Promise<PasswordRecord | null> {
  const existing = await readPasswordRecord(env.DB)
  if (existing) return existing

  if (!env.INITIAL_FAMILY_PASSWORD) return null

  const salt = generateSaltBase64()
  const hash = await derivePbkdf2HashBase64(env.INITIAL_FAMILY_PASSWORD, salt)
  await writePasswordRecordIfAbsent(env.DB, hash, salt)

  // Re-read after the conditional write so two cold requests racing on the
  // very first login converge on one salt/hash pair instead of each one
  // trusting its own locally derived (and now possibly discarded) values.
  return readPasswordRecord(env.DB)
}

async function readPasswordRecord(db: D1Database): Promise<PasswordRecord | null> {
  const result = await db
    .prepare(
      `SELECT key, value FROM app_config WHERE key IN ('family_password_hash', 'family_password_salt')`,
    )
    .all<{ key: string; value: string }>()

  const rows = result.results ?? []
  const hash = rows.find((row) => row.key === 'family_password_hash')?.value
  const salt = rows.find((row) => row.key === 'family_password_salt')?.value
  return hash && salt ? { hash, salt } : null
}

async function writePasswordRecordIfAbsent(db: D1Database, hash: string, salt: string): Promise<void> {
  const now = new Date().toISOString()
  // INSERT OR IGNORE inside one batch (D1 runs a batch as one transaction):
  // if a concurrent request already bootstrapped between our read and this
  // write, this is a no-op and the caller's re-read picks up that winner.
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES ('family_password_hash', ?, ?)`,
      )
      .bind(hash, now),
    db
      .prepare(
        `INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES ('family_password_salt', ?, ?)`,
      )
      .bind(salt, now),
  ])
}
