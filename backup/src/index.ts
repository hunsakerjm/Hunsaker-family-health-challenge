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
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runBackup(env));
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

interface TableInfo {
  name: string;
  createSql: string;
}

async function exportDatabaseToSql(db: D1Database): Promise<string> {
  const tables = await listUserTables(db);
  const tableDumps = await Promise.all(tables.map((table) => dumpTable(db, table)));
  return tableDumps.join("\n\n");
}

// Excludes SQLite's own internal tables (sqlite_%) and D1's internal Cloudflare
// tables (_cf_%) — only the app's own tables, matching what `wrangler d1 export`
// includes for `migrations/0001_schema.sql` plus anything added by later
// migrations (e.g. `d1_migrations` itself, which is a normal table).
async function listUserTables(db: D1Database): Promise<TableInfo[]> {
  const result = await db
    .prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
       ORDER BY name`,
    )
    .all<{ name: string; sql: string }>();

  return result.results.map((row) => ({ name: row.name, createSql: row.sql }));
}

async function dumpTable(db: D1Database, table: TableInfo): Promise<string> {
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
