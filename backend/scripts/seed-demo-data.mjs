import { db, isSqlUp } from "../Controllers/db.js";

if (!(await isSqlUp())) {
  throw new Error("Database is not available; seed demo data only runs against SQL Server.");
}

const today = new Date().toISOString().slice(0, 10);
const d = new Date();
const days = [];
for (let i = 6; i >= 0; i--) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - i);
  days.push(dt.toISOString().slice(0, 10));
}
const yesterday = days[5];

const sampleBookings = [
  { userId: 1, lotId: "HUE-P001", plate: "75A-12345", vehicleType: "CAR", phone: "0905123456", estHours: 2, amount: 10000, provider: "DIRECT", status: "PAID", startedAt: `${today} 08:15:00`, endedAt: `${today} 10:15:00` },
  { userId: 1, lotId: "HUE-P002", plate: "75A-67890", vehicleType: "CAR", phone: "0905987654", estHours: 4, amount: 28000, provider: "MOMO", status: "PAID", startedAt: `${today} 09:30:00`, endedAt: `${today} 13:30:00` },
  { userId: 1, lotId: "HUE-P003", plate: "75F1-11122", vehicleType: "MOTORBIKE", phone: "0913123444", estHours: 2, amount: 4000, provider: "DIRECT", status: "PAID", startedAt: `${today} 08:00:00`, endedAt: `${today} 10:00:00` },
  { userId: 1, lotId: "HUE-P004", plate: "75F1-33344", vehicleType: "MOTORBIKE", phone: "0913555666", estHours: 3, amount: 6000, provider: "MOMO", status: "PAID", startedAt: `${today} 10:00:00`, endedAt: `${today} 13:00:00` },
  { userId: 1, lotId: "HUE-P003", plate: "43A-11223", vehicleType: "CAR", phone: "0913123456", estHours: 2, amount: 10000, provider: "DIRECT", status: "PAID", startedAt: `${today} 07:00:00`, endedAt: `${today} 09:15:00` },
  { userId: 1, lotId: "HUE-P001", plate: "43A-44556", vehicleType: "CAR", phone: "0913987654", estHours: 1, amount: 5000, provider: "DIRECT", status: "PAID", startedAt: `${today} 10:00:00`, endedAt: `${today} 11:00:00` },
  { userId: 1, lotId: "HUE-P002", plate: "75F1-55566", vehicleType: "MOTORBIKE", phone: "0905777888", estHours: 1, amount: 3000, provider: "DIRECT", status: "PAID", startedAt: `${today} 12:00:00`, endedAt: `${today} 13:00:00` },
  { userId: 1, lotId: "HUE-P004", plate: "92A-77889", vehicleType: "CAR", phone: "0905111222", estHours: 3, amount: 30000, provider: null, status: "PENDING", startedAt: `${today} 11:45:00` },
  { userId: 1, lotId: "HUE-P002", plate: "75A-12345", vehicleType: "CAR", phone: "0905123456", estHours: 2, amount: 14000, provider: "DIRECT", status: "PAID", startedAt: `${yesterday} 14:00:00`, endedAt: `${yesterday} 16:30:00` },
  { userId: 1, lotId: "HUE-P001", plate: "75F1-77788", vehicleType: "MOTORBIKE", phone: "0905888999", estHours: 2, amount: 4000, provider: "DIRECT", status: "PAID", startedAt: `${yesterday} 09:00:00`, endedAt: `${yesterday} 11:00:00` },
  ...[2, 3, 4, 5, 6].map((daysAgo) => {
    const dt = days[6 - daysAgo];
    return [
      { userId: 1, lotId: "HUE-P003", plate: `43A-${10000 + daysAgo}1`, vehicleType: "CAR", phone: "0905000001", estHours: 2, amount: 10000, provider: "DIRECT", status: "PAID", startedAt: `${dt} 08:00:00`, endedAt: `${dt} 10:00:00` },
      { userId: 1, lotId: "HUE-P001", plate: `75F1-${20000 + daysAgo}2`, vehicleType: "MOTORBIKE", phone: "0905000002", estHours: 1, amount: 2000, provider: "MOMO", status: "PAID", startedAt: `${dt} 14:00:00`, endedAt: `${dt} 15:00:00` }
    ];
  }).flat()
];

