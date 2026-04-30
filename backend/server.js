import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { getNearbyParking } from "./Controllers/parkingController.js";
import { getSlotEvents, getSlots, updateSlotBySensor } from "./Controllers/slotController.js";
import { gateScan, getGateEvents, issueUserQr, verifyAdminQr } from "./Controllers/qrController.js";
import { confirmPaymentAndGenerateQr } from "./Controllers/paymentController.js";
import { createMomoPayment, momoIpnHandler, checkPaymentStatus } from "./Controllers/momoController.js";
import { createBooking, getBooking, listUserBookings, getAllBookings, lookupActiveBooking } from "./Controllers/bookingController.js";
import { register, login, getProfile, authMiddleware, strictAdminMiddleware } from "./Controllers/authController.js";
import { initSlotState } from "./Controllers/slotController.js";
import { getDashboardStats, getRevenueChart, getOccupancyTrend, getLotUtilization } from "./Controllers/analyticsController.js";
import { db } from "./Controllers/db.js";
import { redis } from "./Controllers/redisClient.js";
import { deleteParkingLot, listParkingLots, upsertParkingLot } from "./Controllers/parkingLotController.js";
import fs from "node:fs/promises";
import path from "node:path";

dotenv.config();
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
  const data = await fs.readFile(path.resolve("Data", "restricted_zones.json"), "utf-8");
  res.json(JSON.parse(data));
}));
app.get("/api/slots", asyncHandler(getSlots));
app.put("/api/slots/:id", asyncHandler(updateSlotBySensor));
app.post("/api/qr/issue", asyncHandler(issueUserQr));
app.post("/api/gate/scan", asyncHandler(gateScan));
app.post("/api/payments/confirm", asyncHandler(confirmPaymentAndGenerateQr));

// BOOKING (public)
app.post("/api/bookings", asyncHandler(createBooking));
app.get("/api/bookings/active", asyncHandler(lookupActiveBooking));
app.get("/api/bookings/:bookingId", asyncHandler(getBooking));
app.get("/api/users/:userId/bookings", asyncHandler(listUserBookings));

// MOMO payment (public)
app.post("/api/payments/momo", asyncHandler(createMomoPayment));
app.post("/api/payments/momo/ipn", asyncHandler(momoIpnHandler));
app.get("/api/payments/status/:bookingId", asyncHandler(checkPaymentStatus));

// AUTH (public)
app.post("/api/auth/register", asyncHandler(register));
app.post("/api/auth/login", asyncHandler(login));

// ==================== PROTECTED routes (yeu cau dang nhap) ====================
app.get("/api/auth/profile", authMiddleware, asyncHandler(getProfile));

// ==================== ADMIN routes (public - phan quyen da duoc go bo) ====================
app.get("/api/admin/slot-events", asyncHandler(getSlotEvents));
app.get("/api/admin/gate-events", asyncHandler(getGateEvents));
app.post("/api/admin/qr/verify", asyncHandler(verifyAdminQr));
app.get("/api/admin/stats", asyncHandler(getDashboardStats));
app.get("/api/admin/revenue-chart", asyncHandler(getRevenueChart));
app.get("/api/admin/occupancy-trend", asyncHandler(getOccupancyTrend));
app.get("/api/admin/lot-utilization", asyncHandler(getLotUtilization));
app.get("/api/admin/bookings", asyncHandler(getAllBookings));
app.post("/api/admin/parking-lots", asyncHandler(upsertParkingLot));
app.delete("/api/admin/parking-lots/:id", asyncHandler(deleteParkingLot));

app.get("/health", asyncHandler(async (_req, res) => {
  const health = { status: "ok", mysql: "unknown", redis: "unknown" };
  try {
    await db.query("SELECT 1");
    health.mysql = "up";
  } catch (_e) {
    health.mysql = "down";
  }
  try {
    if (redis.status === "wait" || redis.status === "end") await redis.connect();
    await redis.ping();
    health.redis = "up";
  } catch (_e) {
    health.redis = "down";
  }
  res.json(health);
}));

app.use((err, _req, res, _next) => {
  console.error("[api] error:", err?.message || err);
  res.status(500).json({ message: "Internal error", error: err?.message || String(err) });
});

const port = Number(process.env.PORT || 3002);
initSlotState().then(() => {
  console.log(`[slot] Slot state initialized from parking lot data`);
}).catch(() => {});
app.listen(port, () => {
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
