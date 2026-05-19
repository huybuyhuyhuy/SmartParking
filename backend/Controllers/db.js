import "dotenv/config";
import sql from "mssql";

const envFlag = (value, fallback = false) => {
  if (value == null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const config = {
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_DATABASE || "SmartParking",
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: envFlag(process.env.DB_ENCRYPT, false),
    trustServerCertificate: envFlag(process.env.DB_TRUST_SERVER_CERTIFICATE, true)
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

if (process.env.DB_USER) config.user = process.env.DB_USER;
if (process.env.DB_PASSWORD) config.password = process.env.DB_PASSWORD;

let pool = null;

async function getPool() {
  if (pool) return pool;
  pool = await sql.connect(config);
  return pool;
}

export async function isSqlUp() {
  try {
    const p = await getPool();
    await p.request().query("SELECT 1");
    return true;
  } catch (_e) {
    return false;
  }
}

export function getDbRuntimeConfig() {
  return {
    server: config.server,
    database: config.database,
    port: config.port,
    authMode: config.user ? "sql" : "unspecified",
    encrypt: config.options.encrypt,
    trustServerCertificate: config.options.trustServerCertificate
  };
}

/**
 * Query wrapper — compatible with mysql2's db.query(sql, paramsArray).
 * Converts ? placeholders to @p1, @p2 ... and maps array params to named inputs.
 * Returns [rows] (mimics mysql2's [rows, fields] destructuring).
 */
async function query(sqlStr, params = []) {
  const conn = await getPool();
  let i = 0;
  const mssqlStr = sqlStr.replace(/\?/g, () => `@p${++i}`);
  const req = conn.request();
  for (let j = 0; j < params.length; j++) {
    req.input(`p${j + 1}`, params[j] != null ? params[j] : null);
  }
  const result = await req.query(mssqlStr);
  return [result.recordset];
}

export const db = { query };
