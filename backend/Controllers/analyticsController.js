import { db } from "./db.js";

// In-memory fallback data
const memoryStats = {
  todayRevenue: 0,
  todayBookings: 0,
  paidBookings: 0,
  activeSessions: 0,
  gateEventsToday: 0
};

async function isMysqlUp() {
  try { await db.query("SELECT 1"); return true; } catch (_e) { return false; }
}

export async function getDashboardStats(req, res) {
  if (await isMysqlUp()) {
    try {
      const [lotRows] = await db.query("SELECT COUNT(*) as total FROM parking_lots").catch(() => [[{ total: 0 }]]);
      const [bookingRows] = await db.query(
        "SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as revenue FROM bookings WHERE payment_status='PAID' AND DATE(created_at) = CURDATE()"
      ).catch(() => [[{ total: 0, revenue: 0 }]]);
      const [todayBookings] = await db.query(
        "SELECT COUNT(*) as total FROM bookings WHERE DATE(created_at) = CURDATE()"
      ).catch(() => [[{ total: 0 }]]);
      const [activeBookings] = await db.query(
        "SELECT COUNT(*) as total FROM bookings WHERE payment_status='PAID' AND ended_at IS NULL"
      ).catch(() => [[{ total: 0 }]]);
      const [gateEvents] = await db.query(
        "SELECT COUNT(*) as total FROM slot_events WHERE source IN ('GATE_IN','GATE_OUT') AND DATE(created_at) = CURDATE()"
      ).catch(() => [[{ total: 0 }]]);

      return res.json({
        totalLots: lotRows[0].total,
        todayRevenue: Number(bookingRows[0].revenue || 0),
        todayBookings: todayBookings[0].total,
        paidBookings: bookingRows[0].total,
        activeSessions: activeBookings[0].total,
        gateEventsToday: gateEvents[0].total
      });
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }

  return res.json({ totalLots: 0, ...memoryStats });
}

export async function getRevenueChart(req, res) {
  const days = Number(req.query.days || 7);
  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as bookings
         FROM bookings WHERE payment_status='PAID' AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY DATE(created_at) ORDER BY date ASC`, [days]
      ).catch(() => [[], []]);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }
  // In-memory: return empty chart data
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    result.push({ date: d.toISOString().slice(0, 10), revenue: 0, bookings: 0 });
  }
  return res.json(result);
}

export async function getOccupancyTrend(req, res) {
  const hours = Number(req.query.hours || 24);
  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT parking_lot_id, available_slots, source, created_at
         FROM slot_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
         ORDER BY created_at DESC LIMIT 500`, [hours]
      ).catch(() => [[], []]);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }
  return res.json([]);
}

export async function getLotUtilization(req, res) {
  if (await isMysqlUp()) {
    try {
      const [rows] = await db.query(
        `SELECT p.id, p.name, p.total_slots,
          (SELECT COUNT(*) FROM bookings b WHERE b.parking_lot_id = p.id AND b.payment_status='PAID' AND b.ended_at IS NULL) as current_occupancy
         FROM parking_lots p ORDER BY current_occupancy DESC`
      ).catch(() => [[], []]);
      return res.json(rows);
    } catch (err) {
      return res.status(500).json({ message: err.message });
    }
  }
  return res.json([]);
}
