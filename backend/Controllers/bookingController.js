import fs from "node:fs/promises";
import path from "node:path";
import { db, isSqlUp } from "./db.js";
import { getInternalSlotCount, internalUpdateSlot } from "./slotController.js";
import { broadcastDashboardUpdate } from "../wsServer.js";

const GEO_PATH = path.resolve(process.cwd(), "Data", "hue_parking_geometry.json");

// In-memory fallback
const memoryBookings = [];
let memoryBookingId = 1000;

export function getMemoryBookings() {
  return memoryBookings;
}

export async function createBooking(req, res) {
  const { userId, lotId, plateNumber, phoneNumber, estimatedHours, startTime, vehicleType } = req.body || {};
  const effectiveUserId = req.user?.userId ?? userId ?? 0;
  if (!lotId || !plateNumber) {
    return res.status(400).json({ message: "lotId and plateNumber are required" });
  }

  // Validate startTime if provided (future time booking)
  let scheduledStart = null;
  let effectiveStartedAt = null;
  if (startTime) {
    const parsed = new Date(startTime);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ message: "startTime is not a valid date" });
    }
    if (parsed <= new Date()) {
      return res.status(400).json({ message: "startTime must be in the future" });
    }
    scheduledStart = parsed.toISOString().slice(0, 19).replace("T", " ");
    effectiveStartedAt = scheduledStart;
  }

  // Check for duplicate active booking with same plate number
  const plate = plateNumber.trim().toUpperCase();
  if (await isSqlUp()) {
    try {
      const [dupRows] = await db.query(
        "SELECT id, parking_lot_id, payment_status FROM bookings WHERE plate_number=? AND payment_status IN ('PENDING','PAID') ORDER BY created_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY",
        [plate]
      );
      if (dupRows.length > 0) {
        return res.status(409).json({
          message: `Biển số ${plate} đã được đặt chỗ tại bãi ${dupRows[0].parking_lot_id}. Mỗi xe chỉ được đặt 1 chỗ.`,
          duplicate: true,
          existingBookingId: dupRows[0].id
        });
      }
    } catch (_e) {}
  } else {
    const dup = memoryBookings.find(
      (b) => b.plate_number.toUpperCase() === plate && (b.payment_status === "PENDING" || b.payment_status === "PAID")
    );
    if (dup) {
      return res.status(409).json({
        message: `Biển số ${plate} đã được đặt chỗ tại bãi ${dup.parking_lot_id}. Mỗi xe chỉ được đặt 1 chỗ.`,
        duplicate: true,
        existingBookingId: dup.id
      });
    }
  }

  const currentSlots = await getInternalSlotCount(lotId);
  if (currentSlots === undefined) {
    return res.status(404).json({ message: "Parking lot not found" });
  }
  if (currentSlots <= 0) {
    return res.status(400).json({ message: "Bai xe da het cho. Vui long chon bai xe khac." });
  }

  const hours = Number(estimatedHours) || 2;
  const isMotorbike = vehicleType === "MOTORBIKE";
  let pricePerHour = isMotorbike ? 2000 : 5000;
  try {
    const raw = await fs.readFile(GEO_PATH, "utf-8");
    const geo = JSON.parse(raw);
    const features = geo.features || [];
    for (const f of features) {
      if (f.properties?.id === lotId) {
        if (isMotorbike) {
          pricePerHour = Number(f.properties?.pricePerHourMotorbike ?? f.properties?.pricePerHour ?? 2000);
        } else {
          pricePerHour = Number(f.properties?.pricePerHour ?? 5000);
        }
        break;
      }
    }
  } catch (_e) {}
  const amount = pricePerHour * hours;

  if (await isSqlUp()) {
    try {
      const [result] = await db.query(
        `INSERT INTO bookings (user_id, parking_lot_id, plate_number, vehicle_type, phone_number, estimated_hours, scheduled_start, amount, payment_status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ${effectiveStartedAt ? `?` : `NOW()`})`,
        effectiveStartedAt
          ? [effectiveUserId, lotId, plate, vehicleType || "CAR", phoneNumber || "", hours, scheduledStart, amount, effectiveStartedAt]
          : [effectiveUserId, lotId, plate, vehicleType || "CAR", phoneNumber || "", hours, null, amount]
      );
      const bookingId = result.insertId;
      const newCount = Math.max(0, currentSlots - 1);
      await internalUpdateSlot(lotId, newCount, "BOOKING_RESERVATION");
      return res.json({ success: true, bookingId, lotId, plateNumber: plate, amount, estimatedHours: hours, message: "Dat cho thanh cong. Vui long thanh toan de nhan QR code." });
    } catch (err) {
      return res.status(500).json({ message: "Booking creation failed", error: err.message });
    }
  }

  // In-memory fallback
  const bookingId = ++memoryBookingId;
  const booking = {
    id: bookingId, user_id: effectiveUserId, parking_lot_id: lotId, plate_number: plate,
    vehicle_type: vehicleType || "CAR",
    phone_number: phoneNumber || "", estimated_hours: hours, amount, payment_status: "PENDING",
    payment_provider: null, qr_code_token: null,
    started_at: effectiveStartedAt || new Date().toISOString(),
    scheduled_start: scheduledStart,
    ended_at: null, created_at: new Date().toISOString()
  };
  memoryBookings.unshift(booking);
  const newCount = Math.max(0, currentSlots - 1);
  await internalUpdateSlot(lotId, newCount, "BOOKING_RESERVATION");
  return res.json({ success: true, bookingId, lotId, plateNumber: plate, amount, estimatedHours: hours, message: "Dat cho thanh cong. Vui long thanh toan de nhan QR code." });
}

