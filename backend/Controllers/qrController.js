import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getInternalSlotCount, internalUpdateSlot } from "./slotController.js";
import { processCheckout } from "./bookingController.js";
import { db } from "./db.js";

const gateEvents = [];
const MAX_GATE_EVENTS = 200;
const usedTokens = new Set(); // For anti-replay, store hashes

function signQr(payload, expiresIn = "2h") {
  return jwt.sign(payload, process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret", { expiresIn });
}

function pushGateEvent(event) {
  gateEvents.unshift(event);
  if (gateEvents.length > MAX_GATE_EVENTS) gateEvents.length = MAX_GATE_EVENTS;
}

export async function verifyAdminQr(req, res) {
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ message: "qrToken is required" });

  try {
    const payload = jwt.verify(qrToken, process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret");
    if (payload.role !== "ADMIN" && payload.role !== "OPERATOR") {
      return res.status(403).json({ message: "Role not allowed to open gate" });
    }

    // Servo motor integration point:
    // triggerServo(payload.gateId)
    return res.json({ granted: true, gateId: payload.gateId, actor: payload.sub });
  } catch (_err) {
    return res.status(401).json({ granted: false, message: "Invalid or expired QR" });
  }
}

export async function issueUserQr(req, res) {
  const { bookingId, plateNumber, lotId, gateId, direction = "IN" } = req.body || {};
  if (!bookingId) return res.status(400).json({ message: "bookingId is required" });

  const expiresIn = "4h";
  const token = signQr(
    {
      sub: `booking:${bookingId}`,
      role: "USER",
      lotId: lotId || "UNKNOWN",
      gateId: gateId || "HUE_GATE_1",
      plateNumber: plateNumber || "UNKNOWN",
      direction
    },
    expiresIn
  );

  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours
  return res.json({ 
    bookingId, 
    qrToken: token, 
    expiresAt, 
    direction,
    plateNumber: plateNumber || "UNKNOWN",
    timestamp: new Date().toISOString()
  });
}

export async function gateScan(req, res) {
  const { qrToken, scannerId } = req.body || {};
  if (!qrToken) return res.status(400).json({ message: "qrToken is required" });

  const tokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');

  try {
    const payload = jwt.verify(qrToken, process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret");
    const role = payload.role;
    const isAllowed = role === "ADMIN" || role === "OPERATOR" || role === "USER";
    if (!isAllowed) {
      return res.status(403).json({ granted: false, message: "Role not allowed" });
    }

    // Anti-replay check
    if (usedTokens.has(tokenHash)) {
      return res.status(403).json({ granted: false, message: "Token already used (anti-replay)" });
    }

    // Time-window validation for future-time bookings
    if (role === "USER") {
      const bookingIdMatch = payload.sub?.match(/^booking:(.+)$/);
      if (bookingIdMatch) {
        try {
          const [rows] = await db.query(
            "SELECT scheduled_start FROM bookings WHERE id = ?",
            [bookingIdMatch[1]]
          );
          if (rows.length > 0 && rows[0].scheduled_start) {
            const scheduled = new Date(rows[0].scheduled_start);
            const now = new Date();
            const diffMs = now - scheduled;
            const diffMinutes = diffMs / (1000 * 60);
            if (diffMinutes < -60) {
              return res.status(403).json({
                granted: false,
                message: `Too early. Your booking starts at ${scheduled.toLocaleString()}. Please come back closer to your scheduled time.`
              });
            }
            if (diffMinutes > 4 * 60) {
              return res.status(403).json({
                granted: false,
                message: `Your booking window has expired (scheduled: ${scheduled.toLocaleString()}). Please make a new booking.`
              });
            }
          }
        } catch (_e) {
          // DB lookup failed — allow entry (graceful degradation)
        }
      }
    }

    const event = {
      gateId: payload.gateId || "HUE_GATE_1",
      actor: payload.sub,
      role,
      direction: payload.direction || "IN",
      scannerId: scannerId || "SCANNER_01",
      granted: true,
      ts: new Date().toISOString()
    };

    // Logical decrement/increment for slots
    // (Note: Decrement now happens at booking, so we only handle increment on OUT or handle gate-only logic)
    if (role === "USER" && payload.lotId && payload.lotId !== "UNKNOWN") {
      const current = await getInternalSlotCount(payload.lotId) || 0;
      if (event.direction === "OUT") {
        await internalUpdateSlot(payload.lotId, current + 1, "GATE_OUT");
        // Also trigger checkout to finalize the booking
        const bookingIdMatch = payload.sub?.match(/^booking:(.+)$/);
        if (bookingIdMatch) {
          try {
            await processCheckout(bookingIdMatch[1]);
          } catch (_e) {
            console.warn("[checkout] Auto-checkout via gate failed:", _e.message);
          }
        }
      }
    }

    pushGateEvent(event);
    usedTokens.add(tokenHash); // Mark as used
    return res.json({ 
      granted: true, 
      ...event, 
      plateNumber: payload.plateNumber || "UNKNOWN",
      bookingId: payload.sub
    });
  } catch (_err) {
    const event = {
      gateId: "UNKNOWN",
      actor: "UNKNOWN",
      role: "UNKNOWN",
      direction: "UNKNOWN",
      scannerId: scannerId || "SCANNER_01",
      granted: false,
      ts: new Date().toISOString()
    };
    pushGateEvent(event);
    return res.status(401).json({ granted: false, message: "Invalid or expired QR" });
  }
}

export async function getGateEvents(req, res) {
  const limit = Math.min(Number(req.query.limit || 50), MAX_GATE_EVENTS);
  return res.json(gateEvents.slice(0, limit));
}
