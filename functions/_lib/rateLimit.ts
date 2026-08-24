// Login rate limiting per spec §3.1: 10 attempts per IP per 15 minutes,
// enforced in the Function layer (not at the edge) so it also protects the
// *.pages.dev hostname, which sits outside the owner's zone-level WAF.
const MAX_ATTEMPTS = 10
const WINDOW_SECONDS = 15 * 60
const RETENTION_SECONDS = 60 * 60 // prune anything older than an hour on every write

export async function isRateLimited(db: D1Database, ip: string): Promise<boolean> {
  const windowStartIso = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()
  const row = await db
    .prepare(`SELECT COUNT(*) as count FROM login_attempts WHERE ip = ? AND at >= ?`)
    .bind(ip, windowStartIso)
    .first<{ count: number }>()
  return (row?.count ?? 0) >= MAX_ATTEMPTS
}

export async function recordLoginAttempt(db: D1Database, ip: string): Promise<void> {
  const now = new Date()
  const cutoffIso = new Date(now.getTime() - RETENTION_SECONDS * 1000).toISOString()
  // Opportunistic cleanup piggybacks on every attempt so the table never
  // grows unbounded without a separate cron job.
  await db.batch([
    db.prepare(`INSERT INTO login_attempts (ip, at) VALUES (?, ?)`).bind(ip, now.toISOString()),
    db.prepare(`DELETE FROM login_attempts WHERE at < ?`).bind(cutoffIso),
  ])
}
