import jwt from "jsonwebtoken";
import QRCode from "qrcode";
import { db, isSqlUp } from "./db.js";
import { getBookingOwnerId, getMemoryBookings } from "./bookingController.js";
import { broadcastDashboardUpdate } from "../wsServer.js";
import { sendError } from "./httpResponse.js";
import { recordTelemetryEvent } from "./telemetryController.js";

// In-memory booking state (shared concept with momoController)
const memoryPaymentState = new Map();

export function getMemoryPaymentState() {
  return memoryPaymentState;
}

export async function confirmPaymentAndGenerateQr(req, res) {
  const { bookingId, provider } = req.body || {};
  if (!bookingId || !provider) {
    return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "bookingId and provider are required");
  }

  if (provider !== "DIRECT") {
    return sendError(res, 400, "PAYMENT_PROVIDER_UNSUPPORTED", "Only DIRECT demo payments are supported by this endpoint");
  }

  const directPaymentEnabled = String(process.env.DEMO_DIRECT_PAYMENT_ENABLED ?? "false").toLowerCase() === "true";
  if (!directPaymentEnabled) {
    return sendError(res, 403, "PAYMENT_DIRECT_DISABLED", "Direct demo payment is disabled");
  }

  const ownerId = await getBookingOwnerId(bookingId);
  if (ownerId == null) {
    return sendError(res, 404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  const canManageAnyBooking = req.user?.role === "ADMIN" || req.user?.role === "OPERATOR";
  if (!canManageAnyBooking && Number(ownerId) !== Number(req.user?.userId)) {
    return sendError(res, 403, "PAYMENT_ACCESS_DENIED", "You can only confirm payment for your own booking");
  }

  recordTelemetryEvent("payment_initiated", {
    requestId: req.requestId,
    bookingId: String(bookingId),
    provider,
    userId: req.user?.userId ?? null
  });

  let lotId = "UNKNOWN";
  let plateNumber = "UNKNOWN";
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query("SELECT parking_lot_id, plate_number FROM bookings WHERE id=?", [bookingId]);
      lotId = rows.length > 0 ? rows[0].parking_lot_id : "UNKNOWN";
      plateNumber = rows.length > 0 ? (rows[0].plate_number || "UNKNOWN") : "UNKNOWN";
    } catch (_e) {}
  } else {
    const found = getMemoryBookings().find((b) => String(b.id) === String(bookingId));
    lotId = found?.parking_lot_id || "UNKNOWN";
    plateNumber = found?.plate_number || "UNKNOWN";
  }

  const qrCommon = {
    sub: `booking:${bookingId}`,
    role: "USER",
    lotId,
    gateId: "HUE_GATE_1",
    plateNumber
  };
  const entryQrToken = jwt.sign(
    { ...qrCommon, direction: "IN" },
    process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret",
    { expiresIn: "4h" }
  );
  const exitQrToken = jwt.sign(
    { ...qrCommon, direction: "OUT" },
    process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret",
    { expiresIn: "4h" }
  );
  const qrDataUrl = await QRCode.toDataURL(entryQrToken);
  const exitQrDataUrl = await QRCode.toDataURL(exitQrToken);
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  if (await isSqlUp()) {
    await db.query(
      "UPDATE bookings SET payment_status='PAID', payment_provider=?, qr_code_token=?, exit_qr_code_token=? WHERE id=?",
      [provider, entryQrToken, exitQrToken, bookingId]
    ).catch(() => {});
  }
  // Also update in-memory state
  memoryPaymentState.set(String(bookingId), { paymentStatus: "PAID", provider, entryQrToken, exitQrToken });

  // Also update memory bookings from bookingController
  const memBookings = getMemoryBookings();
  const found = memBookings.find((b) => String(b.id) === String(bookingId));
  if (found) {
    found.payment_status = "PAID";
    found.payment_provider = provider;
    found.qr_code_token = entryQrToken;
    found.exit_qr_code_token = exitQrToken;
  }

  // Broadcast dashboard refresh to all connected clients
  try { broadcastDashboardUpdate({}); } catch (_e) {}

  recordTelemetryEvent("payment_succeeded", {
    requestId: req.requestId,
    bookingId: String(bookingId),
    provider,
    lotId,
    plateNumber
  });
  recordTelemetryEvent("qr_issued", {
    requestId: req.requestId,
    bookingId: String(bookingId),
    lotId,
    direction: "IN",
    expiresAt
  });
  recordTelemetryEvent("qr_issued", {
    requestId: req.requestId,
    bookingId: String(bookingId),
    lotId,
    direction: "OUT",
    expiresAt
  });

  return res.json({
    bookingId,
    lotId,
    plateNumber,
    entryQrToken,
    exitQrToken,
    qrToken: entryQrToken,
    qrDataUrl,
    exitQrDataUrl,
    expiresAt,
    direction: "IN"
  });
}
