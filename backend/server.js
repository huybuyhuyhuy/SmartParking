import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { getNearbyParking } from "./Controllers/parkingController.js";
import { getSlotEvents, getSlots, initSlotState, updateSlotBySensor } from "./Controllers/slotController.js";
import { gateScan, getGateEvents, issueUserQr, verifyAdminQr } from "./Controllers/qrController.js";
import { confirmPaymentAndGenerateQr } from "./Controllers/paymentController.js";
import { createMomoPayment, momoIpnHandler, checkPaymentStatus } from "./Controllers/momoController.js";
import { createBooking, getBooking, listCurrentUserBookings, listUserBookings, getAllBookings, lookupActiveBooking, checkoutHandler } from "./Controllers/bookingController.js";
import { register, login, getProfile, authMiddleware, adminMiddleware, strictAdminMiddleware, gateAccessMiddleware } from "./Controllers/authController.js";
import { getDashboardStats, getRevenueChart, getOccupancyTrend, getLotUtilization, getCapacityForecast } from "./Controllers/analyticsController.js";
import { getDbRuntimeConfig, isSqlUp } from "./Controllers/db.js";
import { redis } from "./Controllers/redisClient.js";
import { deleteParkingLot, listParkingLots, upsertParkingLot } from "./Controllers/parkingLotController.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { createWsServer } from "./wsServer.js";
import { isKafkaConnected, isKafkaEnabled } from "./Controllers/kafkaClient.js";
import { sendError } from "./Controllers/httpResponse.js";
import { getProductFunnel, getTelemetryEvents } from "./Controllers/telemetryController.js";
import crypto from "node:crypto";

dotenv.config();

const envFlag = (value, fallback = false) => {
  if (value == null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const allowMemoryFallback = envFlag(process.env.ALLOW_MEMORY_FALLBACK, true);
const requireDatabase = envFlag(process.env.REQUIRE_DATABASE, false);

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  const incomingRequestId = req.header("x-request-id");
  const requestId = incomingRequestId && incomingRequestId.length <= 120
    ? incomingRequestId
    : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

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
app.post("/api/qr/issue", authMiddleware, adminMiddleware, asyncHandler(issueUserQr));
app.post("/api/gate/scan", gateAccessMiddleware, asyncHandler(gateScan));
app.post("/api/payments/confirm", authMiddleware, asyncHandler(confirmPaymentAndGenerateQr));

// BOOKING
app.post("/api/bookings", authMiddleware, asyncHandler(createBooking));
app.get("/api/bookings/active", asyncHandler(lookupActiveBooking));
app.get("/api/bookings/:bookingId", asyncHandler(getBooking));
app.get("/api/users/:userId/bookings", authMiddleware, asyncHandler(listUserBookings));
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
app.get("/api/admin/slot-events", authMiddleware, adminMiddleware, asyncHandler(getSlotEvents));
app.get("/api/admin/gate-events", authMiddleware, adminMiddleware, asyncHandler(getGateEvents));
app.post("/api/admin/qr/verify", authMiddleware, adminMiddleware, asyncHandler(verifyAdminQr));
app.get("/api/admin/stats", authMiddleware, adminMiddleware, asyncHandler(getDashboardStats));
app.get("/api/admin/revenue-chart", authMiddleware, adminMiddleware, asyncHandler(getRevenueChart));
app.get("/api/admin/occupancy-trend", authMiddleware, adminMiddleware, asyncHandler(getOccupancyTrend));
app.get("/api/admin/lot-utilization", authMiddleware, adminMiddleware, asyncHandler(getLotUtilization));
app.get("/api/admin/forecast", authMiddleware, adminMiddleware, asyncHandler(getCapacityForecast));
app.get("/api/admin/bookings", authMiddleware, adminMiddleware, asyncHandler(getAllBookings));
app.get("/api/admin/product-funnel", authMiddleware, adminMiddleware, asyncHandler(getProductFunnel));
app.get("/api/admin/telemetry-events", authMiddleware, adminMiddleware, asyncHandler(getTelemetryEvents));
app.post("/api/admin/parking-lots", authMiddleware, strictAdminMiddleware, asyncHandler(upsertParkingLot));
app.delete("/api/admin/parking-lots/:id", authMiddleware, strictAdminMiddleware, asyncHandler(deleteParkingLot));

app.get("/health", asyncHandler(async (_req, res) => {
  const health = {
    status: "ok",
    mode: "unknown",
    sqlserver: "unknown",
    redis: "unknown",
    kafka: "unknown",
    databaseRequired: requireDatabase,
    memoryFallbackAllowed: allowMemoryFallback
  };
  const sqlUp = await isSqlUp();
  health.sqlserver = sqlUp ? "up" : "down";
  health.mode = sqlUp ? "sqlserver" : "memory";
  if (!sqlUp && requireDatabase) health.status = "degraded";
  try {
    if (redis.status === "wait" || redis.status === "end") await redis.connect();
    await redis.ping();
    health.redis = "up";
  } catch (_e) {
    health.redis = "down";
  }
  health.kafka = isKafkaEnabled() ? (isKafkaConnected() ? "up" : "down") : "disabled";
  res.status(!sqlUp && requireDatabase ? 503 : 200).json(health);
}));

app.use((err, _req, res, _next) => {
  console.error("[api] error:", err?.message || err);
  return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", "Internal error", {
    cause: err?.message || String(err)
  });
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

  const sqlUp = await isSqlUp();
  if (!sqlUp && requireDatabase) {
    throw new Error(`Database is required but unavailable. Run npm run db:bootstrap and verify ${JSON.stringify(getDbRuntimeConfig())}`);
  }
  if (!sqlUp && !allowMemoryFallback) {
    throw new Error("Database is unavailable and memory fallback is disabled.");
  }
  console.log(`[db] Runtime mode: ${sqlUp ? "sqlserver" : "memory"}`);
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
