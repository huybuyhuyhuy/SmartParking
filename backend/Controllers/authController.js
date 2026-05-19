import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db, isSqlUp } from "./db.js";
import { sendError } from "./httpResponse.js";

const JWT_SECRET = process.env.JWT_SECRET || "smart-parking-hue-jwt-secret";

// In-memory fallback khi MySQL khong chay
const memoryUsers = new Map();

// Seed san tai khoan admin trong memory
const adminPasswordHash = (() => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync("123456", salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
})();

memoryUsers.set("admin@hue.vn", {
  id: 1,
  full_name: "Administrator",
  email: "admin@hue.vn",
  phone: "0900000000",
  role: "ADMIN",
  password_hash: adminPasswordHash,
  created_at: new Date().toISOString()
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const verify = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === verify;
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) {
    return sendError(res, 401, "AUTH_REQUIRED", "Authentication required");
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (_e) {
    return sendError(res, 401, "AUTH_TOKEN_INVALID", "Invalid or expired token");
  }
}

export function adminMiddleware(req, res, next) {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "OPERATOR") {
    return sendError(res, 403, "AUTH_ADMIN_OR_OPERATOR_REQUIRED", "Admin/Operator access required");
  }
  next();
}

export function strictAdminMiddleware(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return sendError(res, 403, "AUTH_ADMIN_REQUIRED", "Only ADMIN can access this resource");
  }
  next();
}

export function gateAccessMiddleware(req, res, next) {
  const providedGateKey = req.header("x-gate-api-key");
  const expectedGateKey = process.env.GATE_API_KEY || process.env.SENSOR_API_KEY || "hue-gate-key";
  if (providedGateKey && providedGateKey === expectedGateKey) {
    return next();
  }

  return authMiddleware(req, res, () => adminMiddleware(req, res, next));
}

export async function register(req, res) {
  const { fullName, email, password, phone } = req.body || {};
  if (!fullName || !email || !password) {
    return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "fullName, email, password are required");
  }

  // Check in-memory first
  if (memoryUsers.has(email)) {
    return sendError(res, 409, "AUTH_EMAIL_ALREADY_REGISTERED", "Email already registered");
  }

  const passwordHash = hashPassword(password);

  // Try MySQL first
  if (await isSqlUp()) {
    try {
      const [existing] = await db.query("SELECT id FROM users WHERE email=?", [email]);
      if (existing.length > 0) {
        return sendError(res, 409, "AUTH_EMAIL_ALREADY_REGISTERED", "Email already registered");
      }
      const [rows] = await db.query(
        "INSERT INTO users (full_name, email, phone, role, password_hash) OUTPUT INSERTED.id AS id VALUES (?, ?, ?, 'USER', ?)",
        [fullName, email, phone || "", passwordHash]
      );
      const userId = rows[0]?.id;
      if (!userId) throw new Error("User id was not returned by SQL Server");
      const token = signToken({ userId, email, role: "USER", fullName });
      return res.json({ token, user: { id: userId, fullName, email, role: "USER" } });
    } catch (err) {
      return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", "Registration failed", { cause: err.message });
    }
  }

  // In-memory fallback
  const newId = memoryUsers.size + 1;
  const newUser = {
    id: newId,
    full_name: fullName,
    email,
    phone: phone || "",
    role: "USER",
    password_hash: passwordHash,
    created_at: new Date().toISOString()
  };
  memoryUsers.set(email, newUser);

  const token = signToken({ userId: newId, email, role: "USER", fullName });
  return res.json({ token, user: { id: newId, fullName, email, role: "USER" } });
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "email and password are required");
  }

  // Try MySQL first
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        "SELECT id, full_name, email, role, password_hash FROM users WHERE email=?",
        [email]
      );
      if (rows.length > 0) {
        const user = rows[0];
        if (verifyPassword(password, user.password_hash)) {
          const token = signToken({ userId: user.id, email: user.email, role: user.role, fullName: user.full_name });
          return res.json({ token, user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role } });
        }
      }
    } catch (err) {
      return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", "Login failed", { cause: err.message });
    }
  }

  // In-memory fallback
  const memUser = memoryUsers.get(email);
  if (!memUser) {
    return sendError(res, 401, "AUTH_CREDENTIALS_INVALID", "Invalid email or password");
  }
  if (!verifyPassword(password, memUser.password_hash)) {
    return sendError(res, 401, "AUTH_CREDENTIALS_INVALID", "Invalid email or password");
  }
  const token = signToken({ userId: memUser.id, email: memUser.email, role: memUser.role, fullName: memUser.full_name });
  return res.json({
    token,
    user: { id: memUser.id, fullName: memUser.full_name, email: memUser.email, role: memUser.role }
  });
}

export async function getProfile(req, res) {
  try {
    if (await isSqlUp()) {
      const [rows] = await db.query(
        "SELECT id, full_name, email, phone, role, created_at FROM users WHERE id=?",
        [req.user.userId]
      );
      if (rows.length > 0) return res.json(rows[0]);
    }
    // In-memory fallback
    for (const u of memoryUsers.values()) {
      if (u.id === req.user.userId) return res.json(u);
    }
    return sendError(res, 404, "USER_NOT_FOUND", "User not found");
  } catch (err) {
    return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message);
  }
}
