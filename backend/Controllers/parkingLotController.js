import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cacheGet, cacheSet } from "./redisClient.js";
import { db } from "./db.js";
import { sendError } from "./httpResponse.js";
import { recordTelemetryEvent } from "./telemetryController.js";
import { broadcastParkingLotUpdate } from "../wsServer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEO_PATH = path.resolve(__dirname, "..", "Data", "hue_parking_geometry.json");

async function readGeo() {
  const raw = await fs.readFile(GEO_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeGeo(doc) {
  await fs.writeFile(GEO_PATH, JSON.stringify(doc, null, 2), "utf-8");
}

async function upsertParkingLotToDb(feature) {
  const lot = featureToLot(feature);
  try {
    await db.query(
      `MERGE parking_lots AS target
      USING (SELECT ? AS id, ? AS name, ? AS latitude, ? AS longitude, ? AS total_slots, ? AS price_per_hour,
                    ? AS price_per_hour_motorbike, ? AS ev_supported, ? AS polygon_geojson, ? AS vehicle_type,
                    ? AS open_time, ? AS close_time, ? AS has_security, ? AS contact_phone, ? AS description, ? AS image_url) AS source
      ON target.id = source.id
      WHEN MATCHED THEN UPDATE SET
        name = source.name, latitude = source.latitude, longitude = source.longitude,
        total_slots = source.total_slots, price_per_hour = source.price_per_hour,
        price_per_hour_motorbike = source.price_per_hour_motorbike, ev_supported = source.ev_supported,
        polygon_geojson = source.polygon_geojson, vehicle_type = source.vehicle_type,
        open_time = source.open_time, close_time = source.close_time,
        has_security = source.has_security, contact_phone = source.contact_phone,
        description = source.description, image_url = source.image_url
      WHEN NOT MATCHED THEN INSERT
        (id, name, latitude, longitude, total_slots, price_per_hour, price_per_hour_motorbike, ev_supported, polygon_geojson,
         vehicle_type, open_time, close_time, has_security, contact_phone, description, image_url)
      VALUES (source.id, source.name, source.latitude, source.longitude, source.total_slots, source.price_per_hour,
              source.price_per_hour_motorbike, source.ev_supported, source.polygon_geojson, source.vehicle_type,
              source.open_time, source.close_time, source.has_security, source.contact_phone, source.description, source.image_url);`,
      [
        lot.id, lot.name, lot.lat, lot.lng, lot.capacity, lot.pricePerHour, lot.pricePerHourMotorbike,
        lot.evSupported ? 1 : 0, JSON.stringify(feature.geometry),
        lot.vehicleType, lot.openTime, lot.closeTime, lot.hasSecurity ? 1 : 0,
        lot.contactPhone, lot.description, lot.imageUrl
      ]
    );
  } catch (_e) {
    // Dev mode without MySQL.
  }
}

async function deleteParkingLotFromDb(id) {
  try {
    await db.query("DELETE FROM parking_lots WHERE id = ?", [id]);
  } catch (_e) {
    // Dev mode without MySQL.
  }
}

function polygonCenter(feature) {
  const ring = feature?.geometry?.coordinates?.[0] || [];
  const points = ring.length > 1 ? ring.slice(0, -1) : ring;
  if (points.length === 0) return { lat: NaN, lng: NaN };

  let area2 = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    area2 += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }

  if (Math.abs(area2) < 1e-12) {
    const avg = points.reduce(
      (acc, [lng, lat]) => ({ lng: acc.lng + lng, lat: acc.lat + lat }),
      { lng: 0, lat: 0 }
    );
    return { lng: avg.lng / points.length, lat: avg.lat / points.length };
  }

  return {
    lng: centroidX / (3 * area2),
    lat: centroidY / (3 * area2)
  };
}

function featureToLot(feature) {
  const props = feature?.properties || {};
  const center = polygonCenter(feature);
  return {
    id: props.id,
    name: props.name,
    capacity: Number(props.capacity ?? 100),
    pricePerHour: Number(props.pricePerHour ?? 5000),
    pricePerHourMotorbike: Number(props.pricePerHourMotorbike ?? props.pricePerHour ?? 2000),
    evSupported: Boolean(props.evSupported),
    lat: Number(center.lat),
    lng: Number(center.lng),
    geometry: feature.geometry,
    updatedAt: props.updatedAt || null,
    vehicleType: props.vehicleType || "CAR",
    openTime: props.openTime || "06:00",
    closeTime: props.closeTime || "22:00",
    hasSecurity: Boolean(props.hasSecurity),
    contactPhone: props.contactPhone || "",
    description: props.description || "",
    imageUrl: props.imageUrl || ""
  };
}

function validateFeature(feature) {
  if (!feature || feature.type !== "Feature" || feature.geometry?.type !== "Polygon") {
    return "Body must be a GeoJSON Feature (Polygon)";
  }
  const id = feature?.properties?.id;
  const name = feature?.properties?.name;
  if (!id || !name) return "properties.id and properties.name are required";

  const ring = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 4) return "Polygon must have at least 4 points";
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!Array.isArray(first) || !Array.isArray(last) || first[0] !== last[0] || first[1] !== last[1]) {
    return "Polygon must be closed (first point equals last point)";
  }
  return null;
}

