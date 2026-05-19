import fs from "node:fs/promises";
import path from "node:path";
import { db, isSqlUp } from "./db.js";
import { getInternalSlotCount, internalUpdateSlot } from "./slotController.js";
import { broadcastDashboardUpdate } from "../wsServer.js";
import { sendError } from "./httpResponse.js";
import { recordTelemetryEvent } from "./telemetryController.js";
import { recordGateEvent } from "./qrController.js";

const GEO_PATH = path.resolve(process.cwd(), "Data", "hue_parking_geometry.json");

// In-memory fallback
const memoryBookings = [];
let memoryBookingId = 1000;

function isBookingActive(booking) {
  return Boolean(booking) && !booking.ended_at && booking.payment_status === "PAID";
}

export function getMemoryBookings() {
  return memoryBookings;
}

export async function createBooking(req, res) {
  const { userId, lotId, plateNumber, phoneNumber, estimatedHours, startTime, vehicleType } = req.body || {};
  const effectiveUserId = req.user?.userId ?? userId ?? 0;
  if (!lotId || !plateNumber) {
    recordTelemetryEvent("booking_creation_failed", {
      requestId: req.requestId,
      userId: effectiveUserId,
      lotId,
      errorCode: "VALIDATION_REQUIRED_FIELD"
    });
    return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "lotId and plateNumber are required");
  }

  // Validate startTime if provided (future time booking)
  let scheduledStart = null;
  let effectiveStartedAt = null;
  if (startTime) {
    const parsed = new Date(startTime);
    if (isNaN(parsed.getTime())) {
      recordTelemetryEvent("booking_creation_failed", {
        requestId: req.requestId,
        userId: effectiveUserId,
        lotId,
        errorCode: "VALIDATION_INVALID_DATE"
      });
      return sendError(res, 400, "VALIDATION_INVALID_DATE", "startTime is not a valid date");
    }
    if (parsed <= new Date()) {
      recordTelemetryEvent("booking_creation_failed", {
        requestId: req.requestId,
        userId: effectiveUserId,
        lotId,
        errorCode: "VALIDATION_DATE_MUST_BE_FUTURE"
      });
      return sendError(res, 400, "VALIDATION_DATE_MUST_BE_FUTURE", "startTime must be in the future");
    }
    scheduledStart = parsed.toISOString().slice(0, 19).replace("T", " ");
    effectiveStartedAt = scheduledStart;
  }

  // Check for duplicate active booking with same plate number
  const plate = plateNumber.trim().toUpperCase();
  if (await isSqlUp()) {
    try {
      const [dupRows] = await db.query(
        "SELECT id, parking_lot_id, payment_status FROM bookings WHERE plate_number=? AND payment_status = 'PAID' AND ended_at IS NULL ORDER BY created_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY",
        [plate]
      );
      if (dupRows.length > 0) {
        recordTelemetryEvent("booking_creation_failed", {
          requestId: req.requestId,
          userId: effectiveUserId,
          lotId,
          errorCode: "BOOKING_DUPLICATE_PLATE"
        });
        return sendError(res, 409, "BOOKING_DUPLICATE_PLATE", `Biển số ${plate} đã được đặt chỗ tại bãi ${dupRows[0].parking_lot_id}. Mỗi xe chỉ được đặt 1 chỗ.`, {
          existingBookingId: dupRows[0].id
        }, {
          duplicate: true,
          existingBookingId: dupRows[0].id
        });
      }
    } catch (_e) {}
  } else {
    const dup = memoryBookings.find(
      (b) => b.plate_number.toUpperCase() === plate && isBookingActive(b)
    );
    if (dup) {
      recordTelemetryEvent("booking_creation_failed", {
        requestId: req.requestId,
        userId: effectiveUserId,
        lotId,
        errorCode: "BOOKING_DUPLICATE_PLATE"
      });
      return sendError(res, 409, "BOOKING_DUPLICATE_PLATE", `Biển số ${plate} đã được đặt chỗ tại bãi ${dup.parking_lot_id}. Mỗi xe chỉ được đặt 1 chỗ.`, {
        existingBookingId: dup.id
      }, {
        duplicate: true,
        existingBookingId: dup.id
      });
    }
  }

  const currentSlots = await getInternalSlotCount(lotId);
  if (currentSlots === undefined) {
    recordTelemetryEvent("booking_creation_failed", {
      requestId: req.requestId,
      userId: effectiveUserId,
      lotId,
      errorCode: "PARKING_LOT_NOT_FOUND"
    });
    return sendError(res, 404, "PARKING_LOT_NOT_FOUND", "Parking lot not found");
  }
  if (currentSlots <= 0) {
    recordTelemetryEvent("booking_creation_failed", {
      requestId: req.requestId,
      userId: effectiveUserId,
      lotId,
      errorCode: "SLOT_FULL"
    });
    return sendError(res, 409, "SLOT_FULL", "Bai xe da het cho. Vui long chon bai xe khac.");
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
      const [rows] = await db.query(
        `INSERT INTO bookings (user_id, parking_lot_id, plate_number, vehicle_type, phone_number, estimated_hours, scheduled_start, amount, payment_status, started_at)
         OUTPUT INSERTED.id AS id
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ${effectiveStartedAt ? `?` : `SYSDATETIME()`})`,
        effectiveStartedAt
          ? [effectiveUserId, lotId, plate, vehicleType || "CAR", phoneNumber || "", hours, scheduledStart, amount, effectiveStartedAt]
          : [effectiveUserId, lotId, plate, vehicleType || "CAR", phoneNumber || "", hours, null, amount]
      );
      const bookingId = rows[0]?.id;
      if (!bookingId) throw new Error("Booking id was not returned by SQL Server");
      const newCount = Math.max(0, currentSlots - 1);
      await internalUpdateSlot(lotId, newCount, "BOOKING_RESERVATION");
      recordTelemetryEvent("booking_created", {
        requestId: req.requestId,
        userId: effectiveUserId,
        bookingId,
        lotId,
        vehicleType: vehicleType || "CAR",
        amount
      });
      return res.json({ success: true, bookingId, lotId, plateNumber: plate, amount, estimatedHours: hours, message: "Dat cho thanh cong. Vui long thanh toan de nhan QR code." });
    } catch (err) {
      recordTelemetryEvent("booking_creation_failed", {
        requestId: req.requestId,
        userId: effectiveUserId,
        lotId,
        errorCode: "SYSTEM_INTERNAL_ERROR"
      });
      return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", "Booking creation failed", { cause: err.message });
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
  recordTelemetryEvent("booking_created", {
    requestId: req.requestId,
    userId: effectiveUserId,
    bookingId,
    lotId,
    vehicleType: vehicleType || "CAR",
    amount
  });
  return res.json({ success: true, bookingId, lotId, plateNumber: plate, amount, estimatedHours: hours, message: "Dat cho thanh cong. Vui long thanh toan de nhan QR code." });
}

