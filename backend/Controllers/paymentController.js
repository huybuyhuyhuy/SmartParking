import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { db } from "./db.js";
import { getMemoryBookings } from "./bookingController.js";

async function isMysqlUp() {
  try { await db.query("SELECT 1"); return true; } catch (_e) { return false; }
}

// In-memory booking state (shared concept with momoController)
const memoryPaymentState = new Map();

export function getMemoryPaymentState() {
  return memoryPaymentState;
}

export async function confirmPaymentAndGenerateQr(req, res) {
  const { bookingId, provider, status } = req.body;
  if (!bookingId || !provider || !status) {
    return res.status(400).json({ message: "bookingId/provider/status are required" });
  }

  if (status !== "PAID") {
    if (await isMysqlUp()) {
      await db.query("UPDATE bookings SET payment_status='FAILED' WHERE id=?", [bookingId]).catch(() => {});
    }
    memoryPaymentState.set(String(bookingId), { paymentStatus: "FAILED", provider });
    return res.status(402).json({ message: "Payment failed" });
  }

  let lotId = "UNKNOWN";
  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query("SELECT parking_lot_id FROM bookings WHERE id=?", [bookingId]);
      lotId = rows.length > 0 ? rows[0].parking_lot_id : "UNKNOWN";
    } catch (_e) {}
  }

  const qrToken = jwt.sign(
    { sub: `booking:${bookingId}`, role: "USER", lotId, gateId: "HUE_GATE_1", direction: "IN" },
    process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret",
    { expiresIn: "4h" }
  );
  const qrDataUrl = await QRCode.toDataURL(qrToken);
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  if (await isMysqlUp()) {
    await db.query(
      "UPDATE bookings SET payment_status='PAID', payment_provider=?, qr_code_token=? WHERE id=?",
      [provider, qrToken, bookingId]
    ).catch(() => {});
  }
  // Also update in-memory state
  memoryPaymentState.set(String(bookingId), { paymentStatus: "PAID", provider, qrToken });

  // Also update memory bookings from bookingController
  const memBookings = getMemoryBookings();
  const found = memBookings.find((b) => String(b.id) === String(bookingId));
  if (found) {
    found.payment_status = "PAID";
    found.payment_provider = provider;
    found.qr_code_token = qrToken;
  }

  return res.json({ bookingId, qrToken, qrDataUrl, expiresAt, direction: "IN" });
}