// Lookup active booking by plate number + lot ID (for gate entry / re-view QR)
export async function lookupActiveBooking(req, res) {
  const { plateNumber, lotId } = req.query;
  if (!plateNumber || !lotId) {
    return res.status(400).json({ message: "plateNumber and lotId query params are required" });
  }

  const plate = plateNumber.trim().toUpperCase();
  let found = null;

  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.parking_lot_id, b.plate_number, b.payment_status, b.qr_code_token, b.amount, b.created_at,
                p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id
         WHERE b.plate_number=? AND b.parking_lot_id=? AND b.payment_status='PAID'
         ORDER BY b.created_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`,
        [plate, lotId]
      );
      if (rows.length > 0) {
        found = rows[0];
      }
    } catch (_e) {}
  } else {
    found = memoryBookings.find(
      (b) => b.plate_number.toUpperCase() === plate && b.parking_lot_id === lotId && b.payment_status === "PAID"
    );
  }

  if (!found) {
    return res.status(404).json({ message: "No active booking found for this plate at this lot" });
  }

  return res.json({
    bookingId: found.id,
    lotId: found.parking_lot_id,
    lotName: found.lot_name || found.parking_lot_id,
    plateNumber: found.plate_number,
    paymentStatus: found.payment_status,
    qrToken: found.qr_code_token || null,
    amount: found.amount,
    createdAt: found.created_at
  });
}

export async function getBooking(req, res) {
  const { bookingId } = req.params;
  const id = Number(bookingId);

  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.user_id, b.parking_lot_id, b.plate_number, b.phone_number,
                b.estimated_hours, b.amount, b.payment_status, b.payment_provider,
                b.qr_code_token, b.started_at, b.ended_at, b.created_at,
                p.name as lot_name, p.price_per_hour
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id WHERE b.id = ?`, [id]
      );
      if (rows.length > 0) return res.json(rows[0]);
    } catch (err) { return res.status(500).json({ message: err.message }); }
  }

  const b = memoryBookings.find((x) => x.id === id);
  if (!b) return res.status(404).json({ message: "Booking not found" });
  return res.json(b);
}

