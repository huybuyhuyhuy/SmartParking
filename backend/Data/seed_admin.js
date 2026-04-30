import mysql from "mysql2/promise";
import crypto from "crypto";

const db = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "root",
  database: process.env.MYSQL_DATABASE || "smart_parking_hue",
  waitForConnections: true,
  connectionLimit: 5
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

async function seed() {
  try {
    await db.query("SELECT 1");

    const [existing] = await db.query("SELECT id FROM users WHERE email=?", ["admin@hue.vn"]);
    if (existing.length > 0) {
      console.log("[seed] Admin account already exists: admin@hue.vn");
    } else {
      const passwordHash = hashPassword("123456");
      await db.query(
        "INSERT INTO users (full_name, email, phone, role, password_hash) VALUES (?, ?, ?, ?, ?)",
        ["Administrator", "admin@hue.vn", "0900000000", "ADMIN", passwordHash]
      );
      console.log("[seed] Created admin account: admin@hue.vn / 123456 (role: ADMIN)");
    }

    const [users] = await db.query("SELECT id, full_name, email, role FROM users");
    console.log("[seed] Current users in database:");
    users.forEach((u) => console.log(`  - ${u.email} (${u.role})`));

    await db.end();
    console.log("[seed] Done.");
  } catch (err) {
    console.error("[seed] MySQL error:", err.message);
    console.log("[seed] Tip: Make sure MySQL is running and database 'smart_parking_hue' exists.");
    console.log("[seed] Run: mysql -u root -p < backend/Data/init_schema.sql");
    await db.end();
    process.exit(1);
  }
}

seed();
