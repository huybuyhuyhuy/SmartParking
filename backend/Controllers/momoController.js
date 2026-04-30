import crypto from "crypto";
import https from "https";
import { db } from "./db.js";
import { getInternalSlotCount, internalUpdateSlot } from "./slotController.js";
import { getMemoryPaymentState } from "./paymentController.js";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";

// In-memory booking state for fallback
const memoryBookingState = new Map();

async function isMysqlUp() {
  try { await db.query("SELECT 1"); return true; } catch (_e) { return false; }
}

const MOMO_CONFIG = {
  partnerCode: process.env.MOMO_PARTNER_CODE || "MOMO",
  accessKey: process.env.MOMO_ACCESS_KEY || "F8BBA842ECF85",
  secretKey: process.env.MOMO_SECRET_KEY || "K951B6PE1waDMi640xX08PD3vg6EkVlz",
  endpoint: process.env.MOMO_ENDPOINT || "https://test-payment.momo.vn/v2/gateway/api/create",
  redirectUrl: process.env.MOMO_REDIRECT_URL || "http://localhost:5173/user-map/",
  ipnUrl: process.env.MOMO_IPN_URL || "http://localhost:3002/api/payments/momo/ipn"
};

function createMomoSignature(rawSignature) {
  return crypto.createHmac("sha256", MOMO_CONFIG.secretKey).update(rawSignature).digest("hex");
}

async function sendMomoRequest(payload) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const url = new URL(MOMO_CONFIG.endpoint);
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (_e) {
            reject(new Error("MoMo response parse failed: " + data));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function createMomoPayment(req, res) {
  const { bookingId, amount, orderInfo } = req.body || {};
  if (!bookingId || !amount) {
    return res.status(400).json({ message: "bookingId and amount are required" });
  }

  const requestId = `${bookingId}-${Date.now()}`;
  const orderId = `${bookingId}-${Date.now()}`;
  const extraData = Buffer.from(JSON.stringify({ bookingId })).toString("base64");

  const rawSignature = `accessKey=${MOMO_CONFIG.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${MOMO_CONFIG.ipnUrl}&orderId=${orderId}&orderInfo=${encodeURIComponent(orderInfo || "Thanh toan Smart Parking Hue")}&partnerCode=${MOMO_CONFIG.partnerCode}&redirectUrl=${MOMO_CONFIG.redirectUrl}&requestId=${requestId}&requestType=captureWallet`;

  const signature = createMomoSignature(rawSignature);

  const payload = {
    partnerCode: MOMO_CONFIG.partnerCode,
    accessKey: MOMO_CONFIG.accessKey,
    requestId,
    amount: String(amount),
    orderId,
    orderInfo: orderInfo || "Thanh toan Smart Parking Hue",
    redirectUrl: MOMO_CONFIG.redirectUrl,
    ipnUrl: MOMO_CONFIG.ipnUrl,
    extraData,
    requestType: "captureWallet",
    lang: "vi",
    signature
  };

  try {
    const momoRes = await sendMomoRequest(payload);
    if (momoRes.resultCode === 0) {
      if (await isMysqlUp()) {
        await db.query(
          "UPDATE bookings SET payment_provider='MOMO', payment_status='PENDING' WHERE id=?",
          [bookingId]
        ).catch(() => {});
      }
      // In-memory fallback
      memoryBookingState.set(String(bookingId), { paymentStatus: "PENDING", provider: "MOMO" });
      return res.json({
        success: true,
        payUrl: momoRes.payUrl,
        deeplink: momoRes.deeplink,
        qrCodeUrl: momoRes.qrCodeUrl,
        orderId,
        requestId
      });
    }
    return res.status(400).json({ message: momoRes.message || "MoMo payment creation failed", momoRes });
  } catch (err) {
    return res.status(500).json({ message: "MoMo service error", error: err.message });
  }
}

export async function momoIpnHandler(req, res) {
  const { orderId, resultCode, extraData } = req.body || {};
  let bookingId = null;
  try {
    const decoded = JSON.parse(Buffer.from(extraData || "", "base64").toString("utf-8"));
    bookingId = decoded.bookingId;
  } catch (_e) {}

  if (resultCode === 0) {
    if (bookingId) {
      let lotId = "UNKNOWN";
      let plateNumber = "UNKNOWN";
      if (await isMysqlUp()) {
        const [rows] = await db.query("SELECT parking_lot_id, plate_number FROM bookings WHERE id=?", [bookingId]).catch(() => [[], []]);
        lotId = rows.length > 0 ? rows[0].parking_lot_id : "UNKNOWN";
        plateNumber = rows.length > 0 ? (rows[0].plate_number || "UNKNOWN") : "UNKNOWN";
      }

      const qrToken = jwt.sign(
        { sub: `booking:${bookingId}`, role: "USER", lotId, gateId: "HUE_GATE_1", direction: "IN", plateNumber },
        process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret",
        { expiresIn: "4h" }
      );

      if (await isMysqlUp()) {
        await db.query(
          "UPDATE bookings SET payment_status='PAID', payment_provider='MOMO', qr_code_token=? WHERE id=?",
          [qrToken, bookingId]
        ).catch(() => {});
      }
      // In-memory fallback
      memoryBookingState.set(String(bookingId), { paymentStatus: "PAID", provider: "MOMO", qrToken });

      if (lotId && lotId !== "UNKNOWN") {
        const current = await getInternalSlotCount(lotId) || 0;
        if (current > 0) {
          await internalUpdateSlot(lotId, current - 1, "BOOKING_RESERVATION");
        }
      }

      return res.json({ success: true, bookingId, qrToken });
    }
    return res.json({ success: true, message: "Payment confirmed" });
  }

  if (bookingId) {
    await db.query("UPDATE bookings SET payment_status='FAILED' WHERE id=?", [bookingId]).catch(() => {});
  }
  return res.json({ success: false, message: "Payment failed or cancelled" });
}

export async function checkPaymentStatus(req, res) {
  const { bookingId } = req.params;
  // Try MySQL first
  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query(
        "SELECT id, payment_status, qr_code_token, parking_lot_id FROM bookings WHERE id=?",
        [bookingId]
      );
      if (rows.length > 0) {
        const b = rows[0];
        let qrDataUrl = null;
        if (b.qr_code_token) {
          qrDataUrl = await QRCode.toDataURL(b.qr_code_token);
        }
        return res.json({ bookingId: b.id, paymentStatus: b.payment_status, qrToken: b.qr_code_token, qrDataUrl });
      }
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }

  // In-memory fallback: check both local momo state and shared payment state
  let state = memoryBookingState.get(String(bookingId));
  if (!state) state = getMemoryPaymentState().get(String(bookingId));
  if (!state) return res.status(404).json({ message: "Booking not found" });
  let qrDataUrl = null;
  if (state.qrToken) {
    qrDataUrl = await QRCode.toDataURL(state.qrToken);
  }
  return res.json({ bookingId: Number(bookingId), paymentStatus: state.paymentStatus, qrToken: state.qrToken || null, qrDataUrl });
}