const sampleEvents = [
  { lotId: "HUE-P001", slots: 48, source: "GATE_OUT", ts: `${today} 07:05:00` },
  { lotId: "HUE-P001", slots: 47, source: "BOOKING_RESERVATION", ts: `${today} 08:15:00` },
  { lotId: "HUE-P002", slots: 34, source: "BOOKING_RESERVATION", ts: `${today} 09:30:00` },
  { lotId: "HUE-P003", slots: 78, source: "GATE_OUT", ts: `${today} 07:10:00` },
  { lotId: "HUE-P003", slots: 77, source: "BOOKING_RESERVATION", ts: `${today} 07:00:00` },
  { lotId: "HUE-P004", slots: 149, source: "BOOKING_RESERVATION", ts: `${today} 11:45:00` },
  { lotId: "HUE-P001", slots: 48, source: "GATE_OUT", ts: `${today} 09:16:00` },
  { lotId: "HUE-P001", slots: 47, source: "BOOKING_RESERVATION", ts: `${today} 10:00:00` },
  { lotId: "HUE-P001", slots: 48, source: "CHECKOUT", ts: `${today} 11:01:00` }
];

const sampleGateEvents = [
  { gateId: "HUE_GATE_1", actor: "booking:demo-1001", role: "USER", direction: "IN", scannerId: "IOC_SCANNER_01", granted: true, reasonCode: null, source: "SCANNER", ts: `${today} 08:16:00` },
  { gateId: "HUE_GATE_1", actor: "booking:demo-1001", role: "USER", direction: "OUT", scannerId: "CHECKOUT_FLOW", granted: true, reasonCode: null, source: "CHECKOUT", ts: `${today} 10:16:00` },
  { gateId: "HUE_GATE_1", actor: "booking:demo-1002", role: "USER", direction: "IN", scannerId: "IOC_SCANNER_01", granted: true, reasonCode: null, source: "SCANNER", ts: `${today} 09:31:00` },
  { gateId: "HUE_GATE_1", actor: "booking:demo-1003", role: "USER", direction: "IN", scannerId: "IOC_SCANNER_02", granted: false, reasonCode: "QR_REPLAY_DETECTED", source: "SCANNER", ts: `${today} 10:02:00` }
];

await db.query("DELETE FROM slot_events WHERE parking_lot_id LIKE 'HUE-P%'");
await db.query("DELETE FROM gate_events WHERE actor LIKE 'booking:demo-%'");
await db.query("DELETE FROM bookings WHERE user_id = 1");

for (const b of sampleBookings) {
  await db.query(
    `INSERT INTO bookings (
      user_id, parking_lot_id, plate_number, vehicle_type, phone_number, estimated_hours,
      started_at, ended_at, amount, payment_provider, payment_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.userId, b.lotId, b.plate, b.vehicleType, b.phone, b.estHours, b.startedAt, b.endedAt || null, b.amount, b.provider, b.status, b.startedAt]
  );
}

for (const e of sampleEvents) {
  await db.query(
    "INSERT INTO slot_events (parking_lot_id, available_slots, source, created_at) VALUES (?, ?, ?, ?)",
    [e.lotId, e.slots, e.source, e.ts]
  );
}

for (const e of sampleGateEvents) {
  await db.query(
    `INSERT INTO gate_events (
      gate_id, actor, role, direction, scanner_id, granted, reason_code, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.gateId, e.actor, e.role, e.direction, e.scannerId, e.granted ? 1 : 0, e.reasonCode, e.source, e.ts]
  );
}

console.log(`Seeded ${sampleBookings.length} demo bookings, ${sampleEvents.length} slot events, and ${sampleGateEvents.length} gate events.`);
