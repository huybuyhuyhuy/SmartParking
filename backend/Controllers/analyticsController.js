import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db.js";
import { getMemoryBookings } from "./bookingController.js";
import { getInternalSlotCount, getMemorySlotEvents } from "./slotController.js";

import { isSqlUp } from "./db.js";
import { sendError } from "./httpResponse.js";

const GEO_PATH = path.resolve(process.cwd(), "Data", "hue_parking_geometry.json");

async function getMemoryLotSnapshot() {
  try {
    const raw = await fs.readFile(GEO_PATH, "utf-8");
    const geo = JSON.parse(raw);
    return geo.features || [];
  } catch (_e) {
    return [];
  }
}

function computeMemoryStats() {
  const all = getMemoryBookings();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const paidToday = all.filter(
    (b) => b.payment_status === "PAID" && b.created_at.slice(0, 10) === todayStr
  );
  const allToday = all.filter((b) => b.created_at.slice(0, 10) === todayStr);
  const active = all.filter((b) => b.payment_status === "PAID" && !b.ended_at);

  const totalRevenue = paidToday.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const revenueMotorbike = paidToday
    .filter((b) => b.vehicle_type === "MOTORBIKE")
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const revenueCar = paidToday
    .filter((b) => b.vehicle_type !== "MOTORBIKE")
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  return {
    todayRevenue: totalRevenue,
    todayRevenueMotorbike: revenueMotorbike,
    todayRevenueCar: revenueCar,
    todayBookings: allToday.length,
    paidBookings: paidToday.length,
    activeSessions: active.length,
    gateEventsToday: 0
  };
}

export async function getDashboardStats(req, res) {
  if (await isSqlUp()) {
    try {
      const [lotRows] = await db.query(
        "SELECT COUNT(*) as total FROM parking_lots"
      ).catch(() => [[{ total: 0 }]]);

      // Revenue: PAID bookings where created today OR completed (ended) today
      const [bookingRows] = await db.query(
        `SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as revenue
         FROM bookings WHERE payment_status='PAID'
         AND (CAST(created_at AS DATE) = CAST(GETDATE() AS DATE) OR CAST(ended_at AS DATE) = CAST(GETDATE() AS DATE))`
      ).catch(() => [[{ total: 0, revenue: 0 }]]);

      // Revenue by vehicle type (today)
      const [revenueByType] = await db.query(
        `SELECT vehicle_type, COALESCE(SUM(amount), 0) as revenue
         FROM bookings WHERE payment_status='PAID'
         AND (CAST(created_at AS DATE) = CAST(GETDATE() AS DATE) OR CAST(ended_at AS DATE) = CAST(GETDATE() AS DATE))
         GROUP BY vehicle_type`
      ).catch(() => [[], []]);

      const [todayBookings] = await db.query(
        "SELECT COUNT(*) as total FROM bookings WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)"
      ).catch(() => [[{ total: 0 }]]);

      const [activeBookings] = await db.query(
        "SELECT COUNT(*) as total FROM bookings WHERE payment_status='PAID' AND ended_at IS NULL"
      ).catch(() => [[{ total: 0 }]]);

      const [gateEvents] = await db.query(
        "SELECT COUNT(*) as total FROM gate_events WHERE CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)"
      ).catch(() => [[{ total: 0 }]]);

      const rvByType = {};
      for (const row of revenueByType) {
        rvByType[row.vehicle_type || "CAR"] = Number(row.revenue || 0);
      }

      return res.json({
        totalLots: lotRows[0].total,
        todayRevenue: Number(bookingRows[0].revenue || 0),
        todayRevenueMotorbike: rvByType["MOTORBIKE"] || 0,
        todayRevenueCar: rvByType["CAR"] || 0,
        todayBookings: todayBookings[0].total,
        paidBookings: bookingRows[0].total,
        activeSessions: activeBookings[0].total,
        gateEventsToday: gateEvents[0].total
      });
    } catch (err) {
      return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message);
    }
  }

  // Memory fallback — now computed from actual memory data, not hardcoded zeros
  const mem = computeMemoryStats();
  const lots = await getMemoryLotSnapshot();
  return res.json({ totalLots: lots.length, ...mem });
}

