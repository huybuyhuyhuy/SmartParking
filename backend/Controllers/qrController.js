import jwt from "jsonwebtoken";
import crypto from "crypto";
import { processCheckout } from "./bookingController.js";
import { db, isSqlUp } from "./db.js";
import { cacheSetNxEx } from "./redisClient.js";
import { sendError } from "./httpResponse.js";
import { recordTelemetryEvent } from "./telemetryController.js";

const gateEvents = [];
const MAX_GATE_EVENTS = 200;

function signQr(payload, expiresIn = "2h") {
  return jwt.sign(payload, process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret", { expiresIn });
}

function pushGateEvent(event) {
  gateEvents.unshift(event);
  if (gateEvents.length > MAX_GATE_EVENTS) gateEvents.length = MAX_GATE_EVENTS;
}

async function persistGateEvent(event) {
  if (!(await isSqlUp())) return;
  try {
    await db.query(
      `INSERT INTO gate_events (
        gate_id, actor, role, direction, scanner_id, granted, reason_code, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.gateId,
        event.actor,
        event.role,
        event.direction,
        event.scannerId,
        event.granted ? 1 : 0,
        event.reasonCode,
        event.source || "SCANNER",
        event.ts
      ]
    );
  } catch (_e) {
    // Keep in-memory continuity even if persistence is temporarily unavailable.
  }
}

export async function recordGateEvent(event) {
  pushGateEvent(event);
  await persistGateEvent(event);
}

function buildGateEvent(payload, scannerId, granted, reasonCode = null) {
  return {
    gateId: payload?.gateId || "UNKNOWN",
    actor: payload?.sub || "UNKNOWN",
    role: payload?.role || "UNKNOWN",
    direction: payload?.direction || "UNKNOWN",
    scannerId: scannerId || "SCANNER_01",
    granted,
    reasonCode,
    source: "SCANNER",
    ts: new Date().toISOString()
  };
}

export async function verifyAdminQr(req, res) {
  const { qrToken } = req.body;
  if (!qrToken) return sendError(res, 400, "QR_REQUIRED", "qrToken is required");

  try {
    const payload = jwt.verify(qrToken, process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret");
    if (payload.role !== "ADMIN" && payload.role !== "OPERATOR") {
      return sendError(res, 403, "QR_ROLE_NOT_ALLOWED", "Role not allowed to open gate");
    }

    // Servo motor integration point:
    // triggerServo(payload.gateId)
    return res.json({ granted: true, gateId: payload.gateId, actor: payload.sub });
  } catch (_err) {
    return sendError(res, 401, "QR_INVALID_OR_EXPIRED", "Invalid or expired QR", undefined, { granted: false });
  }
}

export async function issueUserQr(req, res) {
  const { bookingId, plateNumber, lotId, gateId, direction = "IN" } = req.body || {};
  if (!bookingId) return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "bookingId is required");

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
  recordTelemetryEvent("qr_issued", {
    requestId: req.requestId,
    bookingId: String(bookingId),
    lotId: lotId || "UNKNOWN",
    direction,
    expiresAt,
    actorRole: req.user?.role
  });
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
  if (!qrToken) return sendError(res, 400, "QR_REQUIRED", "qrToken is required");

  recordTelemetryEvent("gate_scanned", {
    requestId: req.requestId,
    scannerId: scannerId || "SCANNER_01"
  });

  const tokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');

  try {
    const payload = jwt.verify(qrToken, process.env.QR_JWT_SECRET || "smart-parking-hue-qr-secret");
    const role = payload.role;
    const isAllowed = role === "ADMIN" || role === "OPERATOR" || role === "USER";
    if (!isAllowed) {
      await recordGateEvent(buildGateEvent(payload, scannerId, false, "QR_ROLE_NOT_ALLOWED"));
      recordTelemetryEvent("gate_denied", {
        requestId: req.requestId,
        scannerId: scannerId || "SCANNER_01",
        errorCode: "QR_ROLE_NOT_ALLOWED"
      });
      return sendError(res, 403, "QR_ROLE_NOT_ALLOWED", "Role not allowed", undefined, { granted: false });
    }

    // Time-window validation for future-time bookings
    // Only gate IN should be constrained by scheduled_start.
    // Gate OUT must remain allowed so the user can leave early or late,
    // and checkout will handle any extra charge if they overstay.
    if (role === "USER" && payload.direction !== "OUT") {
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
              await recordGateEvent(buildGateEvent(payload, scannerId, false, "GATE_TOO_EARLY"));
              recordTelemetryEvent("gate_denied", {
                requestId: req.requestId,
                scannerId: scannerId || "SCANNER_01",
                errorCode: "GATE_TOO_EARLY"
              });
              return sendError(res, 403, "GATE_TOO_EARLY", `Too early. Your booking starts at ${scheduled.toLocaleString()}. Please come back closer to your scheduled time.`, undefined, { granted: false });
            }
            if (diffMinutes > 4 * 60) {
              await recordGateEvent(buildGateEvent(payload, scannerId, false, "GATE_BOOKING_WINDOW_EXPIRED"));
              recordTelemetryEvent("gate_denied", {
                requestId: req.requestId,
                scannerId: scannerId || "SCANNER_01",
                errorCode: "GATE_BOOKING_WINDOW_EXPIRED"
              });
              return sendError(res, 403, "GATE_BOOKING_WINDOW_EXPIRED", `Your booking window has expired (scheduled: ${scheduled.toLocaleString()}). Please make a new booking.`, undefined, { granted: false });
            }
          }
        } catch (_e) {
          // DB lookup failed — allow entry (graceful degradation)
        }
      }
    }

    const event = buildGateEvent(payload, scannerId, true);

    // Anti-replay check happens only after all non-consuming validations pass.
    // This keeps a "too early" scan from burning an otherwise valid QR token.
    const nowSec = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.max(1, Number(payload.exp || nowSec + 4 * 60 * 60) - nowSec);
    const firstUse = await cacheSetNxEx(`qr:used:${tokenHash}`, ttlSeconds, "1");
    if (!firstUse) {
      await recordGateEvent(buildGateEvent(payload, scannerId, false, "QR_REPLAY_DETECTED"));
      recordTelemetryEvent("gate_denied", {
        requestId: req.requestId,
        scannerId: scannerId || "SCANNER_01",
        errorCode: "QR_REPLAY_DETECTED"
      });
      return sendError(res, 403, "QR_REPLAY_DETECTED", "Token already used (anti-replay)", undefined, { granted: false });
    }

    // Logical decrement/increment for slots
    // Decrement happens at booking; OUT delegates slot release to checkout so it is counted once.
    if (role === "USER" && payload.lotId && payload.lotId !== "UNKNOWN") {
      if (event.direction === "OUT") {
        const bookingIdMatch = payload.sub?.match(/^booking:(.+)$/);
        if (bookingIdMatch) {
          try {
            await processCheckout(bookingIdMatch[1], {
              requestId: req.requestId,
              scannerId,
              gateId: payload.gateId || "HUE_GATE_1",
              recordGateEvent: false
            });
          } catch (_e) {
            console.warn("[checkout] Auto-checkout via gate failed:", _e.message);
          }
        }
      }
    }

    await recordGateEvent(event);
    const bookingId = payload.sub?.startsWith("booking:")
      ? payload.sub.slice("booking:".length)
      : payload.sub;
    recordTelemetryEvent("gate_granted", {
      requestId: req.requestId,
      bookingId,
      gateId: event.gateId,
      scannerId: event.scannerId,
      direction: event.direction,
      role
    });
    return res.json({ 
      granted: true, 
      ...event, 
      plateNumber: payload.plateNumber || "UNKNOWN",
      bookingId: payload.sub
    });
  } catch (_err) {
    const event = buildGateEvent(null, scannerId, false, "QR_INVALID_OR_EXPIRED");
    await recordGateEvent(event);
    recordTelemetryEvent("gate_denied", {
      requestId: req.requestId,
      scannerId: scannerId || "SCANNER_01",
      errorCode: "QR_INVALID_OR_EXPIRED"
    });
    return sendError(res, 401, "QR_INVALID_OR_EXPIRED", "Invalid or expired QR", undefined, { granted: false });
  }
}

export async function getGateEvents(req, res) {
  const limit = Math.min(Number(req.query.limit || 50), MAX_GATE_EVENTS);
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT gate_id, actor, role, direction, scanner_id, granted, reason_code, source, created_at
         FROM gate_events
         ORDER BY created_at DESC, id DESC
         OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY`,
        [limit]
      );
      return res.json(rows.map((row) => ({
        gateId: row.gate_id,
        actor: row.actor,
        role: row.role,
        direction: row.direction,
        scannerId: row.scanner_id,
        granted: Boolean(row.granted),
        reasonCode: row.reason_code,
        source: row.source,
        ts: row.created_at
      })));
    } catch (_e) {
      // Fall back to the current process memory if the query fails.
    }
  }
  return res.json(gateEvents.slice(0, limit));
}
