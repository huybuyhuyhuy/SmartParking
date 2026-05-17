import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { getNearbyParking } from "./Controllers/parkingController.js";
import { getSlotEvents, getSlots, initSlotState, seedMemorySlotEvents, updateSlotBySensor } from "./Controllers/slotController.js";
import { gateScan, getGateEvents, issueUserQr, verifyAdminQr } from "./Controllers/qrController.js";
import { confirmPaymentAndGenerateQr } from "./Controllers/paymentController.js";
import { createMomoPayment, momoIpnHandler, checkPaymentStatus } from "./Controllers/momoController.js";
import { createBooking, getBooking, listCurrentUserBookings, listUserBookings, getAllBookings, lookupActiveBooking, checkoutHandler, getMemoryBookings } from "./Controllers/bookingController.js";
import { register, login, getProfile, authMiddleware, strictAdminMiddleware } from "./Controllers/authController.js";
import { getDashboardStats, getRevenueChart, getOccupancyTrend, getLotUtilization, getCapacityForecast } from "./Controllers/analyticsController.js";
import { db } from "./Controllers/db.js";
import { redis } from "./Controllers/redisClient.js";
import { deleteParkingLot, listParkingLots, upsertParkingLot } from "./Controllers/parkingLotController.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { execFile } from "node:child_process";
import { createWsServer } from "./wsServer.js";
import { isKafkaConnected, isKafkaEnabled } from "./Controllers/kafkaClient.js";

dotenv.config();

async function ensureDatabaseSeeded() {
  try {
    const [rows] = await db.query("SELECT COUNT(*) AS cnt FROM parking_lots");
    if (rows[0].cnt > 0) return;

    console.log("[db] parking_lots empty, importing smart_parking_sqlserver.sql ...");
    const sqlFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "Data", "smart_parking_sqlserver.sql");
    const server = process.env.DB_SERVER || "localhost\\SQLEXPRESS01";

    await new Promise((resolve, reject) => {
      const child = execFile("sqlcmd", ["-S", server, "-i", sqlFile], { stdio: "inherit" }, (err) => {
        err ? reject(err) : resolve();
      });
    });
    console.log("[db] smart_parking_sqlserver.sql imported successfully");
  } catch (e) {
    console.warn("[db] Auto-import skipped:", e.message);
  }
}
async function ensureExtraChargeColumn() {
  try {
    await db.query(
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('bookings') AND name = 'extra_charge')
       ALTER TABLE bookings ADD extra_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00`
    );
  } catch (_e) { /* Column may already exist */ }
}
async function ensureScheduledStartColumn() {
  try {
    await db.query(
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('bookings') AND name = 'scheduled_start')
       ALTER TABLE bookings ADD scheduled_start DATETIME2 NULL`
    );
    console.log("[db] Added scheduled_start column to bookings");
  } catch (_e) { /* Column may already exist */ }
}
async function ensurePricePerHourMotorbikeColumn() {
  try {
    await db.query(
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('parking_lots') AND name = 'price_per_hour_motorbike')
       ALTER TABLE parking_lots ADD price_per_hour_motorbike DECIMAL(10,2) NULL`
    );
    console.log("[db] Added price_per_hour_motorbike column to parking_lots");
  } catch (_e) { /* Column may already exist */ }
}
async function ensureBookingVehicleTypeColumn() {
  try {
    await db.query(
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('bookings') AND name = 'vehicle_type')
       ALTER TABLE bookings ADD vehicle_type NVARCHAR(20) NOT NULL DEFAULT 'CAR'`
    );
    console.log("[db] Added vehicle_type column to bookings");
  } catch (_e) { /* Column may already exist */ }
}

