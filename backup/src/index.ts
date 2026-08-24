// Scheduled D1 -> R2 backup Worker. Undeployed by design — see backup/README.md
// for what the owner must provision and approve before this can run.
//
// D1's Worker binding has no built-in "dump the whole database" call (that only
// exists in the wrangler CLI as `wrangler d1 export`, which talks to a different
// internal API than the runtime binding). This handler reconstructs an equivalent
// SQL text export by reading `sqlite_master` for each table's CREATE statement,
// then re-serializing every row as an INSERT statement — the same technique used
// by community D1-to-R2 backup tools (see backup/README.md for references).
//
// This is a redundant safety net, not the primary backup path. The guaranteed,
// spec-required procedure is the manual `wrangler d1 export` documented in the
// root README's "Backup and restore" section; treat that as the one to actually
// restore from. This Worker exists to add unattended weekly coverage on top of it.

export interface Env {
  DB: D1Database;
  BACKUP_BUCKET: R2Bucket;
  BACKUP_RETENTION_COUNT?: string;
}

const DEFAULT_RETENTION_COUNT = 26; // ~6 months of weekly backups
const BACKUP_KEY_PREFIX = "health-challenge-";

export default {
  // Awaited directly, not handed to `ctx.waitUntil`: `waitUntil` is for work
  // that should outlive a response Cloudflare has already sent back, which
  // does not apply to a scheduled invocation. If `runBackup` threw inside a
  // `waitUntil` call, the scheduled event would still report success and the
  // failure would surface nowhere — the worst possible failure mode for a
  // backup. Awaiting it lets a thrown error reject the handler, which shows
  // up as a failed invocation in the dashboard and in `wrangler tail`.
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runBackup(env);
  },
};

async function runBackup(env: Env): Promise<void> {
  const sql = await exportDatabaseToSql(env.DB);
  const key = buildBackupKey(new Date());

  await env.BACKUP_BUCKET.put(key, sql, {
    httpMetadata: { contentType: "application/sql" },
  });

  await pruneOldBackups(env);
}

function buildBackupKey(date: Date): string {
  const timestamp = date.toISOString().replace(/[:.]/g, "-");
  return `${BACKUP_KEY_PREFIX}${timestamp}.sql`;
}

interface SchemaObject {
  name: string;
  type: "table" | "index" | "trigger" | "view";
  createSql: string;
}

async function exportDatabaseToSql(db: D1Database): Promise<string> {
  const objects = await listSchemaObjects(db);
  const tables = objects.filter((object) => object.type === "table");
  const auxiliaryObjects = objects.filter((object) => object.type !== "table");

  const tableDumps = await Promise.all(tables.map((table) => dumpTable(db, table)));
  const auxiliaryStatements = auxiliaryObjects.map((object) => `${object.createSql};`);

  // wrangler's own `d1 export` output begins with exactly this pragma and
  // never wraps its statements in an explicit transaction (confirmed against
  // a real export of this project's production database). `tables` above is
  // ordered alphabetically by `sqlite_master`, not by foreign-key dependency
  // — e.g. `log_entries` and `weight_entries` both reference `users` but sort
  // before it — so without this, replaying the file would insert child rows
  // before their parents exist and the restore would fail. Deferring FK
  // constraint checking until the whole file has executed is what makes
  // dependency order not matter. Do not remove this line or move it after
  // any table/insert statement.
  const deferForeignKeysPragma = "PRAGMA defer_foreign_keys=TRUE;";

  // Indexes, triggers, and views are emitted last, after every table's CREATE
  // and all of its INSERTs: building a (especially unique) index against an
  // already-populated table is one bulk build instead of maintaining it
  // row-by-row during insert, and it also sidesteps ever creating an index
  // before its own table exists.
  return [deferForeignKeysPragma, ...tableDumps, ...auxiliaryStatements].join("\n\n");
}

// Excludes SQLite's own internal objects (sqlite_%) and D1's internal
// Cloudflare objects (_cf_%). `sql IS NOT NULL` drops SQLite's automatic
// indexes for PRIMARY KEY/UNIQUE column constraints (those have a NULL `sql`
// and are recreated implicitly by the table's own CREATE TABLE statement) —
// without that filter this would try to re-emit them as free-floating CREATE
// INDEX statements with nothing to attach to. What's left is every real
// table plus the schema's explicitly named indexes: `ux_users_color_active`
// and `ux_weight_baseline` (both UNIQUE — the latter is spec §5's single-
// baseline-weight-per-person constraint) and the plain lookup indexes
// (`ix_log_date`, `ix_log_user_date`, `ix_login_attempts_ip_at`). Losing the
// unique ones silently is the dangerous failure mode: a restored database
// would accept a second baseline weight per person with no error.
async function listSchemaObjects(db: D1Database): Promise<SchemaObject[]> {
  const result = await db
    .prepare(
      `SELECT name, type, sql FROM sqlite_master
       WHERE type IN ('table', 'index', 'trigger', 'view')
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_cf_%'
         AND sql IS NOT NULL
       ORDER BY name`,
    )
    .all<{ name: string; type: SchemaObject["type"]; sql: string }>();

  return result.results.map((row) => ({ name: row.name, type: row.type, createSql: row.sql }));
}

async function dumpTable(db: D1Database, table: SchemaObject): Promise<string> {
  const rows = await db.prepare(`SELECT * FROM "${table.name}"`).all<Record<string, unknown>>();
  const insertStatements = rows.results.map((row) => buildInsertStatement(table.name, row));
  return [`${table.createSql};`, ...insertStatements].join("\n");
}

function buildInsertStatement(tableName: string, row: Record<string, unknown>): string {
  const columns = Object.keys(row);
  const columnList = columns.map((column) => `"${column}"`).join(",");
  const valueList = columns.map((column) => escapeSqlValue(row[column])).join(",");
  return `INSERT INTO "${tableName}" (${columnList}) VALUES (${valueList});`;
}

// No BLOB handling: a D1 blob column value arrives here as an ArrayBuffer,
// which `String(value)` would stringify into garbage rather than a valid SQL
// byte literal. Not a live bug — every column in `migrations/0001_schema.sql`
// and `0003_rate_limit.sql` is TEXT, INTEGER, or REAL — but a future
// migration that adds a BLOB column would corrupt this Worker's backups
// silently, with no error at backup time. See backup/README.md.
function escapeSqlValue(value: unknown): string {
  const isNullish = value === null || value === undefined;
  if (isNullish) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  const singleQuotesDoubled = String(value).replace(/'/g, "''");
  return `'${singleQuotesDoubled}'`;
}

async function pruneOldBackups(env: Env): Promise<void> {
  const retentionCount = Number(env.BACKUP_RETENTION_COUNT) || DEFAULT_RETENTION_COUNT;
  const listing = await env.BACKUP_BUCKET.list({ prefix: BACKUP_KEY_PREFIX });

  // ISO-8601 timestamps in the key sort lexicographically in chronological order.
  const sortedOldestFirst = listing.objects.map((object) => object.key).sort();
  const excessCount = Math.max(0, sortedOldestFirst.length - retentionCount);
  const keysToDelete = sortedOldestFirst.slice(0, excessCount);

  for (const key of keysToDelete) {
    await env.BACKUP_BUCKET.delete(key);
  }
}
