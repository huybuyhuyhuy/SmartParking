import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import LangSwitcher from "./components/LangSwitcher.jsx";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";
const SHOW_DEMO_HINTS = import.meta.env.DEV && import.meta.env.VITE_SHOW_DEMO_HINTS !== "false";
const formatCurrency = (n, locale) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "VND", minimumFractionDigits: 0 }).format(n || 0);

const formatDate = (d, locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));

const formatTime = (d, locale) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(d));

const formatDateOnly = (d, locale) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(new Date(d));

const paymentStatusKey = (s) =>
  s === "PAID" ? "statusPaid" : s === "PENDING" ? "statusPending" : "statusFailed";

export default function App() {
  const { t, i18n } = useTranslation();

  const [lots, setLots] = useState([]);
  const [events, setEvents] = useState([]);
  const [gateEvents, setGateEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [lotUtilization, setLotUtilization] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [productFunnel, setProductFunnel] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("-");
  const [activeTab, setActiveTab] = useState("overview");
  const [lotFilter, setLotFilter] = useState(null); // { id, name } — filter bookings by lot

  // Auth state
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(null);

  const [entryQr, setEntryQr] = useState("");
  const [exitQr, setExitQr] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [selectedSupportPlate, setSelectedSupportPlate] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [scanToken, setScanToken] = useState("");
  const [gateStatus, setGateStatus] = useState("");

  const miniMapRef = useRef(null);
  const miniMap = useRef(null);
  const miniLayer = useRef(null);

  const [alerts, setAlerts] = useState([]);

  const authFetch = useCallback((url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opts, headers });
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.message || "Login failed"); return; }
      localStorage.setItem("sp_token", data.token);
      localStorage.setItem("sp_user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
    } catch (e) {
      setLoginError(e.message || "Network error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("sp_token");
    localStorage.removeItem("sp_user");
    setToken(null);
    setUser(null);
    setStats(null);
    setLots([]);
    setBookings([]);
    setEvents([]);
    setGateEvents([]);
    setRevenueData([]);
    setLotUtilization([]);
    setForecast([]);
    setProductFunnel(null);
  };

  useEffect(() => {
    document.title = t("appTitle");
  }, [t]);

  // Auth check on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("sp_token");
    const savedUser = localStorage.getItem("sp_user");
    if (!savedToken || !savedUser) { setAuthLoading(false); return; }
    fetch(`${API_BASE}/api/auth/profile`, {
      headers: { "Authorization": `Bearer ${savedToken}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error("invalid_token");
        return res.json();
      })
      .then((u) => {
        setToken(savedToken);
        setUser(u);
        setAuthLoading(false);
      })
      .catch(() => {
        localStorage.removeItem("sp_token");
        localStorage.removeItem("sp_user");
        setAuthLoading(false);
      });
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [lotsRes, eventsRes, gateRes, bookingsRes, statsRes, revenueRes, utilRes, forecastRes, funnelRes] = await Promise.all([
        authFetch(`${API_BASE}/api/parking-lots`),
        authFetch(`${API_BASE}/api/admin/slot-events?limit=50`),
        authFetch(`${API_BASE}/api/admin/gate-events?limit=50`),
        authFetch(`${API_BASE}/api/admin/bookings?limit=50`),
        authFetch(`${API_BASE}/api/admin/stats`),
        authFetch(`${API_BASE}/api/admin/revenue-chart?days=7`),
        authFetch(`${API_BASE}/api/admin/lot-utilization`),
        authFetch(`${API_BASE}/api/admin/forecast`),
        authFetch(`${API_BASE}/api/admin/product-funnel`)
      ]);

      const lotsData = await lotsRes.json().catch(() => []);
      const eventsData = await eventsRes.json().catch(() => []);
      const gateData = await gateRes.json().catch(() => []);
      const bookingsData = await bookingsRes.json().catch(() => []);
      const statsData = await statsRes.json().catch(() => null);
      const revenueDataJson = await revenueRes.json().catch(() => []);
      const utilData = await utilRes.json().catch(() => []);
      const forecastData = await forecastRes.json().catch(() => []);
      const funnelData = await funnelRes.json().catch(() => null);

      setLots(Array.isArray(lotsData) ? lotsData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setGateEvents(Array.isArray(gateData) ? gateData : []);
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setStats(statsData);
      setRevenueData(Array.isArray(revenueDataJson) ? revenueDataJson : []);
      setLotUtilization(Array.isArray(utilData) ? utilData : []);
      setForecast(Array.isArray(forecastData) ? forecastData : []);
      setProductFunnel(funnelData && typeof funnelData === "object" ? funnelData : null);

      if (Array.isArray(lotsData) && lotsData.length > 0 && !selectedLotId) {
        setSelectedLotId(lotsData[0].id);
      }

      if (selectedLotId) {
        const activeBookingsAtLot = Array.isArray(bookingsData)
          ? bookingsData.filter((b) => String(b.parking_lot_id) === String(selectedLotId) && b.payment_status === "PAID" && !b.ended_at)
          : [];
        const firstActive = activeBookingsAtLot[0] || null;
        setSelectedSupportPlate(firstActive?.plate_number || "");
        setBookingId(firstActive?.id ? String(firstActive.id) : "");
        setPlateNumber(firstActive?.plate_number || "");
      }

      const newAlerts = [];
      lotsData.forEach((lot) => {
        const pct = lot.capacity > 0 ? ((lot.capacity - lot.availableSlots) / lot.capacity) * 100 : 0;
        if (pct >= 90) newAlerts.push({ type: "critical", msg: t("alertNearlyFull", { name: lot.name, pct: Math.round(pct) }) });
        else if (pct >= 70) newAlerts.push({ type: "warning", msg: t("alertBusy", { name: lot.name, pct: Math.round(pct) }) });
      });
      setAlerts(newAlerts);

      setLastUpdated(new Date().toLocaleTimeString(i18n.language === "vi" ? "vi-VN" : "en-US"));
    } catch (_e) {}
  }, [selectedLotId, t, i18n.language, token, authFetch]);

  useEffect(() => {
    if (!token) return;
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  // WebSocket for real-time dashboard stats
  useEffect(() => {
    const wsUrl = API_BASE.replace(/^http/, "ws");
    let ws = null;
    let reconnectTimer = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log("[dashboard] WS connected");
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (
              data.type === "dashboard_update" ||
              data.type === "slot_update" ||
              data.type === "parking_lot_updated" ||
              data.type === "parking_lot_deleted"
            ) {
              load();
            }
          } catch (_e) {}
        };
        ws.onclose = () => {
          reconnectTimer = setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch (_e) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    }

    connect();
    return () => {
      if (ws) { ws.onclose = null; ws.close(); }
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [load]);

  useEffect(() => {
    if (!token || activeTab !== "overview" || !miniMapRef.current) return undefined;

    if (!miniMap.current) {
      miniMap.current = L.map(miniMapRef.current, { zoomControl: false, attributionControl: false })
        .setView([16.4637, 107.5909], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        crossOrigin: true
      }).addTo(miniMap.current);
      miniLayer.current = L.layerGroup().addTo(miniMap.current);
    }

    const firstPaint = requestAnimationFrame(() => miniMap.current?.invalidateSize());
    const settleTimer = setTimeout(() => miniMap.current?.invalidateSize(), 180);

    return () => {
      cancelAnimationFrame(firstPaint);
      clearTimeout(settleTimer);
      if (miniMap.current) {
        miniMap.current.remove();
        miniMap.current = null;
        miniLayer.current = null;
      }
    };
  }, [token, activeTab]);

  useEffect(() => {
    if (activeTab !== "overview" || !miniLayer.current) return;
    miniLayer.current.clearLayers();

    const validLots = lots.filter((lot) => Number.isFinite(Number(lot.lat)) && Number.isFinite(Number(lot.lng)));
    validLots.forEach((lot) => {
      const lat = Number(lot.lat);
      const lng = Number(lot.lng);
      const color = Number(lot.availableSlots || 0) > 0 ? "#22c55e" : "#ef4444";
      L.circleMarker([lat, lng], { radius: 6, fillColor: color, color: "#fff", weight: 1.5, fillOpacity: 0.9 })
        .bindTooltip(`${lot.name}: ${lot.availableSlots}/${lot.capacity}`, { direction: "top" })
        .addTo(miniLayer.current);
    });

    if (validLots.length > 0) {
      const bounds = L.latLngBounds(validLots.map((lot) => [Number(lot.lat), Number(lot.lng)]));
      miniMap.current?.fitBounds(bounds.pad(0.2));
    } else {
      miniMap.current?.setView([16.4637, 107.5909], 13);
    }

    const timer = setTimeout(() => {
      miniMap.current?.invalidateSize();
    }, 0);
    return () => clearTimeout(timer);
  }, [lots, activeTab]);

  useEffect(() => {
    if (!miniMap.current) return;
    const timer = setTimeout(() => miniMap.current?.invalidateSize(), 0);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const totalLots = lots.length;
  const totalCapacity = lots.reduce((sum, l) => sum + Number(l.capacity || 0), 0);
  const totalAvailable = lots.reduce((sum, l) => sum + Number(l.availableSlots || 0), 0);
  const occupancyRate = totalCapacity > 0 ? Math.round(((totalCapacity - totalAvailable) / totalCapacity) * 100) : 0;
  const atRiskLots = forecast.filter((f) => f.riskLevel !== "stable");
  const funnelCounts = productFunnel?.counts || {};
  const funnelRates = productFunnel?.rates || {};
  const formatRate = (value) => value == null ? "-" : `${Math.round(value * 100)}%`;
  const funnelSteps = [
    { key: "nearby_search_performed", label: t("funnelSearches"), value: funnelCounts.nearby_search_performed || 0 },
    { key: "booking_created", label: t("funnelBookings"), value: funnelCounts.booking_created || 0, rate: funnelRates.bookingCreationRate },
    { key: "payment_succeeded", label: t("funnelPayments"), value: funnelCounts.payment_succeeded || 0, rate: funnelRates.paymentSuccessRate },
    { key: "gate_granted", label: t("funnelEntries"), value: funnelCounts.gate_granted || 0, rate: funnelRates.gateGrantRate },
    { key: "checkout_completed", label: t("funnelCompletions"), value: funnelCounts.checkout_completed || 0, rate: funnelRates.sessionCompletionRate }
  ];
  const totalGateScans = gateEvents.length;
  const grantedGateScans = gateEvents.filter((e) => e.granted).length;
  const deniedGateScans = totalGateScans - grantedGateScans;
  const gateGrantRate = totalGateScans > 0 ? Math.round((grantedGateScans / totalGateScans) * 100) : 0;
  const gateInCount = gateEvents.filter((e) => e.granted && e.direction === "IN").length;
  const gateOutCount = gateEvents.filter((e) => e.granted && e.direction === "OUT").length;
  const gateMonitors = Object.values(gateEvents.reduce((acc, event) => {
    const key = `${event.gateId || "UNKNOWN"}::${event.scannerId || "UNKNOWN"}`;
    if (!acc[key] || new Date(event.ts) > new Date(acc[key].lastSeen)) {
      acc[key] = {
        gateId: event.gateId || "UNKNOWN",
        scannerId: event.scannerId || "UNKNOWN",
        lastSeen: event.ts,
        lastGranted: event.granted,
        lastDirection: event.direction || "UNKNOWN"
      };
    }
    return acc;
  }, {})).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  const denialReasons = Object.values(gateEvents.filter((e) => !e.granted).reduce((acc, event) => {
    const code = event.reasonCode || "UNKNOWN";
    acc[code] = acc[code] || { code, count: 0 };
    acc[code].count += 1;
    return acc;
  }, {})).sort((a, b) => b.count - a.count);
  const gateReasonLabel = (code) => t(`gateReason_${code || "UNKNOWN"}`);
  const actorLabel = (actor) => actor?.startsWith("booking:") ? actor.slice("booking:".length) : actor;
  const isRecentGateActivity = (ts) => Date.now() - new Date(ts).getTime() <= 5 * 60 * 1000;

  const issueEntryQr = async () => {
    const activeBooking = bookings.find((b) => String(b.parking_lot_id) === String(selectedLotId) && b.payment_status === "PAID" && !b.ended_at);
    const actualBookingId = bookingId || activeBooking?.id;
    const actualPlateNumber = plateNumber || selectedSupportPlate || activeBooking?.plate_number;

    if (!actualBookingId) {
      setGateStatus(t("noActiveBookingForLot"));
      return;
    }
    if (!actualPlateNumber) {
      setGateStatus(t("noPlateForSelectedBooking"));
      return;
    }

    setGateStatus(t("issuingQr"));
    const res = await authFetch(`${API_BASE}/api/qr/issue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId: actualBookingId, plateNumber: actualPlateNumber, lotId: selectedLotId, gateId: "HUE_GATE_1", direction: "IN" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setGateStatus(`Lỗi: ${data?.message || res.statusText}`); return; }
    setEntryQr(data.qrToken || data.entryQrToken || "");
    setExitQr(data.exitQrToken || "");
    setScanToken(data.qrToken || data.entryQrToken || "");
    const dt = new Date(data.timestamp);
    setGateStatus(t("bookingSuccessGate", { date: formatDateOnly(dt, i18n.language), time: formatTime(dt, i18n.language), id: data.bookingId, plate: data.plateNumber }));
    await load();
  };

  const issueExitQr = async () => {
    const activeBooking = bookings.find((b) => String(b.parking_lot_id) === String(selectedLotId) && b.payment_status === "PAID" && !b.ended_at);
    const actualBookingId = bookingId || activeBooking?.id;
    const actualPlateNumber = plateNumber || selectedSupportPlate || activeBooking?.plate_number;

    if (!actualBookingId) {
      setGateStatus(t("noActiveBookingForLot"));
      return;
    }
    if (!actualPlateNumber) {
      setGateStatus(t("noPlateForSelectedBooking"));
      return;
    }

    setGateStatus(t("issuingQr"));
    const res = await authFetch(`${API_BASE}/api/qr/issue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId: actualBookingId, plateNumber: actualPlateNumber, lotId: selectedLotId, gateId: "HUE_GATE_1", direction: "OUT" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setGateStatus(`Lỗi: ${data?.message || res.statusText}`); return; }
    setEntryQr(data.entryQrToken || "");
    setExitQr(data.exitQrToken || data.qrToken || "");
    setScanToken(data.exitQrToken || data.qrToken || "");
    const dt = new Date(data.timestamp);
    setGateStatus(t("bookingSuccessGate", { date: formatDateOnly(dt, i18n.language), time: formatTime(dt, i18n.language), id: data.bookingId, plate: data.plateNumber }));
    await load();
  };

  const scanQr = async () => {
    setGateStatus(t("scanning"));
    const res = await authFetch(`${API_BASE}/api/gate/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qrToken: scanToken, scannerId: "IOC_SCANNER_01" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setGateStatus(`Từ chối: ${data?.message || res.statusText}`); await load(); return; }
    const dt = new Date(data.ts);
    setGateStatus(t("gateOpenSuccess", { date: formatDateOnly(dt, i18n.language), time: formatTime(dt, i18n.language), id: data.bookingId, plate: data.plateNumber, gate: data.gateId }));
    await load();
  };

  const exportCSV = (type) => {
    let csv = "";
    if (type === "bookings") {
      csv = t("csvBookingsHeader") + "\n";
      bookings.forEach((b) => { csv += `${b.id},${b.user_id},${b.lot_name},${b.plate_number},${b.amount},${b.payment_status},${b.created_at}\n`; });
    } else if (type === "lots") {
      csv = t("csvLotsHeader") + "\n";
      lots.forEach((l) => { csv += `${l.id},${l.name},${l.capacity},${l.availableSlots},${l.pricePerHour}\n`; });
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `smart-parking-${type}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleLocationClick = (lotId, lotName) => {
    setLotFilter({ id: lotId, name: lotName });
    setActiveTab("bookings");
  };

  const clearLotFilter = () => {
    setLotFilter(null);
  };

  // Filtered bookings: active vehicles at selected lot, or all bookings
  const filteredBookings = lotFilter
    ? bookings.filter((b) =>
        b.parking_lot_id === lotFilter.id &&
        b.payment_status === "PAID" &&
        !b.ended_at
      )
    : bookings;

  const tabMap = { overview: "tabOverview", lots: "tabLots", bookings: "tabBookings", gate: "tabGate" };
  const capacityData = lots
    .map((l) => ({
      name: l.name,
      capacity: Number(l.capacity || 0),
      available: Number(l.availableSlots || 0),
      occupied: Math.max(Number(l.capacity || 0) - Number(l.availableSlots || 0), 0)
    }))
    .sort((a, b) => b.capacity - a.capacity);

  if (authLoading) return <div className="login-page"><div className="login-card"><p style={{ textAlign: "center" }}>Loading...</p></div></div>;

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <h1>{t("appTitle")}</h1>
            <p>Admin login</p>
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            {loginError && <div className="login-error">{loginError}</div>}
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="name@example.com" required autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••" required />
            </div>
            <button type="submit" className="btn btn-primary login-btn">Login</button>
          </form>
          {SHOW_DEMO_HINTS && <p className="login-hint">admin@hue.vn / 123456</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="topbar">
        <div className="topbar-left">
          <h1>{t("header")}</h1>
          <span className="update-time">{t("updatedAt")}: {lastUpdated}</span>
        </div>
        <div className="topbar-right">
          <div className="tab-buttons">
            {["overview", "lots", "bookings", "gate"].map((tk) => (
              <button key={tk} className={`tab-btn ${activeTab === tk ? "active" : ""}`} onClick={() => setActiveTab(tk)}>
                {t(tabMap[tk])}
              </button>
            ))}
          </div>
          <div className="export-btns">
            <button className="btn btn-sm btn-outline-dark" onClick={() => exportCSV("bookings")}>{t("exportBookingsCsv")}</button>
            <button className="btn btn-sm btn-outline-dark" onClick={() => exportCSV("lots")}>{t("exportLotsCsv")}</button>
            <LangSwitcher />
            <span className="admin-badge">{user?.fullName || user?.email || ""}</span>
            <button className="btn btn-sm btn-outline-dark" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alerts-bar">
          {alerts.map((a, i) => (
            <div key={i} className={`alert-badge ${a.type}`}>{a.type === "critical" ? t("alertCritical") : t("alertWarning")}: {a.msg}</div>
          ))}
        </div>
      )}

      {activeTab === "overview" && (
        <>
          <div className="stat-grid">
            <StatCard title={t("statTotalLots")} value={totalLots} icon="P" color="#2563eb" />
            <StatCard title={t("statTotalCapacity")} value={totalCapacity} icon="S" color="#7c3aed" />
            <StatCard title={t("statAvailable")} value={totalAvailable} icon="C" color="#22c55e" />
            <StatCard title={t("statOccupancyRate")} value={`${occupancyRate}%`} icon="%" color={occupancyRate > 80 ? "#ef4444" : "#f59e0b"} />
            <StatCard title={t("statTodayRevenue")} value={formatCurrency(stats?.todayRevenue || 0, i18n.language)} icon="$" color="#059669" />
            <StatCard title={t("statRevenueMotorbike")} value={formatCurrency(stats?.todayRevenueMotorbike || 0, i18n.language)} icon="🏍" color="#f59e0b" />
            <StatCard title={t("statRevenueCar")} value={formatCurrency(stats?.todayRevenueCar || 0, i18n.language)} icon="🚗" color="#2563eb" />
            <StatCard title={t("statTodayBookings")} value={stats?.todayBookings || 0} icon="B" color="#0891b2" />
            <StatCard title={t("statPaidBookings")} value={stats?.paidBookings || 0} icon="P" color="#2563eb" />
            <StatCard title={t("statActiveSessions")} value={stats?.activeSessions || 0} icon="A" color="#d97706" />
            <StatCard title={t("statAtRiskLots")} value={atRiskLots.length} icon="!" color={atRiskLots.length > 0 ? "#dc2626" : "#16a34a"} />
          </div>

          <div className="funnel-section">
            <div className="forecast-header">
              <h3>{t("funnelTitle")}</h3>
              <span>{t("funnelSubtitle")}</span>
            </div>
            <div className="funnel-grid">
              {funnelSteps.map((step) => (
                <div key={step.key} className="funnel-card">
                  <div className="funnel-label">{step.label}</div>
                  <div className="funnel-value">{step.value}</div>
                  <div className="funnel-rate">
                    {step.rate == null ? t("funnelBaseline") : t("funnelRate", { rate: formatRate(step.rate) })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="forecast-section">
            <div className="forecast-header">
              <h3>{t("forecastTitle")}</h3>
              <span>{t("forecastSubtitle")}</span>
            </div>
            <div className="forecast-grid">
              {forecast.map((item) => (
                <div key={item.id} className={`forecast-card ${item.riskLevel}`}>
                  <div className="forecast-card-head">
                    <b>{item.name}</b>
                    <span className="forecast-badge">{t(`forecast_${item.riskLevel}`)}</span>
                  </div>
                  <div className="forecast-metrics">
                    <span>{t("forecastNow")}: <b>{item.currentAvailable}</b></span>
                    <span>30m: <b>{item.predictedAvailable30m}</b></span>
                    <span>60m: <b>{item.predictedAvailable60m}</b></span>
                  </div>
                  <div className="forecast-note">
                    {t("forecastOccupancy", { pct: item.occupancyPct })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-row">
            <div className="chart-card">
              <h3>{t("chartRevenue7Days")}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(v, i18n.language)} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} name={t("chartRevenue")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>{t("chartCapacityDist")}</h3>
              <div className="capacity-chart-scroll">
                <ResponsiveContainer width="100%" height={Math.max(260, capacityData.length * 34)}>
                  <BarChart
                    data={capacityData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={210}
                      interval={0}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => String(value).length > 30 ? `${String(value).slice(0, 30)}…` : value}
                    />
                    <Tooltip
                      formatter={(value, name, item) => [
                        Number(value).toLocaleString(i18n.language),
                        name === "capacity" ? t("thCapacity") : name
                      ]}
                      labelFormatter={(label) => label}
                    />
                    <Bar dataKey="capacity" fill="#2563eb" radius={[0, 5, 5, 0]} name={t("thCapacity")} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="chart-row">
            <div className="chart-card">
              <h3>{t("chartLotMap")}</h3>
              <div ref={miniMapRef} className="mini-map" />
            </div>
            <div className="chart-card">
              <h3>{t("chartSlotTimeline")}</h3>
              <div className="event-list">
                {events.slice(0, 15).map((e, idx) => (
                  <div key={`${e.lotId}-${e.ts}-${idx}`} className="event-item">
                    <div className="event-main"><b>{e.lotId}</b> &rarr; {e.availableSlots} slots</div>
                    <div className="event-meta">{formatDate(e.ts, i18n.language)} | {e.source}</div>
                  </div>
                ))}
                {events.length === 0 && <div className="empty">{t("emptyEvents")}</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "lots" && (
        <div className="table-section">
          <h2>{t("lotListHeader")}</h2>
          <table className="data-table">
            <thead><tr><th>{t("thId")}</th><th>{t("thLotName")}</th><th>{t("thCapacity")}</th><th>{t("thAvailable")}</th><th>{t("thOccupancy")}</th><th>{t("thPrice")}</th><th>{t("thEv")}</th><th>{t("thActions")}</th></tr></thead>
            <tbody>
              {lots.map((l) => {
                const pct = l.capacity > 0 ? Math.round(((l.capacity - l.availableSlots) / l.capacity) * 100) : 0;
                const activeAtLot = bookings.filter((b) => b.parking_lot_id === l.id && b.payment_status === "PAID" && !b.ended_at).length;
                return (
                  <tr key={l.id} className={`lot-row-clickable ${pct >= 90 ? "row-critical" : pct >= 70 ? "row-warning" : ""}`}>
                    <td>{l.id}</td><td><b>{l.name}</b></td><td>{l.capacity}</td><td>{l.availableSlots}</td>
                    <td><div className="pct-bar"><div className={`pct-fill ${pct >= 90 ? "critical" : pct >= 70 ? "warning" : "ok"}`} style={{ width: `${pct}%` }} />{pct}%</div></td>
                    <td>{formatCurrency(l.pricePerHour, i18n.language)}</td>
                    <td>{l.evSupported ? t("yes") : t("no")}</td>
                    <td>
                      <button className="btn btn-sm btn-primary"
                        onClick={() => handleLocationClick(l.id, l.name)}
                        title={t("viewVehiclesAtLot", { name: l.name })}>
                        {t("btnViewVehicles")} ({activeAtLot})
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "bookings" && (
        <div className="table-section">
          <div className="table-section-header">
            <h2>
              {lotFilter
                ? t("bookingListFiltered", { name: lotFilter.name, count: filteredBookings.length })
                : t("bookingListHeader")}
            </h2>
            {lotFilter && (
              <button className="btn btn-sm btn-outline-dark" onClick={clearLotFilter}>
                {t("btnClearFilter")}
              </button>
            )}
          </div>
          <table className="data-table">
            <thead><tr><th>{t("thId")}</th><th>{t("thLotName")}</th><th>{t("thPlateNumber")}</th><th>{t("thVehicleType")}</th><th>{t("thAmount")}</th><th>{t("thStatus")}</th><th>{t("thProvider")}</th><th>{t("thCreatedAt")}</th></tr></thead>
            <tbody>
              {filteredBookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td><td>{b.lot_name}</td><td><b>{b.plate_number}</b></td>
                  <td><span className={`vehicle-type-badge ${b.vehicle_type === "MOTORBIKE" ? "moto" : "car"}`}>
                    {b.vehicle_type === "MOTORBIKE" ? t("vehicleTypeMotorbike") : t("vehicleTypeCar")}
                  </span></td>
                  <td>{formatCurrency(b.amount, i18n.language)}</td>
                  <td><span className={`pay-badge ${b.payment_status}`}>{t(paymentStatusKey(b.payment_status))}</span></td>
                  <td>{b.payment_provider || "-"}</td>
                  <td>{formatDate(b.created_at, i18n.language)}</td>
                </tr>
              ))}
              {filteredBookings.length === 0 && <tr><td colSpan={8} className="empty">
                {lotFilter ? t("noVehiclesAtLot") : t("emptyBookings")}
              </td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "gate" && (
        <div className="gate-section">
          <div className="gate-summary-grid">
            <StatCard title={t("gateTotalScans")} value={totalGateScans} icon="S" color="#2563eb" />
            <StatCard title={t("gateGrantRate")} value={`${gateGrantRate}%`} icon="%" color="#16a34a" />
            <StatCard title={t("gateDeniedScans")} value={deniedGateScans} icon="!" color="#dc2626" />
            <StatCard title={t("gateInCount")} value={gateInCount} icon="↓" color="#0891b2" />
            <StatCard title={t("gateOutCount")} value={gateOutCount} icon="↑" color="#7c3aed" />
          </div>

          <div className="chart-row">
            <div className="chart-card">
              <h3>{t("gateMonitorTitle")}</h3>
              <div className="gate-monitor-list">
                {gateMonitors.map((gate) => (
                  <div key={`${gate.gateId}-${gate.scannerId}`} className="gate-monitor-card">
                    <div>
                      <b>{gate.gateId}</b>
                      <div className="event-meta">{gate.scannerId}</div>
                    </div>
                    <div className={`gate-live-badge ${isRecentGateActivity(gate.lastSeen) ? "recent" : "idle"}`}>
                      {isRecentGateActivity(gate.lastSeen) ? t("gateStatusRecent") : t("gateStatusIdle")}
                    </div>
                    <div className="gate-monitor-meta">
                      <span>{t("gateLastSeen")}: {formatDate(gate.lastSeen, i18n.language)}</span>
                      <span>{t("gateLastAction")}: {gate.lastGranted ? t("granted") : t("denied")} · {gate.lastDirection}</span>
                    </div>
                  </div>
                ))}
                {gateMonitors.length === 0 && <div className="empty">{t("gateNoActivity")}</div>}
              </div>
            </div>
            <div className="chart-card">
              <h3>{t("gateDenialReasons")}</h3>
              <div className="gate-reason-list">
                {denialReasons.map((reason) => (
                  <div key={reason.code} className="gate-reason-row">
                    <span>{gateReasonLabel(reason.code)}</span>
                    <b>{reason.count}</b>
                  </div>
                ))}
                {denialReasons.length === 0 && <div className="empty">{t("gateNoDenials")}</div>}
              </div>
            </div>
          </div>

          <div className="chart-card gate-activity-card">
            <h3>{t("gateRecentActivity")}</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("gateThTime")}</th>
                  <th>{t("gateThStatus")}</th>
                  <th>{t("gateThGate")}</th>
                  <th>{t("gateThScanner")}</th>
                  <th>{t("gateThBooking")}</th>
                  <th>{t("gateThDirection")}</th>
                  <th>{t("gateThSource")}</th>
                  <th>{t("gateThReason")}</th>
                </tr>
              </thead>
              <tbody>
                {gateEvents.slice(0, 15).map((e, i) => (
                  <tr key={`${e.ts}-${i}`}>
                    <td>{formatDate(e.ts, i18n.language)}</td>
                    <td><span className={`gate-status-pill ${e.granted ? "granted" : "denied"}`}>{e.granted ? t("granted") : t("denied")}</span></td>
                    <td>{e.gateId}</td>
                    <td>{e.scannerId}</td>
                    <td>{actorLabel(e.actor)}</td>
                    <td>{e.direction}</td>
                    <td>{e.source === "CHECKOUT" ? t("gateSourceCheckout") : t("gateSourceScanner")}</td>
                    <td>{e.granted ? "-" : gateReasonLabel(e.reasonCode)}</td>
                  </tr>
                ))}
                {gateEvents.length === 0 && <tr><td colSpan={8} className="empty">{t("gateNoActivity")}</td></tr>}
              </tbody>
            </table>
          </div>

          <details className="support-tools">
            <summary>{t("gateSupportTools")}</summary>
            <div className="chart-row support-tools-grid">
              <div className="chart-card">
                <h3>{t("qrIssueTitle")}</h3>
                <div className="form-group">
                  <label>{t("selectLot")}</label>
                  <select
                    value={selectedLotId}
                    onChange={(e) => {
                      const lotId = e.target.value;
                      setSelectedLotId(lotId);
                      const activeAtLot = bookings.filter((b) => String(b.parking_lot_id) === String(lotId) && b.payment_status === "PAID" && !b.ended_at);
                      const firstActive = activeAtLot[0] || null;
                      setBookingId(firstActive?.id ? String(firstActive.id) : "");
                      setSelectedSupportPlate(firstActive?.plate_number || "");
                      setPlateNumber(firstActive?.plate_number || "");
                    }}
                  >
                    {lots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.id})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t("labelPlateNumber")}</label>
                  <select
                    value={selectedSupportPlate}
                    onChange={(e) => {
                      const plate = e.target.value;
                      setSelectedSupportPlate(plate);
                      setPlateNumber(plate);
                      const matched = bookings.find((b) => String(b.parking_lot_id) === String(selectedLotId) && b.payment_status === "PAID" && !b.ended_at && String(b.plate_number).toUpperCase() === String(plate).toUpperCase());
                      setBookingId(matched?.id ? String(matched.id) : "");
                    }}
                  >
                    <option value="">{t("selectPlatePlaceholder")}</option>
                    {bookings
                      .filter((b) => String(b.parking_lot_id) === String(selectedLotId) && b.payment_status === "PAID" && !b.ended_at)
                      .map((b) => (
                        <option key={b.id} value={b.plate_number}>{b.plate_number} — BK#{b.id}</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t("labelBookingId")}</label>
                  <input value={bookingId} readOnly placeholder={t("bookingIdAutoFilled")} />
                </div>
                <div className="support-qr-actions">
                  <button type="button" className="btn btn-primary btn-block" onClick={issueEntryQr}>{t("btnIssueEntryQr")}</button>
                  <button type="button" className="btn btn-outline-dark btn-block" onClick={issueExitQr}>{t("btnIssueExitQr")}</button>
                </div>
                <div className="support-qr-stack">
                  <div className="support-qr-block">
                    <p className="support-qr-title">{t("qrEntryTitle")}</p>
                    <textarea value={entryQr} readOnly rows={4} className="qr-textarea" placeholder={t("qrPlaceholder")} />
                    {entryQr && <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(entryQr)}`} alt="Entry QR Code" className="qr-img" />}
                  </div>
                  <div className="support-qr-block">
                    <p className="support-qr-title">{t("qrExitTitle")}</p>
                    <textarea value={exitQr} readOnly rows={4} className="qr-textarea" placeholder={t("qrPlaceholder")} />
                    {exitQr && <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(exitQr)}`} alt="Exit QR Code" className="qr-img" />}
                  </div>
                </div>
              </div>
              <div className="chart-card">
                <h3>{t("gateScannerTitle")}</h3>
                <textarea value={scanToken} onChange={(e) => setScanToken(e.target.value)} rows={5} className="qr-textarea" placeholder={t("scanPlaceholder")} />
                <div className="support-qr-actions" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-success btn-block" onClick={scanQr}>{t("btnScanEntryQr")}</button>
                  <button type="button" className="btn btn-outline-dark btn-block" onClick={scanQr}>{t("btnScanExitQr")}</button>
                </div>
                <div className="gate-result">{gateStatus || t("scanReady")}</div>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color }}>{icon}</div>
      <div className="stat-info">
        <div className="stat-title">{title}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}
