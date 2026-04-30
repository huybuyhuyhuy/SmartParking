import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

const API = "http://localhost:3002";

export default function App() {
  const [lots, setLots] = useState([]);
  const [evOnly, setEvOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState(5);
  const [qrData, setQrData] = useState(null); // For QR display
  const [timeLeft, setTimeLeft] = useState(0);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/v1/nearby?lat=-6.204&lng=106.845&radius=5000&evOnly=${evOnly}&maxPrice=${maxPrice}`)
      .then((r) => r.json())
      .then(setLots)
      .catch(() => setLots([]));
  }, [evOnly, maxPrice]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || "";
    mapInstance.current = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [106.845, -6.204],
      zoom: 13
    });
  }, []);

  useEffect(() => {
    if (qrData?.expiresAt) {
      const interval = setInterval(() => {
        const now = Date.now();
        const expires = new Date(qrData.expiresAt).getTime();
        const left = Math.max(0, Math.floor((expires - now) / 1000));
        setTimeLeft(left);
        if (left === 0) clearInterval(interval);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [qrData]);

  const available = useMemo(() => lots.reduce((sum, l) => sum + l.availableSlots, 0), [lots]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold">Smart Parking - User App</h1>
      <div className="mt-4 flex gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={evOnly} onChange={(e) => setEvOnly(e.target.checked)} />
          EV only
        </label>
        <label className="flex items-center gap-2">
          Max price:
          <input
            className="px-2 py-1 text-black rounded"
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="mt-4 text-sm text-slate-300">Total available nearby: {available}</div>
      <button
        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
        onClick={async () => {
          // Simulate getting QR for bookingId 1
          const res = await fetch(`${API}/api/qr/issue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: 1, direction: 'IN' })
          });
          const data = await res.json();
          if (res.ok) setQrData(data);
        }}
      >
        Get QR Code (Test)
      </button>
      <div ref={mapRef} className="mt-4 h-72 rounded border border-slate-800" />
      <div className="mt-4 grid gap-3">
        {lots.map((lot) => (
          <div key={lot.id} className="rounded border border-slate-700 p-3">
            <div className="font-semibold">{lot.name}</div>
            <div className="text-sm text-slate-300">
              EV: {String(lot.evSupported)} | ${lot.pricePerHour}/h | {lot.availableSlots}/{lot.totalSlots} slots
            </div>
          </div>
        ))}
      </div>

      {qrData && (
        <div className="mt-6 rounded border border-slate-700 p-4">
          <h2 className="text-xl font-bold">Your QR Code</h2>
          <div className="mt-2">
            <img src={qrData.qrDataUrl} alt="QR Code" className="w-48 h-48" />
          </div>
          <div className="mt-2 text-sm">
            <div>Direction: {qrData.direction}</div>
            <div>Expires in: {Math.floor(timeLeft / 3600)}h {Math.floor((timeLeft % 3600) / 60)}m {timeLeft % 60}s</div>
            {timeLeft === 0 && <div className="text-red-500">QR Expired!</div>}
          </div>
        </div>
      )}
    </div>
  );
}
