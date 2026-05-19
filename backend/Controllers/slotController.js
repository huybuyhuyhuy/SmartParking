import fs from "node:fs/promises";
import path from "node:path";
import { db, isSqlUp } from "./db.js";
import { cacheGet, cacheSet } from "./redisClient.js";
import { ensureKafkaProducer, producer } from "./kafkaClient.js";
import { broadcastSlotUpdate } from "../wsServer.js";
import { sendError } from "./httpResponse.js";
import { recordTelemetryEvent } from "./telemetryController.js";

const GEO_PATH = path.resolve(process.cwd(), "Data", "hue_parking_geometry.json");
const slotState = new Map();
const slotHistory = [];
const MAX_HISTORY = 200;

// Keep a loaded snapshot of parking lot capacities
let lotCapacities = new Map();

export async function initSlotState() {
  try {
    const raw = await fs.readFile(GEO_PATH, "utf-8");
    const geo = JSON.parse(raw);
    const features = geo.features || [];
    let latestDbSlots = new Map();
    if (await isSqlUp()) {
      try {
        const [rows] = await db.query(
          `SELECT parking_lot_id, available_slots
           FROM (
             SELECT parking_lot_id, available_slots,
                    ROW_NUMBER() OVER (PARTITION BY parking_lot_id ORDER BY created_at DESC, id DESC) AS rn
             FROM slot_events
           ) ranked
           WHERE rn = 1`
        );
        latestDbSlots = new Map(rows.map((row) => [row.parking_lot_id, Number(row.available_slots)]));
      } catch (_e) {
        latestDbSlots = new Map();
      }
    }
    for (const f of features) {
      const id = f.properties?.id;
      const cap = Number(f.properties?.capacity ?? 100);
      if (id) {
        lotCapacities.set(id, cap);
        if (!slotState.has(id)) {
          const dbLatest = latestDbSlots.get(id);
          const cached = await cacheGet(`slots:${id}`);
          const val = dbLatest != null
            ? Math.min(Number(dbLatest), cap)
            : (cached !== null && cached !== undefined)
              ? Math.min(Number(cached), cap)
              : cap;
          slotState.set(id, val);
          await cacheSet(`slots:${id}`, String(val));
        }
      }
    }
    console.log(`[slot] Initialized ${lotCapacities.size} parking lots`);
  } catch (_e) {
    console.log("[slot] No parking lot data yet, will init on first list");
  }
}

async function loadCapacityFromFile(lotId) {
  try {
    const raw = await fs.readFile(GEO_PATH, "utf-8");
    const geo = JSON.parse(raw);
    const features = geo.features || [];
    for (const f of features) {
      if (f.properties?.id === lotId) {
        const cap = Number(f.properties?.capacity ?? 100);
        lotCapacities.set(lotId, cap);
        return cap;
      }
    }
  } catch (_e) {}
  return null;
}

function requireSensorApiKey(req) {
  const key = req.header("x-sensor-api-key");
  const expected = process.env.SENSOR_API_KEY || "hue-iot-key";
  return key && key === expected;
}

export async function internalUpdateSlot(lotId, availableSlots, source = "GATE_SYSTEM") {
  slotState.set(lotId, availableSlots);

  try {
    await cacheSet(`slots:${lotId}`, String(availableSlots));
  } catch (_e) {}

  const event = {
    lotId,
    availableSlots,
    source,
    ts: new Date().toISOString()
  };
  slotHistory.unshift(event);
  if (slotHistory.length > MAX_HISTORY) slotHistory.length = MAX_HISTORY;

  try {
    if (await ensureKafkaProducer()) {
      await producer.send({
        topic: "smart-parking-slot-events",
        messages: [{ key: lotId, value: JSON.stringify(event) }]
      });
    }
  } catch (_e) {}

  try {
    await db.query(
      "INSERT INTO slot_events(parking_lot_id, available_slots, source) VALUES (?, ?, ?)",
      [lotId, availableSlots, source]
    );
  } catch (_e) {}

  broadcastSlotUpdate(lotId, availableSlots);
  recordTelemetryEvent("slot_state_updated", {
    lotId,
    availableSlots,
    source
  });
}

export async function updateSlotBySensor(req, res) {
  if (!requireSensorApiKey(req)) {
    return sendError(res, 401, "SENSOR_API_KEY_INVALID", "Invalid sensor API key");
  }

  const lotId = req.params.id;
  const availableSlots = Number(req.body.availableSlots);
  if (!Number.isInteger(availableSlots) || availableSlots < 0) {
    return sendError(res, 400, "SLOT_AVAILABLE_COUNT_INVALID", "availableSlots must be a non-negative integer");
  }

  await internalUpdateSlot(lotId, availableSlots, "IOT_SENSOR");
  return res.json({ ok: true, lotId, availableSlots });
}

export async function getInternalSlotCount(lotId) {
  // Try in-memory first
  if (slotState.has(lotId)) return slotState.get(lotId);

  // Fallback: try Redis cache
  try {
    const cached = await cacheGet(`slots:${lotId}`);
    if (cached !== null && cached !== undefined) {
      const val = Number(cached);
      slotState.set(lotId, val);
      return val;
    }
  } catch (_e) {}

  // Fallback: read capacity from GeoJSON file
  const cap = lotCapacities.get(lotId) || await loadCapacityFromFile(lotId);
  if (cap !== null) {
    slotState.set(lotId, cap);
    return cap;
  }

  return undefined;
}

export async function getSlots(_req, res) {
  const data = Object.fromEntries(slotState.entries());
  return res.json(data);
}

export async function getSlotEvents(req, res) {
  const limit = Math.min(Number(req.query.limit || 50), MAX_HISTORY);
  try {
    const [rows] = await db.query(
      "SELECT parking_lot_id, available_slots, source, created_at FROM slot_events ORDER BY created_at DESC OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY",
      [limit]
    );
    return res.json(
      rows.map((r) => ({
        lotId: r.parking_lot_id,
        availableSlots: r.available_slots,
        source: r.source,
        ts: r.created_at
      }))
    );
  } catch (_e) {
    return res.json(slotHistory.slice(0, limit));
  }
}

export function seedMemorySlotEvents(events = []) {
  for (const event of [...events].reverse()) {
    slotHistory.unshift({
      lotId: event.lotId,
      availableSlots: event.slots ?? event.availableSlots,
      source: event.source,
      ts: event.ts
    });
  }
  if (slotHistory.length > MAX_HISTORY) slotHistory.length = MAX_HISTORY;
}

export function getMemorySlotEvents(limit = MAX_HISTORY) {
  return slotHistory.slice(0, Math.min(limit, MAX_HISTORY));
}
