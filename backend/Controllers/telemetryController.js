const telemetryEvents = [];
const MAX_TELEMETRY_EVENTS = 2000;

const FUNNEL_EVENTS = [
  "nearby_search_performed",
  "booking_created",
  "payment_initiated",
  "payment_succeeded",
  "gate_scanned",
  "gate_granted",
  "checkout_completed"
];

function sanitizeProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  );
}

export function recordTelemetryEvent(name, properties = {}) {
  const event = {
    name,
    ts: new Date().toISOString(),
    ...sanitizeProperties(properties)
  };
  telemetryEvents.unshift(event);
  if (telemetryEvents.length > MAX_TELEMETRY_EVENTS) {
    telemetryEvents.length = MAX_TELEMETRY_EVENTS;
  }
  return event;
}

export function getRecentTelemetryEvents(limit = 100) {
  const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), MAX_TELEMETRY_EVENTS);
  return telemetryEvents.slice(0, boundedLimit);
}

export function getTelemetryFunnelSnapshot() {
  const counts = Object.fromEntries(FUNNEL_EVENTS.map((name) => [name, 0]));
  for (const event of telemetryEvents) {
    if (event.name in counts) counts[event.name] += 1;
  }

  const rates = {
    bookingCreationRate: counts.nearby_search_performed > 0
      ? Number((counts.booking_created / counts.nearby_search_performed).toFixed(4))
      : null,
    paymentSuccessRate: counts.payment_initiated > 0
      ? Number((counts.payment_succeeded / counts.payment_initiated).toFixed(4))
      : null,
    gateGrantRate: counts.gate_scanned > 0
      ? Number((counts.gate_granted / counts.gate_scanned).toFixed(4))
      : null,
    sessionCompletionRate: counts.gate_granted > 0
      ? Number((counts.checkout_completed / counts.gate_granted).toFixed(4))
      : null
  };

  return {
    window: `latest_${telemetryEvents.length}_events`,
    counts,
    rates
  };
}

export async function getProductFunnel(_req, res) {
  return res.json(getTelemetryFunnelSnapshot());
}

export async function getTelemetryEvents(req, res) {
  return res.json(getRecentTelemetryEvents(req.query.limit));
}
