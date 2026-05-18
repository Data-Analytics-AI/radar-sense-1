import { Client } from 'pg';

const sslmode = (process.env.HUAWEI_PGSSLMODE || 'require').toLowerCase();
const ca = process.env.HUAWEI_PGSSLROOTCERT;
let ssl;
if (sslmode === 'disable' || sslmode === 'none' || sslmode === '') ssl = false;
else { ssl = { rejectUnauthorized: false }; if (ca && ca.includes('BEGIN CERTIFICATE')) ssl.ca = ca; }

const cfg = {
  host: process.env.HUAWEI_PGHOST,
  port: Number(process.env.HUAWEI_PGPORT || 5432),
  database: process.env.HUAWEI_PGDATABASE,
  user: process.env.HUAWEI_PGUSER,
  password: process.env.HUAWEI_PGPASSWORD,
  ssl,
  connectionTimeoutMillis: 10000,
  statement_timeout: 8000,
};

const t0 = Date.now();
const client = new Client(cfg);
try {
  await client.connect();
  const v = await client.query('select version() as v, current_database() as db, current_user as usr, now() as ts');
  const sch = await client.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
  console.log('OK in', Date.now() - t0, 'ms');
  console.log(v.rows[0]);
  console.log('public tables:', sch.rows[0].n);
  await client.end();
} catch (e) {
  console.log('ERR after', Date.now() - t0, 'ms');
  console.log('code:', e.code, 'errno:', e.errno, 'syscall:', e.syscall, 'addr:', e.address, 'port:', e.port);
  console.log('message:', e.message);
  console.log('cfg:', { host: cfg.host, port: cfg.port, db: cfg.database, user: cfg.user, sslmode, caBytes: ca ? ca.length : 0 });
  process.exit(1);
}
