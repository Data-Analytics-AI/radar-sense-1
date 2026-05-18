import { Pool, type PoolConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

function buildSslConfig(): PoolConfig["ssl"] {
  const sslmode = (process.env.HUAWEI_PGSSLMODE || "require").toLowerCase();
  const ca = process.env.HUAWEI_PGSSLROOTCERT;
  if (sslmode === "disable" || sslmode === "none" || sslmode === "") return false;
  // Permissive SSL: encrypt in transit but skip CA chain validation, since the
  // CA bundle currently configured does not validate Huawei RDS's chain from
  // outside the VPC. Tighten when a working CA is supplied.
  const cfg: { rejectUnauthorized: boolean; ca?: string } = { rejectUnauthorized: false };
  if (ca && ca.includes("BEGIN CERTIFICATE")) cfg.ca = ca;
  return cfg;
}

function readConfig(): PoolConfig | null {
  const host = process.env.HUAWEI_PGHOST;
  const database = process.env.HUAWEI_PGDATABASE;
  const user = process.env.HUAWEI_PGUSER;
  const password = process.env.HUAWEI_PGPASSWORD;
  if (!host || !database || !user || !password) return null;
  return {
    host,
    port: Number(process.env.HUAWEI_PGPORT || 5432),
    database,
    user,
    password,
    ssl: buildSslConfig(),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 30_000,
    application_name: "snapfort-api",
  };
}

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

export function isDbConfigured(): boolean {
  return readConfig() !== null;
}

export function getPool(): Pool {
  if (_pool) return _pool;
  const cfg = readConfig();
  if (!cfg) {
    throw new Error("Huawei RDS env vars missing (HUAWEI_PGHOST/PGDATABASE/PGUSER/PGPASSWORD).");
  }
  _pool = new Pool(cfg);
  _pool.on("error", (err) => {
    console.error("[db] pool error:", err.message);
  });
  return _pool;
}

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

export async function pingDb(): Promise<{ ok: boolean; latencyMs: number; version?: string; error?: string }> {
  const t0 = Date.now();
  try {
    const pool = getPool();
    const r = await pool.query("select version() as v");
    return { ok: true, latencyMs: Date.now() - t0, version: r.rows[0]?.v as string };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, latencyMs: Date.now() - t0, error: msg };
  }
}

export { schema };