export async function getRevenueChart(req, res) {
  const days = Number(req.query.days || 7);
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT CAST(COALESCE(ended_at, started_at) AS DATE) as date, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as bookings
         FROM bookings WHERE payment_status='PAID'
         AND COALESCE(ended_at, started_at) >= DATEADD(DAY, -?, CAST(GETDATE() AS DATE))
         GROUP BY CAST(COALESCE(ended_at, started_at) AS DATE) ORDER BY date ASC`, [days]
      ).catch(() => [[], []]);
      return res.json(rows);
    } catch (err) {
      return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message);
    }
  }
  const all = getMemoryBookings().filter((b) => b.payment_status === "PAID");
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayBookings = all.filter((b) => {
      const effectiveDate = (b.ended_at || b.started_at || b.created_at).slice(0, 10);
      return effectiveDate === dateStr;
    });
    result.push({
      date: dateStr,
      revenue: dayBookings.reduce((s, b) => s + (Number(b.amount) || 0), 0),
      bookings: dayBookings.length
    });
  }
  return res.json(result);
}

export async function getOccupancyTrend(req, res) {
  const hours = Number(req.query.hours || 24);
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT parking_lot_id, available_slots, source, created_at
         FROM slot_events WHERE created_at >= DATEADD(HOUR, -?, GETDATE())
         ORDER BY created_at DESC OFFSET 0 ROWS FETCH NEXT 500 ROWS ONLY`, [hours]
      ).catch(() => [[], []]);
      return res.json(rows);
    } catch (err) {
      return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message);
    }
  }
  return res.json(getMemorySlotEvents(500));
}

export async function getLotUtilization(req, res) {
  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT p.id, p.name, p.total_slots,
          (SELECT COUNT(*) FROM bookings b WHERE b.parking_lot_id = p.id AND b.payment_status='PAID' AND b.ended_at IS NULL) as current_occupancy
         FROM parking_lots p ORDER BY current_occupancy DESC`
      ).catch(() => [[], []]);
      return res.json(rows);
    } catch (err) {
      return sendError(res, 500, "SYSTEM_INTERNAL_ERROR", err.message);
    }
  }
  const features = await getMemoryLotSnapshot();
  const activeBookings = getMemoryBookings().filter((b) => b.payment_status === "PAID" && !b.ended_at);
  const rows = await Promise.all(features.map(async (feature) => {
    const props = feature.properties || {};
    const id = props.id;
    const totalSlots = Number(props.capacity || 0);
    const available = await getInternalSlotCount(id);
    const currentOccupancy = available != null
      ? Math.max(0, totalSlots - available)
      : activeBookings.filter((b) => b.parking_lot_id === id).length;
    return {
      id,
      name: props.name,
      total_slots: totalSlots,
      current_occupancy: currentOccupancy
    };
  }));
  return res.json(rows.sort((a, b) => b.current_occupancy - a.current_occupancy));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function getCapacityForecast(req, res) {
  const lots = await getMemoryLotSnapshot();
  let events = [];

  if (await isSqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT parking_lot_id, available_slots, source, created_at
         FROM slot_events
         WHERE created_at >= DATEADD(HOUR, -3, GETDATE())
         ORDER BY created_at ASC`
      );
      events = rows.map((r) => ({
        lotId: r.parking_lot_id,
        availableSlots: Number(r.available_slots),
        source: r.source,
        ts: r.created_at
      }));
    } catch (_e) {
      events = [];
    }
  } else {
    events = getMemorySlotEvents(200).slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  }

  const forecast = await Promise.all(lots.map(async (feature) => {
    const props = feature.properties || {};
    const id = props.id;
    const capacity = Number(props.capacity || 0);
    const relevant = events.filter((e) => e.lotId === id);
    const currentAvailable = await getInternalSlotCount(id);
    const latestAvailable = currentAvailable ?? relevant.at(-1)?.availableSlots ?? capacity;
    let slopePerMinute = 0;

    if (relevant.length >= 2) {
      const first = relevant[0];
      const last = relevant[relevant.length - 1];
      const minutes = Math.max(1, (new Date(last.ts) - new Date(first.ts)) / 60000);
      slopePerMinute = (Number(last.availableSlots) - Number(first.availableSlots)) / minutes;
    }

    const predicted30 = Math.round(clamp(latestAvailable + slopePerMinute * 30, 0, capacity));
    const predicted60 = Math.round(clamp(latestAvailable + slopePerMinute * 60, 0, capacity));
    const occupancyPct = capacity > 0 ? Math.round(((capacity - latestAvailable) / capacity) * 100) : 0;
    const riskLevel =
      predicted30 <= 0 || occupancyPct >= 90 ? "critical" :
      predicted60 <= 0 || occupancyPct >= 70 ? "warning" :
      "stable";

    return {
      id,
      name: props.name,
      capacity,
      currentAvailable: latestAvailable,
      predictedAvailable30m: predicted30,
      predictedAvailable60m: predicted60,
      occupancyPct,
      slopePerMinute: Number(slopePerMinute.toFixed(3)),
      riskLevel,
      eventCount: relevant.length
    };
  }));

  return res.json(forecast.sort((a, b) => {
    const weight = { critical: 0, warning: 1, stable: 2 };
    return weight[a.riskLevel] - weight[b.riskLevel] || a.predictedAvailable60m - b.predictedAvailable60m;
  }));
}