// Lookup active booking by plate number + lot ID (for gate entry / re-view QR)
export async function lookupActiveBooking(req, res) {
  const { plateNumber, lotId } = req.query;
  if (!plateNumber || !lotId) {
    return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "plateNumber and lotId query params are required");
  }

  const plate = plateNumber.trim().toUpperCase();
  let found = null;

  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.parking_lot_id, b.plate_number, b.payment_status, b.qr_code_token, b.exit_qr_code_token, b.amount, b.created_at,
                p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id
         WHERE b.plate_number=? AND b.parking_lot_id=? AND b.payment_status='PAID' AND b.ended_at IS NULL
         ORDER BY b.created_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`,
        [plate, lotId]
      );
      if (rows.length > 0) {
        found = rows[0];
      }
    } catch (_e) {}
  } else {
    found = memoryBookings.find(
      (b) => b.plate_number.toUpperCase() === plate && b.parking_lot_id === lotId && isBookingActive(b)
    );
  }

  if (!found) {
    return sendError(res, 404, "BOOKING_ACTIVE_NOT_FOUND", "No active booking found for this plate at this lot");
  }

  return res.json({
    bookingId: found.id,
    lotId: found.parking_lot_id,
    lotName: found.lot_name || found.parking_lot_id,
    plateNumber: found.plate_number,
    paymentStatus: found.payment_status,
    qrToken: found.qr_code_token || null,
    exitQrToken: found.exit_qr_code_token || null,
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
                b.qr_code_token, b.exit_qr_code_token, b.started_at, b.ended_at, b.created_at,
                p.name as lot_name, p.price_per_hour
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id WHERE b.id = ?`, [id]
      );
      if (rows.length > 0) return res.json(rows[0]);
    } catch (err) { return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message); }
  }

  const b = memoryBookings.find((x) => x.id === id);
  if (!b) return sendError(res, 404, "BOOKING_NOT_FOUND", "Booking not found");
  return res.json(b);
}

