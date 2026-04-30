import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db.js";
import { getInternalSlotCount, internalUpdateSlot } from "./slotController.js";

const GEO_PATH = path.resolve(process.cwd(), "Data", "hue_parking_geometry.json");

// In-memory fallback
const memoryBookings = [];
let memoryBookingId = 1000;

export function getMemoryBookings() {
  return memoryBookings;
}

async function isMysqlUp() {
  try { await db.query("SELECT 1"); return true; } catch (_e) { return false; }
}

export async function createBooking(req, res) {
  const { userId, lotId, plateNumber, phoneNumber, estimatedHours } = req.body || {};
  if (!lotId || !plateNumber) {
    return res.status(400).json({ message: "lotId and plateNumber are required" });
  }

  // Check for duplicate active booking with same plate number
  const plate = plateNumber.trim().toUpperCase();
  if (await isMysqlUp()) {
    try {
      const [dupRows] = await db.query(
        "SELECT id, parking_lot_id, payment_status FROM bookings WHERE plate_number=? AND payment_status IN ('PENDING','PAID') ORDER BY created_at DESC LIMIT 1",
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
  let pricePerHour = 5000;
  try {
    const raw = await fs.readFile(GEO_PATH, "utf-8");
    const geo = JSON.parse(raw);
    const features = geo.features || [];
    for (const f of features) {
      if (f.properties?.id === lotId) {
        pricePerHour = Number(f.properties?.pricePerHour ?? 5000);
        break;
      }
    }
  } catch (_e) {}
  const amount = pricePerHour * hours;

  if (await isMysqlUp()) {
    try {
      const [result] = await db.query(
        `INSERT INTO bookings (user_id, parking_lot_id, plate_number, phone_number, estimated_hours, amount, payment_status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
        [userId || 0, lotId, plate, phoneNumber || "", hours, amount]
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
    id: bookingId, user_id: userId || 0, parking_lot_id: lotId, plate_number: plate,
    phone_number: phoneNumber || "", estimated_hours: hours, amount, payment_status: "PENDING",
    payment_provider: null, qr_code_token: null, started_at: new Date().toISOString(),
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

  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.parking_lot_id, b.plate_number, b.payment_status, b.qr_code_token, b.amount, b.created_at,
                p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id
         WHERE b.plate_number=? AND b.parking_lot_id=? AND b.payment_status='PAID'
         ORDER BY b.created_at DESC LIMIT 1`,
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

  if (await isMysqlUp()) {
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

  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.parking_lot_id, b.plate_number, b.amount, b.payment_status,
                b.payment_provider, b.qr_code_token, b.started_at, b.created_at, p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id
         WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 50`, [uid]
      );
      return res.json(rows);
    } catch (err) { return res.status(500).json({ message: err.message }); }
  }

  return res.json(memoryBookings.filter((b) => b.user_id === uid));
}

export async function getAllBookings(req, res) {
  const limit = Math.min(Number(req.query.limit || 50), 200);

  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT b.id, b.user_id, b.parking_lot_id, b.plate_number, b.phone_number,
                b.amount, b.payment_status, b.payment_provider, b.started_at, b.created_at,
                p.name as lot_name
         FROM bookings b LEFT JOIN parking_lots p ON b.parking_lot_id = p.id
         ORDER BY b.created_at DESC LIMIT ?`, [limit]
      );
      return res.json(rows);
    } catch (err) { return res.status(500).json({ message: err.message }); }
  }

  const result = memoryBookings.slice(0, limit).map((b) => ({ ...b, lot_name: b.parking_lot_id }));
  return res.json(result);
}
