import sql from "mssql";
import crypto from "crypto";

const config = {
  server: process.env.DB_SERVER || "localhost\\SQLEXPRESS01",
  database: process.env.DB_DATABASE || "smart_parking_hue",
  port: Number(process.env.DB_PORT || 1433),
  options: { trustedConnection: true, trustServerCertificate: true }
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

async function seed() {
  let pool;
  try {
    pool = await sql.connect(config);
    await pool.request().query("SELECT 1");

    const [existing] = (await pool.request().input("email", "admin@hue.vn").query(
      "SELECT id FROM users WHERE email = @email"
    )).recordsets;

    if (existing.length > 0) {
      console.log("[seed] Admin account already exists: admin@hue.vn");
    } else {
      const passwordHash = hashPassword("123456");
      await pool.request()
        .input("full_name", "Administrator")
        .input("email", "admin@hue.vn")
        .input("phone", "0900000000")
        .input("role", "ADMIN")
        .input("password_hash", passwordHash)
        .query(
          "INSERT INTO users (full_name, email, phone, role, password_hash) VALUES (@full_name, @email, @phone, @role, @password_hash)"
        );
      console.log("[seed] Created admin account: admin@hue.vn / 123456 (role: ADMIN)");
    }

    const [users] = (await pool.request().query(
      "SELECT id, full_name, email, role FROM users"
    )).recordsets;
    console.log("[seed] Current users in database:");
    users.forEach((u) => console.log(`  - ${u.email} (${u.role})`));

    await pool.close();
    console.log("[seed] Done.");
  } catch (err) {
    console.error("[seed] SQL Server error:", err.message);
    console.log("[seed] Tip: Make sure SQL Server is running and database 'smart_parking_hue' exists.");
    console.log("[seed] Run: sqlcmd -S .\\SQLEXPRESS01 -i backend/Data/smart_parking_sqlserver.sql");
    if (pool) await pool.close();
    process.exit(1);
  }
}

seed();
