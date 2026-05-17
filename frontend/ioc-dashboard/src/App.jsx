import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import LangSwitcher from "./components/LangSwitcher.jsx";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";
const COLORS = ["#2563eb", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

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

  const [issuedQr, setIssuedQr] = useState("");
  const [bookingId, setBookingId] = useState("BK-001");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [plateNumber, setPlateNumber] = useState("75A-12345");
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
      const [lotsRes, eventsRes, gateRes, bookingsRes, statsRes, revenueRes, utilRes, forecastRes] = await Promise.all([
        authFetch(`${API_BASE}/api/parking-lots`),
        authFetch(`${API_BASE}/api/admin/slot-events?limit=50`),
        authFetch(`${API_BASE}/api/admin/gate-events?limit=50`),
        authFetch(`${API_BASE}/api/admin/bookings?limit=50`),
        authFetch(`${API_BASE}/api/admin/stats`),
        authFetch(`${API_BASE}/api/admin/revenue-chart?days=7`),
        authFetch(`${API_BASE}/api/admin/lot-utilization`),
        authFetch(`${API_BASE}/api/admin/forecast`)
      ]);

      const lotsData = await lotsRes.json().catch(() => []);
      const eventsData = await eventsRes.json().catch(() => []);
      const gateData = await gateRes.json().catch(() => []);
      const bookingsData = await bookingsRes.json().catch(() => []);
      const statsData = await statsRes.json().catch(() => null);
      const revenueDataJson = await revenueRes.json().catch(() => []);
      const utilData = await utilRes.json().catch(() => []);
      const forecastData = await forecastRes.json().catch(() => []);

      setLots(Array.isArray(lotsData) ? lotsData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setGateEvents(Array.isArray(gateData) ? gateData : []);
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setStats(statsData);
      setRevenueData(Array.isArray(revenueDataJson) ? revenueDataJson : []);
      setLotUtilization(Array.isArray(utilData) ? utilData : []);
      setForecast(Array.isArray(forecastData) ? forecastData : []);

      if (Array.isArray(lotsData) && lotsData.length > 0 && !selectedLotId) {
        setSelectedLotId(lotsData[0].id);
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
            if (data.type === "dashboard_update" || data.type === "slot_update") {
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
    if (miniMap.current || !miniMapRef.current) return;
    miniMap.current = L.map(miniMapRef.current, { zoomControl: false, attributionControl: false })
      .setView([16.46, 107.58], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(miniMap.current);
    miniLayer.current = L.layerGroup().addTo(miniMap.current);
  }, [token]);

  useEffect(() => {
    if (!miniLayer.current) return;
    miniLayer.current.clearLayers();
    lots.forEach((lot) => {
      const color = lot.availableSlots > 0 ? "#22c55e" : "#ef4444";
      L.circleMarker([lot.lat, lot.lng], { radius: 6, fillColor: color, color: "#fff", weight: 1.5, fillOpacity: 0.9 })
        .bindTooltip(`${lot.name}: ${lot.availableSlots}/${lot.capacity}`, { direction: "top" })
        .addTo(miniLayer.current);
    });
  }, [lots]);

  const totalLots = lots.length;
  const totalCapacity = lots.reduce((sum, l) => sum + Number(l.capacity || 0), 0);
  const totalAvailable = lots.reduce((sum, l) => sum + Number(l.availableSlots || 0), 0);
  const occupancyRate = totalCapacity > 0 ? Math.round(((totalCapacity - totalAvailable) / totalCapacity) * 100) : 0;
  const atRiskLots = forecast.filter((f) => f.riskLevel !== "stable");

  const issueQr = async () => {
    setGateStatus(t("issuingQr"));
    const res = await authFetch(`${API_BASE}/api/qr/issue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId, plateNumber, lotId: selectedLotId, gateId: "HUE_GATE_1" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setGateStatus(`Lỗi: ${data?.message || res.statusText}`); return; }
    setIssuedQr(data.qrToken || "");
    setScanToken(data.qrToken || "");
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
  const pieData = lots.map((l) => ({ name: l.name, value: Number(l.capacity || 0) - Number(l.availableSlots || 0) }));

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
              <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="admin@hue.vn" required autoFocus />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••" required />
            </div>
            <button type="submit" className="btn btn-primary login-btn">Login</button>
          </form>
          <p className="login-hint">admin@hue.vn / 123456</p>
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
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {pieData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
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
          <div className="chart-row">
            <div className="chart-card">
              <h3>{t("qrIssueTitle")}</h3>
              <div className="form-group">
                <label>{t("selectLot")}</label>
                <select value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)}>
                  {lots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.id})</option>)}
                </select>
              </div>
              <div className="form-group"><label>{t("labelBookingId")}</label><input value={bookingId} onChange={(e) => setBookingId(e.target.value)} /></div>
              <div className="form-group"><label>{t("labelPlateNumber")}</label><input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} /></div>
              <button className="btn btn-primary btn-block" onClick={issueQr}>{t("btnIssueQr")}</button>
              <textarea value={issuedQr} readOnly rows={5} className="qr-textarea" placeholder={t("qrPlaceholder")} />
              {issuedQr && (
                <div className="qr-display">
                  <p>{t("qrLabel")}</p>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(issuedQr)}`} alt="QR Code" className="qr-img" />
                </div>
              )}
            </div>
            <div className="chart-card">
              <h3>{t("gateScannerTitle")}</h3>
              <textarea value={scanToken} onChange={(e) => setScanToken(e.target.value)} rows={5} className="qr-textarea" placeholder={t("scanPlaceholder")} />
              <button className="btn btn-success btn-block" onClick={scanQr}>{t("btnScanQr")}</button>
              <div className="gate-result">{gateStatus || t("scanReady")}</div>
              <div className="gate-events">
                <h4>{t("gateEvents")} ({gateEvents.length})</h4>
                <div className="event-list">
                  {gateEvents.slice(0, 15).map((e, i) => (
                    <div key={`${e.ts}-${i}`} className={`event-item ${e.granted ? "granted" : "denied"}`}>
                      <div><b>{e.granted ? t("granted") : t("denied")}</b> | {e.gateId} | {e.actor}</div>
                      <div className="event-meta">{formatDate(e.ts, i18n.language)} | {e.role} | {e.direction}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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
