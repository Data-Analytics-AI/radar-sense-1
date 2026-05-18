// Apply generated drizzle SQL to Huawei RDS using direct pg connection.
// Usage: node scripts/apply-schema.mjs [path/to/file.sql]
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const sslmode = (process.env.HUAWEI_PGSSLMODE || "require").toLowerCase();
const ca = process.env.HUAWEI_PGSSLROOTCERT;
let ssl = false;
if (sslmode !== "disable" && sslmode !== "none" && sslmode !== "") {
  ssl = { rejectUnauthorized: false };
  if (ca && ca.includes("BEGIN CERTIFICATE")) ssl.ca = ca;
}

const client = new pg.Client({
  host: process.env.HUAWEI_PGHOST,
  port: Number(process.env.HUAWEI_PGPORT || 5432),
  database: process.env.HUAWEI_PGDATABASE,
  user: process.env.HUAWEI_PGUSER,
  password: process.env.HUAWEI_PGPASSWORD,
  ssl,
  connectionTimeoutMillis: 15_000,
});

const file = process.argv[2] || "drizzle/0000_friendly_roxanne_simpson.sql";
const sqlRaw = fs.readFileSync(path.resolve(file), "utf8");

const statements = sqlRaw
  .split(/-->\s*statement-breakpoint/g)
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`[apply-schema] Connecting to ${process.env.HUAWEI_PGHOST}:${process.env.HUAWEI_PGPORT}/${process.env.HUAWEI_PGDATABASE} (sslmode=${sslmode})`);
await client.connect();
console.log(`[apply-schema] Connected. Applying ${statements.length} statements from ${file}`);

let applied = 0;
let skipped = 0;
for (const stmt of statements) {
  try {
    await client.query(stmt);
    applied++;
  } catch (e) {
    const msg = String(e?.message || e);
    if (msg.includes("already exists")) {
      skipped++;
      continue;
    }
    console.error("[apply-schema] FAILED:", msg);
    console.error("statement (first 200):", stmt.slice(0, 200));
    process.exit(1);
  }
}

console.log(`[apply-schema] Done. applied=${applied} skipped=${skipped}`);
await client.end();
