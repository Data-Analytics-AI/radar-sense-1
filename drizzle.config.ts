import type { Config } from "drizzle-kit";

const sslmode = (process.env.HUAWEI_PGSSLMODE || "require").toLowerCase();
const ca = process.env.HUAWEI_PGSSLROOTCERT;

let ssl: Config["dbCredentials"]["ssl"] = false;
if (sslmode !== "disable" && sslmode !== "none" && sslmode !== "") {
  const cfg: { rejectUnauthorized: boolean; ca?: string } = { rejectUnauthorized: false };
  if (ca && ca.includes("BEGIN CERTIFICATE")) cfg.ca = ca;
  ssl = cfg;
}

export default {
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.HUAWEI_PGHOST!,
    port: Number(process.env.HUAWEI_PGPORT || 5432),
    database: process.env.HUAWEI_PGDATABASE!,
    user: process.env.HUAWEI_PGUSER!,
    password: process.env.HUAWEI_PGPASSWORD!,
    ssl,
  },
} satisfies Config;
