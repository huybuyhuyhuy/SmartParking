import { db } from "./db.js";
import { cacheGet, cacheSetEx } from "./redisClient.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getNearbyParking(req, res) {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius || 1);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ message: "lat/lng is required and must be numeric" });
  }

  const cacheKey = `nearby:${lat}:${lng}:${radius}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(JSON.parse(cached));

  let rows;
  try {
    const result = await db.query(
      "SELECT id, name, latitude, longitude, price_per_hour, ev_supported, total_slots FROM parking_lots"
    );
    rows = result[0];
  } catch (_e) {
    // Fallback to local GeoJSON if MySQL isn't available (dev mode without Docker).
    const geoPath = path.resolve(__dirname, "..", "Data", "hue_parking_geometry.json");
    const raw = await fs.readFile(geoPath, "utf-8");
    const geo = JSON.parse(raw);
    rows = (geo.features || []).map((f) => {
      const coords = f?.geometry?.coordinates?.[0]?.[0];
      return {
        id: f?.properties?.id ?? "HUE-UNKNOWN",
        name: f?.properties?.name ?? "Hue Parking Lot",
        latitude: coords?.[1] ?? lat,
        longitude: coords?.[0] ?? lng,
        price_per_hour: 5000,
        ev_supported: 0,
        total_slots: f?.properties?.capacity ?? 100
      };
    });
  }

  const output = [];
  for (const row of rows) {
    const distanceKm = haversineKm(lat, lng, Number(row.latitude), Number(row.longitude));
    if (distanceKm <= radius) {
      const available = await cacheGet(`slots:${row.id}`);
      output.push({
        id: row.id,
        name: row.name,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        distanceKm: Number(distanceKm.toFixed(3)),
        pricePerHour: Number(row.price_per_hour),
        evSupported: Boolean(Number(row.ev_supported)),
        availableSlots: Number(available ?? row.total_slots)
      });
    }
  }

  await cacheSetEx(cacheKey, 30, JSON.stringify(output));
  return res.json(output);
}
