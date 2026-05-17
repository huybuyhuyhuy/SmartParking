import { WebSocketServer } from "ws";

let wss = null;

export function createWsServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    console.log(`[ws] Client connected (total: ${wss.clients.size})`);

    ws.on("close", () => {
      console.log(`[ws] Client disconnected (total: ${wss.clients.size})`);
    });

    ws.on("error", (err) => {
      console.error("[ws] Client error:", err.message);
    });
  });

  return wss;
}

export function broadcastSlotUpdate(lotId, availableSlots) {
  if (!wss) return;

  const message = JSON.stringify({
    type: "slot_update",
    lotId,
    availableSlots,
    ts: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try { client.send(message); } catch (_e) {}
    }
  });
}

export function broadcastDashboardUpdate(stats) {
  if (!wss) return;

  const message = JSON.stringify({
    type: "dashboard_update",
    ...stats,
    ts: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try { client.send(message); } catch (_e) {}
    }
  });
}
