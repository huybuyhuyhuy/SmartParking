import { db, getDbRuntimeConfig, isSqlUp } from "../Controllers/db.js";

const ok = await isSqlUp();
if (!ok) {
  console.error("database connection failed", getDbRuntimeConfig());
  process.exitCode = 1;
} else {
  const [lotRows] = await db.query("SELECT COUNT(*) AS total FROM parking_lots");
  const [userRows] = await db.query("SELECT COUNT(*) AS total FROM users");
  console.log(JSON.stringify({
    connected: true,
    config: getDbRuntimeConfig(),
    parkingLots: lotRows[0]?.total ?? 0,
    users: userRows[0]?.total ?? 0
  }, null, 2));
}