export async function listUserBookings(req, res) {
  const { userId } = req.params;
  const uid = Number(userId);
  const canReadAll = req.user?.role === "ADMIN" || req.user?.role === "OPERATOR";
  if (!canReadAll && Number(req.user?.userId) !== uid) {
    return sendError(res, 403, "BOOKING_ACCESS_DENIED", "You can only view your own bookings");
  }

  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.parking_lot_id, b.plate_number, b.amount, b.payment_status,
                b.payment_provider, b.qr_code_token, b.exit_qr_code_token,
                b.started_at, b.ended_at, b.extra_charge, b.created_at, p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id
         WHERE b.user_id = ? ORDER BY b.created_at DESC OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY`, [uid]
      );
      return res.json(rows);
    } catch (err) { return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message); }
  }

  return res.json(memoryBookings.filter((b) => b.user_id === uid));
}

export async function listCurrentUserBookings(req, res) {
  req.params.userId = String(req.user.userId);
  return listUserBookings(req, res);
}

export async function getBookingOwnerId(bookingId) {
  const id = Number(bookingId);
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query("SELECT user_id FROM bookings WHERE id = ?", [id]);
      return rows[0]?.user_id ?? null;
    } catch (_e) {}
  }
  return memoryBookings.find((b) => String(b.id) === String(id))?.user_id ?? null;
}

export async function processCheckout(bookingId, context = {}) {
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
  if (!isBookingActive(booking)) throw Object.assign(new Error("Chua thanh toan"), { status: 400 });

  const now = new Date();
  const startedAt = new Date(booking.started_at);
  const diffMs = now - startedAt;
  const actualHours = Math.max(0.01, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);

  const pricePerHour = Number(booking.price_per_hour || 5000);
  const paidAmount = Number(booking.amount);
  const estimatedHours = Number(booking.estimated_hours || 2);
  const paidDurationCost = Math.round(estimatedHours * pricePerHour * 100) / 100;
  const actualCost = Math.round(actualHours * pricePerHour * 100) / 100;
  const extraCharge = Math.max(0, Math.round((actualCost - paidDurationCost) * 100) / 100);
  const lateMinutes = Math.max(0, Math.round((actualHours - estimatedHours) * 60));

  if (mysqlOk) {
    await db.query(
      "UPDATE bookings SET ended_at = SYSDATETIME(), extra_charge = ? WHERE id = ?",
      [extraCharge, id]
    );
  } else {
    booking.ended_at = now.toISOString();
    booking.extra_charge = extraCharge;
  }

  if (context.recordGateEvent !== false) {
    const gateEvent = {
      gateId: context.gateId || "HUE_GATE_1",
      actor: `booking:${id}`,
      role: "USER",
      direction: "OUT",
      scannerId: context.scannerId || "CHECKOUT_FLOW",
      granted: true,
      reasonCode: null,
      source: "CHECKOUT",
      ts: now.toISOString()
    };
    try { await recordGateEvent(gateEvent); } catch (_e) {}
  }

  // Free up the parking slot
  const lotId = booking.parking_lot_id;
  const current = await getInternalSlotCount(lotId) || 0;
  await internalUpdateSlot(lotId, current + 1, "CHECKOUT");

  // Broadcast dashboard refresh to all connected clients
  try { broadcastDashboardUpdate({}); } catch (_e) {}

  recordTelemetryEvent("checkout_completed", {
    requestId: context.requestId,
    bookingId: String(id),
    lotId,
    actualHours,
    extraCharge,
    amount: paidAmount
  });

  return {
    success: true,
    bookingId: String(id),
    plateNumber: booking.plate_number,
    lotName: booking.lot_name || lotId,
    lotId,
    started_at: booking.started_at,
    ended_at: mysqlOk ? now.toISOString() : booking.ended_at,
    estimatedHours,
    actualHours,
    pricePerHour,
    amount: paidAmount,
    extraCharge,
    lateMinutes,
    totalCost: Math.round((paidAmount + extraCharge) * 100) / 100,
    paidDurationCost
  };
}

export async function checkoutHandler(req, res) {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId) return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "bookingId is required", undefined, { success: false });
    if (req.user?.role !== "ADMIN" && req.user?.role !== "OPERATOR") {
      const ownerId = await getBookingOwnerId(bookingId);
      if (ownerId == null) return sendError(res, 404, "BOOKING_NOT_FOUND", "Booking not found", undefined, { success: false });
      if (Number(ownerId) !== Number(req.user?.userId)) {
        return sendError(res, 403, "BOOKING_ACCESS_DENIED", "You can only checkout your own booking", undefined, { success: false });
      }
    }
    const result = await processCheckout(bookingId, { requestId: req.requestId });
    return res.json(result);
  } catch (err) {
    const code =
      err.status === 404 ? "BOOKING_NOT_FOUND" :
      err.message === "Xe da duoc tra truoc do" ? "BOOKING_ALREADY_CHECKED_OUT" :
      err.message === "Chua thanh toan" ? "BOOKING_NOT_PAID" :
      "SYSTEM_INTERNAL_ERROR";
    return sendError(res, err.status || 500, code, err.message, undefined, { success: false });
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
    } catch (err) { return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message); }
  }

  let result = memoryBookings.slice(0, limit).map((b) => ({ ...b, lot_name: b.parking_lot_id }));
  if (lotId) result = result.filter((b) => b.parking_lot_id === lotId);
  if (activeOnly) result = result.filter((b) => isBookingActive(b));
  return res.json(result);
}