function normalizeFeature(feature) {
  const props = feature.properties || {};
  return {
    ...feature,
    properties: {
      ...props,
      id: String(props.id).trim(),
      name: String(props.name).trim(),
      capacity: Number(props.capacity ?? 100),
      pricePerHour: Number(props.pricePerHour ?? 5000),
      pricePerHourMotorbike: Number(props.pricePerHourMotorbike ?? props.pricePerHour ?? 2000),
      evSupported: Boolean(props.evSupported),
      vehicleType: props.vehicleType || "CAR",
      openTime: props.openTime || "06:00",
      closeTime: props.closeTime || "22:00",
      hasSecurity: Boolean(props.hasSecurity),
      contactPhone: props.contactPhone || "",
      description: props.description || "",
      imageUrl: props.imageUrl || "",
      updatedAt: new Date().toISOString()
    }
  };
}

export async function listParkingLots(req, res) {
  const geo = await readGeo();
  const features = geo.features || [];
  const output = [];
  for (const f of features) {
    const lot = featureToLot(f);
    const cached = await cacheGet(`slots:${lot.id}`);
    let available = (cached !== null && cached !== undefined) ? Number(cached) : lot.capacity;
    // Clamp to valid range - stale cache can't exceed real capacity
    if (available > lot.capacity) available = lot.capacity;
    if (available < 0) available = 0;
    output.push({
      ...lot,
      availableSlots: available
    });
  }
  res.json(output);
}

export async function upsertParkingLot(req, res) {
  const feature = normalizeFeature(req.body);
  const validationError = validateFeature(feature);
  if (validationError) {
    const code = validationError.startsWith("Polygon")
      ? "PARKING_LOT_INVALID_POLYGON"
      : "VALIDATION_INVALID_GEOJSON";
    return sendError(res, 400, code, validationError);
  }
  const id = feature.properties.id;

  const geo = await readGeo();
  const features = geo.features || [];
  const idx = features.findIndex((f) => f?.properties?.id === id);
  if (idx >= 0) features[idx] = feature;
  else features.push(feature);

  geo.type = "FeatureCollection";
  geo.features = features;
  await writeGeo(geo);
  await upsertParkingLotToDb(feature);

  // Initialize slot state to match capacity
  const cap = feature.properties.capacity ?? 100;
  await cacheSet(`slots:${id}`, String(cap));
  recordTelemetryEvent("parking_lot_upserted", {
    requestId: req.requestId,
    lotId: id,
    capacity: cap,
    actorUserId: req.user?.userId ?? null
  });
  broadcastParkingLotUpdate(idx >= 0 ? "updated" : "created", id);

  res.json({ ok: true, id });
}

export async function deleteParkingLot(req, res) {
  const id = req.params.id;
  if (!id) return sendError(res, 400, "VALIDATION_REQUIRED_FIELD", "id is required");

  const geo = await readGeo();
  const features = geo.features || [];
  const next = features.filter((f) => f?.properties?.id !== id);
  if (next.length === features.length) {
    return sendError(res, 404, "PARKING_LOT_NOT_FOUND", "Parking lot not found");
  }

  geo.features = next;
  await writeGeo(geo);
  await deleteParkingLotFromDb(id);
  recordTelemetryEvent("parking_lot_deleted", {
    requestId: req.requestId,
    lotId: id,
    actorUserId: req.user?.userId ?? null
  });
  broadcastParkingLotUpdate("deleted", id);
  return res.json({ ok: true, id });
}

