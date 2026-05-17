import "dotenv/config";
import sql from "mssql";

const config = {
  server: process.env.DB_SERVER || "localhost",
  database: process.env.DB_DATABASE || "SmartParking",
  port: Number(process.env.DB_PORT || 1433),
  options: {
    trustedConnection: true,
    trustServerCertificate: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

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
