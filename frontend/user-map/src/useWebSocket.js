import { useEffect, useRef, useCallback } from "react";

const MAX_RETRY_DELAY = 30000;

export default function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const retryCount = useRef(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:3002";
    const wsUrl = import.meta.env.VITE_WS_URL || apiBase.replace(/^http/, "ws");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      retryCount.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch (_e) {}
    };

    ws.onclose = () => {
      wsRef.current = null;
      const delay = Math.min(
        1000 * Math.pow(2, retryCount.current),
        MAX_RETRY_DELAY
      );
      retryCount.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);
}