export async function listUserBookings(req, res) {
  const { userId } = req.params;
  const uid = Number(userId);

  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.parking_lot_id, b.plate_number, b.amount, b.payment_status,
                b.payment_provider, b.qr_code_token, b.started_at, b.ended_at, b.extra_charge, b.created_at, p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id
         WHERE b.user_id = ? ORDER BY b.created_at DESC OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY`, [uid]
      );
      return res.json(rows);
    } catch (err) { return res.status(500).json({ message: err.message }); }
  }

  return res.json(memoryBookings.filter((b) => b.user_id === uid));
}

export async function listCurrentUserBookings(req, res) {
  req.params.userId = String(req.user.userId);
  return listUserBookings(req, res);
}

async function getBookingOwnerId(bookingId) {
  const id = Number(bookingId);
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query("SELECT user_id FROM bookings WHERE id = ?", [id]);
      return rows[0]?.user_id ?? null;
    } catch (_e) {}
  }
  return memoryBookings.find((b) => String(b.id) === String(id))?.user_id ?? null;
}

export async function processCheckout(bookingId) {
  const id = Number(bookingId);
  let booking = null;
  let mysqlOk = true;

  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.parking_lot_id, b.plate_number, b.amount, b.payment_status,
                b.started_at, b.ended_at, b.estimated_hours, p.name as lot_name, p.price_per_hour
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id WHERE b.id = ?`, [id]
      );
      if (rows.length > 0) booking = rows[0];
    } catch (_e) { mysqlOk = false; }
  } else {
    mysqlOk = false;
  }

  if (!mysqlOk) {
    booking = memoryBookings.find((b) => String(b.id) === String(id));
    if (!booking) throw Object.assign(new Error("Booking not found"), { status: 404 });
  }

  if (!booking) throw Object.assign(new Error("Booking not found"), { status: 404 });
  if (booking.ended_at) throw Object.assign(new Error("Xe da duoc tra truoc do"), { status: 400 });
  if (booking.payment_status !== "PAID") throw Object.assign(new Error("Chua thanh toan"), { status: 400 });

  const now = new Date();
  const startedAt = new Date(booking.started_at);
  const diffMs = now - startedAt;
  const actualHours = Math.max(0.01, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);

  const pricePerHour = Number(booking.price_per_hour || 5000);
  const paidAmount = Number(booking.amount);
  const actualCost = Math.round(actualHours * pricePerHour * 100) / 100;
  const extraCharge = Math.max(0, Math.round((actualCost - paidAmount) * 100) / 100);

  if (mysqlOk) {
    await db.query(
      "UPDATE bookings SET ended_at = NOW(), extra_charge = ? WHERE id = ?",
      [extraCharge, id]
    );
  } else {
    booking.ended_at = now.toISOString();
    booking.extra_charge = extraCharge;
  }

  // Free up the parking slot
  const lotId = booking.parking_lot_id;
  const current = await getInternalSlotCount(lotId) || 0;
  await internalUpdateSlot(lotId, current + 1, "CHECKOUT");

  // Broadcast dashboard refresh to all connected clients
  try { broadcastDashboardUpdate({}); } catch (_e) {}

  return {
    success: true,
    bookingId: String(id),
    plateNumber: booking.plate_number,
    lotName: booking.lot_name || lotId,
    lotId,
    started_at: booking.started_at,
    ended_at: mysqlOk ? now.toISOString() : booking.ended_at,
    estimatedHours: Number(booking.estimated_hours || 2),
    actualHours,
    pricePerHour,
    amount: paidAmount,
    extraCharge,
    totalCost: Math.round((paidAmount + extraCharge) * 100) / 100
  };
}

export async function checkoutHandler(req, res) {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ message: "bookingId is required" });
    if (req.user?.role !== "ADMIN" && req.user?.role !== "OPERATOR") {
      const ownerId = await getBookingOwnerId(bookingId);
      if (ownerId == null) return res.status(404).json({ success: false, message: "Booking not found" });
      if (Number(ownerId) !== Number(req.user?.userId)) {
        return res.status(403).json({ success: false, message: "You can only checkout your own booking" });
      }
    }
    const result = await processCheckout(bookingId);
    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
}

export async function getAllBookings(req, res) {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const lotId = req.query.lotId || null;
  const activeOnly = req.query.activeOnly === "true";

  if (await isSqlUp()) {
    try {
      let sql = `SELECT b.id, b.user_id, b.parking_lot_id, b.plate_number, b.vehicle_type, b.phone_number,
                b.amount, b.payment_status, b.payment_provider, b.started_at, b.ended_at, b.created_at,
                p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id WHERE 1=1`;
      const params = [];

      if (lotId) {
        sql += " AND b.parking_lot_id = ?";
        params.push(lotId);
      }
      if (activeOnly) {
        sql += " AND b.payment_status = 'PAID' AND b.ended_at IS NULL";
      }

      sql += " ORDER BY b.created_at DESC OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY";
      params.push(limit);

      const [rows] = await db.query(sql, params);
      return res.json(rows);
    } catch (err) { return res.status(500).json({ message: err.message }); }
  }

  let result = memoryBookings.slice(0, limit).map((b) => ({ ...b, lot_name: b.parking_lot_id }));
  if (lotId) result = result.filter((b) => b.parking_lot_id === lotId);
  if (activeOnly) result = result.filter((b) => b.payment_status === "PAID" && !b.ended_at);
  return res.json(result);
}
