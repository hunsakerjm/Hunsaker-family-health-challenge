// spec §3.4: "Any write [made for someone else, after the unlock confirmation] is recorded in
// audit_log with the acting user." `acting_user` is client-declared via the `X-Acting-User`
// header (spec §9) — advisory only, never used for authorization.
export async function recordAuditEntry(
  db: D1Database,
  entry: {
    actingUser: string | null
    action: string
    targetUser: string
    detail: unknown
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (at, acting_user, action, target_user, detail)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      new Date().toISOString(),
      entry.actingUser,
      entry.action,
      entry.targetUser,
      JSON.stringify(entry.detail),
    )
    .run()
}