async function ensureSampleData() {
  let useMemory = false;
  try {
    await db.query("DELETE FROM slot_events WHERE parking_lot_id LIKE 'HUE-P%' AND created_at < DATEADD(DAY, -30, GETDATE())");
    await db.query("DELETE FROM bookings WHERE user_id = 1");
  } catch (_e) {
    useMemory = true; // SQL Server not available — seed into memory fallback
  }

  const mode = useMemory ? "memory" : "sqlserver";
  console.log(`[db] Seeding sample bookings & slot_events for dashboard (${mode})...`);

  const today = new Date().toISOString().slice(0, 10);
  const d = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(d); dt.setDate(dt.getDate() - i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const yesterday = days[5];

  const sampleBookings = [
    { userId: 1, lotId: "HUE-P001", plate: "75A-12345", vehicleType: "CAR", phone: "0905123456", estHours: 2, amount: 10000, provider: "DIRECT", status: "PAID", startedAt: `${today} 08:15:00`, endedAt: `${today} 10:15:00` },
    { userId: 1, lotId: "HUE-P002", plate: "75A-67890", vehicleType: "CAR", phone: "0905987654", estHours: 4, amount: 28000, provider: "MOMO", status: "PAID", startedAt: `${today} 09:30:00`, endedAt: `${today} 13:30:00` },
    { userId: 1, lotId: "HUE-P003", plate: "75F1-11122", vehicleType: "MOTORBIKE", phone: "0913123444", estHours: 2, amount: 4000, provider: "DIRECT", status: "PAID", startedAt: `${today} 08:00:00`, endedAt: `${today} 10:00:00` },
    { userId: 1, lotId: "HUE-P004", plate: "75F1-33344", vehicleType: "MOTORBIKE", phone: "0913555666", estHours: 3, amount: 6000, provider: "MOMO", status: "PAID", startedAt: `${today} 10:00:00`, endedAt: `${today} 13:00:00` },
    { userId: 1, lotId: "HUE-P003", plate: "43A-11223", vehicleType: "CAR", phone: "0913123456", estHours: 2, amount: 10000, provider: "DIRECT", status: "PAID", startedAt: `${today} 07:00:00`, endedAt: `${today} 09:15:00` },
    { userId: 1, lotId: "HUE-P001", plate: "43A-44556", vehicleType: "CAR", phone: "0913987654", estHours: 1, amount: 5000, provider: "DIRECT", status: "PAID", startedAt: `${today} 10:00:00`, endedAt: `${today} 11:00:00` },
    { userId: 1, lotId: "HUE-P002", plate: "75F1-55566", vehicleType: "MOTORBIKE", phone: "0905777888", estHours: 1, amount: 3000, provider: "DIRECT", status: "PAID", startedAt: `${today} 12:00:00`, endedAt: `${today} 13:00:00` },
    { userId: 1, lotId: "HUE-P004", plate: "92A-77889", vehicleType: "CAR", phone: "0905111222", estHours: 3, amount: 30000, provider: null, status: "PENDING", startedAt: `${today} 11:45:00` },
    { userId: 1, lotId: "HUE-P002", plate: "75A-12345", vehicleType: "CAR", phone: "0905123456", estHours: 2, amount: 14000, provider: "DIRECT", status: "PAID", startedAt: `${yesterday} 14:00:00`, endedAt: `${yesterday} 16:30:00` },
    { userId: 1, lotId: "HUE-P001", plate: "75F1-77788", vehicleType: "MOTORBIKE", phone: "0905888999", estHours: 2, amount: 4000, provider: "DIRECT", status: "PAID", startedAt: `${yesterday} 09:00:00`, endedAt: `${yesterday} 11:00:00` },
    ...[2,3,4,5,6].map((daysAgo) => {
      const dt = days[6 - daysAgo];
      return [
        { userId: 1, lotId: "HUE-P003", plate: `43A-${10000 + daysAgo}1`, vehicleType: "CAR", phone: "0905000001", estHours: 2, amount: 10000, provider: "DIRECT", status: "PAID", startedAt: `${dt} 08:00:00`, endedAt: `${dt} 10:00:00` },
        { userId: 1, lotId: "HUE-P001", plate: `75F1-${20000 + daysAgo}2`, vehicleType: "MOTORBIKE", phone: "0905000002", estHours: 1, amount: 2000, provider: "MOMO", status: "PAID", startedAt: `${dt} 14:00:00`, endedAt: `${dt} 15:00:00` },
      ];
    }).flat()
  ];

  if (useMemory) {
    const mem = getMemoryBookings();
    // Clear previous memory seed for user 1
    for (let i = mem.length - 1; i >= 0; i--) {
      if (mem[i].user_id === 1) mem.splice(i, 1);
    }
    let nextId = mem.length > 0 ? Math.max(...mem.map((b) => Number(b.id) || 0)) + 1 : 1;
    for (const b of sampleBookings) {
      mem.unshift({
        id: String(nextId++),
        user_id: b.userId,
        parking_lot_id: b.lotId,
        plate_number: b.plate,
        vehicle_type: b.vehicleType,
        phone_number: b.phone,
        estimated_hours: b.estHours,
        amount: b.amount,
        payment_provider: b.provider,
        payment_status: b.status,
        started_at: b.startedAt,
        ended_at: b.endedAt || null,
        created_at: b.startedAt
      });
    }
  } else {
    for (const b of sampleBookings) {
      try {
        await db.query(
          `INSERT INTO bookings (user_id, parking_lot_id, plate_number, vehicle_type, phone_number, estimated_hours, started_at, ended_at, amount, payment_provider, payment_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [b.userId, b.lotId, b.plate, b.vehicleType, b.phone, b.estHours, b.startedAt, b.endedAt || null, b.amount, b.provider, b.status, b.startedAt]
        );
      } catch (_e) {}
    }
  }

  // Seed slot_events for occupancy chart
  const sampleEvents = [
    { lotId: "HUE-P001", slots: 48, source: "GATE_OUT", ts: `${today} 07:05:00` },
    { lotId: "HUE-P001", slots: 47, source: "BOOKING_RESERVATION", ts: `${today} 08:15:00` },
    { lotId: "HUE-P002", slots: 34, source: "BOOKING_RESERVATION", ts: `${today} 09:30:00` },
    { lotId: "HUE-P003", slots: 78, source: "GATE_OUT", ts: `${today} 07:10:00` },
    { lotId: "HUE-P003", slots: 77, source: "BOOKING_RESERVATION", ts: `${today} 07:00:00` },
    { lotId: "HUE-P004", slots: 149, source: "BOOKING_RESERVATION", ts: `${today} 11:45:00` },
    { lotId: "HUE-P001", slots: 48, source: "GATE_OUT", ts: `${today} 09:16:00` },
    { lotId: "HUE-P001", slots: 47, source: "BOOKING_RESERVATION", ts: `${today} 10:00:00` },
    { lotId: "HUE-P001", slots: 48, source: "CHECKOUT", ts: `${today} 11:01:00` },
  ];

  if (!useMemory) {
    for (const e of sampleEvents) {
      try {
        await db.query(
          "INSERT INTO slot_events (parking_lot_id, available_slots, source, created_at) VALUES (?, ?, ?, ?)",
          [e.lotId, e.slots, e.source, e.ts]
        );
      } catch (_e) {}
    }
  } else {
    seedMemorySlotEvents(sampleEvents);
  }

  console.log("[db] Sample data seeded: %d bookings + %d slot_events (%s)", sampleBookings.length, sampleEvents.length, mode);
}

const app = express();
app.use(cors());
app.use(express.json());

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ==================== PUBLIC routes (khong can dang nhap) ====================
app.get("/api/nearby", asyncHandler(getNearbyParking));
app.get("/api/parking-lots", asyncHandler(listParkingLots));
app.get("/api/restricted-zones", asyncHandler(async (req, res) => {
  const data = await fs.readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "Data", "restricted_zones.json"), "utf-8");
  res.json(JSON.parse(data));
}));
app.get("/api/slots", asyncHandler(getSlots));
app.put("/api/slots/:id", asyncHandler(updateSlotBySensor));
app.post("/api/qr/issue", asyncHandler(issueUserQr));
app.post("/api/gate/scan", asyncHandler(gateScan));
app.post("/api/payments/confirm", asyncHandler(confirmPaymentAndGenerateQr));

// BOOKING
app.post("/api/bookings", authMiddleware, asyncHandler(createBooking));
app.get("/api/bookings/active", asyncHandler(lookupActiveBooking));
app.get("/api/bookings/:bookingId", asyncHandler(getBooking));
app.get("/api/users/:userId/bookings", asyncHandler(listUserBookings));
app.get("/api/me/bookings", authMiddleware, asyncHandler(listCurrentUserBookings));
app.post("/api/checkout", authMiddleware, asyncHandler(checkoutHandler));

// MOMO payment (public)
app.post("/api/payments/momo", asyncHandler(createMomoPayment));
app.post("/api/payments/momo/ipn", asyncHandler(momoIpnHandler));
app.get("/api/payments/status/:bookingId", asyncHandler(checkPaymentStatus));

// AUTH (public)
app.post("/api/auth/register", asyncHandler(register));
app.post("/api/auth/login", asyncHandler(login));

// ==================== PROTECTED routes (yeu cau dang nhap) ====================
app.get("/api/auth/profile", authMiddleware, asyncHandler(getProfile));

// ==================== ADMIN routes (yeu cau dang nhap) ====================
app.get("/api/admin/slot-events", authMiddleware, asyncHandler(getSlotEvents));
app.get("/api/admin/gate-events", authMiddleware, asyncHandler(getGateEvents));
app.post("/api/admin/qr/verify", authMiddleware, asyncHandler(verifyAdminQr));
app.get("/api/admin/stats", authMiddleware, asyncHandler(getDashboardStats));
app.get("/api/admin/revenue-chart", authMiddleware, asyncHandler(getRevenueChart));
app.get("/api/admin/occupancy-trend", authMiddleware, asyncHandler(getOccupancyTrend));
app.get("/api/admin/lot-utilization", authMiddleware, asyncHandler(getLotUtilization));
app.get("/api/admin/forecast", authMiddleware, asyncHandler(getCapacityForecast));
app.get("/api/admin/bookings", authMiddleware, asyncHandler(getAllBookings));
app.post("/api/admin/parking-lots", authMiddleware, asyncHandler(upsertParkingLot));
app.delete("/api/admin/parking-lots/:id", authMiddleware, asyncHandler(deleteParkingLot));

app.get("/health", asyncHandler(async (_req, res) => {
  const health = { status: "ok", mode: "unknown", sqlserver: "unknown", redis: "unknown", kafka: "unknown" };
  try {
    await db.query("SELECT 1");
    health.sqlserver = "up";
    health.mode = "sqlserver";
  } catch (_e) {
    health.sqlserver = "down";
    health.mode = "memory";
  }
  try {
    if (redis.status === "wait" || redis.status === "end") await redis.connect();
    await redis.ping();
    health.redis = "up";
  } catch (_e) {
    health.redis = "down";
  }
  health.kafka = isKafkaEnabled() ? (isKafkaConnected() ? "up" : "down") : "disabled";
  res.json(health);
}));

app.use((err, _req, res, _next) => {
  console.error("[api] error:", err?.message || err);
  res.status(500).json({ message: "Internal error", error: err?.message || String(err) });
});

const port = Number(process.env.PORT || 3002);

async function start() {
  const insecureDefaults = [];
  if (!process.env.JWT_SECRET) insecureDefaults.push("JWT_SECRET");
  if (!process.env.QR_JWT_SECRET) insecureDefaults.push("QR_JWT_SECRET");
  if (!process.env.SENSOR_API_KEY) insecureDefaults.push("SENSOR_API_KEY");
  if (insecureDefaults.length > 0) {
    console.warn(`[config] Demo defaults are active for: ${insecureDefaults.join(", ")}. Set them in .env before deployment.`);
  }
  if (!isKafkaEnabled()) {
    console.log("[kafka] Disabled by configuration");
  }

  await ensureDatabaseSeeded();
  await ensureExtraChargeColumn();
  await ensureScheduledStartColumn();
  await ensurePricePerHourMotorbikeColumn();
  await ensureBookingVehicleTypeColumn();
  await ensureSampleData();
  await initSlotState();
  console.log(`[slot] Slot state initialized from parking lot data`);

  const server = http.createServer(app);
  createWsServer(server);

  server.listen(port, () => {
    console.log(`============================================`);
    console.log(`Smart Parking Hue API listening on ${port}`);
    console.log(`Backend health: http://localhost:${port}/health`);
    console.log(`--------------------------------------------`);
    console.log(`Frontend Links:`);
    console.log(`1. User Map:          http://localhost:5173/user-map/`);
    console.log(`2. Digitalization:    http://localhost:5174/digitalization-tool/`);
    console.log(`3. IOC Dashboard:     http://localhost:5175/ioc-dashboard/`);
    console.log(`4. Booking:           http://localhost:5176/booking/`);
    console.log(`============================================`);
  });
}

start();
