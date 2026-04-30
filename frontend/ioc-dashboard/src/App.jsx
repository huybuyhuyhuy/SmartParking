import { useEffect, useState, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";
const COLORS = ["#2563eb", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export default function App() {
  // Dashboard state
  const [lots, setLots] = useState([]);
  const [events, setEvents] = useState([]);
  const [gateEvents, setGateEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [occupancyData, setOccupancyData] = useState([]);
  const [lotUtilization, setLotUtilization] = useState([]);
  const [lastUpdated, setLastUpdated] = useState("-");
  const [activeTab, setActiveTab] = useState("overview");

  // QR state
  const [issuedQr, setIssuedQr] = useState("");
  const [bookingId, setBookingId] = useState("BK-001");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [plateNumber, setPlateNumber] = useState("75A-12345");
  const [scanToken, setScanToken] = useState("");
  const [gateStatus, setGateStatus] = useState("");

  // Mini map
  const miniMapRef = useRef(null);
  const miniMap = useRef(null);
  const miniLayer = useRef(null);

  // Alerts
  const [alerts, setAlerts] = useState([]);

  const load = useCallback(async () => {
    try {
      const [lotsRes, eventsRes, gateRes, bookingsRes, statsRes, revenueRes, utilRes] = await Promise.all([
        fetch(`${API_BASE}/api/parking-lots`),
        fetch(`${API_BASE}/api/admin/slot-events?limit=50`),
        fetch(`${API_BASE}/api/admin/gate-events?limit=50`),
        fetch(`${API_BASE}/api/admin/bookings?limit=50`),
        fetch(`${API_BASE}/api/admin/stats`),
        fetch(`${API_BASE}/api/admin/revenue-chart?days=7`),
        fetch(`${API_BASE}/api/admin/lot-utilization`)
      ]);

      const lotsData = await lotsRes.json().catch(() => []);
      const eventsData = await eventsRes.json().catch(() => []);
      const gateData = await gateRes.json().catch(() => []);
      const bookingsData = await bookingsRes.json().catch(() => []);
      const statsData = await statsRes.json().catch(() => null);
      const revenueDataJson = await revenueRes.json().catch(() => []);
      const utilData = await utilRes.json().catch(() => []);

      setLots(Array.isArray(lotsData) ? lotsData : []);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setGateEvents(Array.isArray(gateData) ? gateData : []);
      setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      setStats(statsData);
      setRevenueData(Array.isArray(revenueDataJson) ? revenueDataJson : []);
      setLotUtilization(Array.isArray(utilData) ? utilData : []);

      if (Array.isArray(lotsData) && lotsData.length > 0 && !selectedLotId) {
        setSelectedLotId(lotsData[0].id);
      }

      // Generate alerts
      const newAlerts = [];
      lotsData.forEach((lot) => {
        const pct = lot.capacity > 0 ? ((lot.capacity - lot.availableSlots) / lot.capacity) * 100 : 0;
        if (pct >= 90) newAlerts.push({ type: "critical", msg: `${lot.name} sắp đầy (${Math.round(pct)}%)` });
        else if (pct >= 70) newAlerts.push({ type: "warning", msg: `${lot.name} đang đông (${Math.round(pct)}%)` });
      });
      setAlerts(newAlerts);

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (_e) {}
  }, [selectedLotId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  // Mini map
  useEffect(() => {
    if (miniMap.current || !miniMapRef.current) return;
    miniMap.current = L.map(miniMapRef.current, { zoomControl: false, attributionControl: false })
      .setView([16.46, 107.58], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(miniMap.current);
    miniLayer.current = L.layerGroup().addTo(miniMap.current);
  }, []);

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

  const issueQr = async () => {
    setGateStatus("Đang cấp QR...");
    const res = await fetch(`${API_BASE}/api/qr/issue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId, plateNumber, lotId: selectedLotId, gateId: "HUE_GATE_1" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setGateStatus(`Lỗi: ${data?.message || res.statusText}`); return; }
    setIssuedQr(data.qrToken || "");
    setScanToken(data.qrToken || "");
    const dt = new Date(data.timestamp);
    setGateStatus(`[ĐẶT CHỖ THÀNH CÔNG]\nNgày: ${dt.toLocaleDateString()}\nGiờ: ${dt.toLocaleTimeString("vi-VN", { hour12: false })}\nID: ${data.bookingId}\nBiển số: ${data.plateNumber}`);
    await load();
  };

  const scanQr = async () => {
    setGateStatus("Đang quét...");
    const res = await fetch(`${API_BASE}/api/gate/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qrToken: scanToken, scannerId: "IOC_SCANNER_01" })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setGateStatus(`Từ chối: ${data?.message || res.statusText}`); await load(); return; }
    const dt = new Date(data.ts);
    setGateStatus(`[MỞ CỔNG THÀNH CÔNG]\nNgày: ${dt.toLocaleDateString()}\nGiờ: ${dt.toLocaleTimeString("vi-VN", { hour12: false })}\nID: ${data.bookingId}\nBiển số: ${data.plateNumber}\nCổng: ${data.gateId}`);
    await load();
  };

  const exportCSV = (type) => {
    let csv = "";
    if (type === "bookings") {
      csv = "ID,User ID,Bãi xe,Biển số,Số tiền,Trạng thái,Ngày tạo\n";
      bookings.forEach((b) => { csv += `${b.id},${b.user_id},${b.lot_name},${b.plate_number},${b.amount},${b.payment_status},${b.created_at}\n`; });
    } else if (type === "lots") {
      csv = "ID,Tên,Sức chứa,Còn trống,Giá/h\n";
      lots.forEach((l) => { csv += `${l.id},${l.name},${l.capacity},${l.availableSlots},${l.pricePerHour}\n`; });
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `smart-parking-${type}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (n) => Number(n || 0).toLocaleString() + "đ";
  const paymentLabel = (s) => s === "PAID" ? "Đã TT" : s === "PENDING" ? "Chờ TT" : "Thất bại";

  const pieData = lots.map((l) => ({ name: l.name, value: Number(l.capacity || 0) - Number(l.availableSlots || 0) }));

  return (
    <div className="dashboard">
      {/* TOP BAR */}
      <div className="topbar">
        <div className="topbar-left">
          <h1>IOC Huế - Giám sát Bãi đỗ xe</h1>
          <span className="update-time">Cập nhật: {lastUpdated}</span>
        </div>
        <div className="topbar-right">
          <div className="tab-buttons">
            {["overview", "lots", "bookings", "gate"].map((t) => (
              <button key={t} className={`tab-btn ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
                {t === "overview" ? "Tổng quan" : t === "lots" ? "Bãi xe" : t === "bookings" ? "Đặt chỗ" : "Cổng"}
              </button>
            ))}
          </div>
          <div className="export-btns">
            <button className="btn btn-sm btn-outline-dark" onClick={() => exportCSV("bookings")}>Xuất Booking CSV</button>
            <button className="btn btn-sm btn-outline-dark" onClick={() => exportCSV("lots")}>Xuất Lot CSV</button>
          </div>
        </div>
      </div>

      {/* ALERTS */}
      {alerts.length > 0 && (
        <div className="alerts-bar">
          {alerts.map((a, i) => (
            <div key={i} className={`alert-badge ${a.type}`}>{a.type === "critical" ? "NGUY CƠ" : "CẢNH BÁO"}: {a.msg}</div>
          ))}
        </div>
      )}

      {activeTab === "overview" && (
        <>
          {/* STAT CARDS */}
          <div className="stat-grid">
            <StatCard title="Tổng bãi xe" value={totalLots} icon="P" color="#2563eb" />
            <StatCard title="Tổng sức chứa" value={totalCapacity} icon="S" color="#7c3aed" />
            <StatCard title="Còn trống" value={totalAvailable} icon="C" color="#22c55e" />
            <StatCard title="Tỷ lệ lấp đầy" value={`${occupancyRate}%`} icon="%" color={occupancyRate > 80 ? "#ef4444" : "#f59e0b"} />
            <StatCard title="Doanh thu hôm nay" value={formatCurrency(stats?.todayRevenue || 0)} icon="$" color="#059669" />
            <StatCard title="Đặt chỗ hôm nay" value={stats?.todayBookings || 0} icon="B" color="#0891b2" />
            <StatCard title="Đã thanh toán" value={stats?.paidBookings || 0} icon="P" color="#2563eb" />
            <StatCard title="Đang gửi xe" value={stats?.activeSessions || 0} icon="A" color="#d97706" />
          </div>

          {/* CHARTS ROW */}
          <div className="chart-row">
            <div className="chart-card">
              <h3>Doanh thu 7 ngày qua</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} name="Doanh thu" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-card">
              <h3>Phân bố sức chứa</h3>
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

          {/* MINI MAP + EVENTS */}
          <div className="chart-row">
            <div className="chart-card">
              <h3>Bản đồ bãi xe</h3>
              <div ref={miniMapRef} className="mini-map" />
            </div>
            <div className="chart-card">
              <h3>Slot Event Timeline</h3>
              <div className="event-list">
                {events.slice(0, 15).map((e, idx) => (
                  <div key={`${e.lotId}-${e.ts}-${idx}`} className="event-item">
                    <div className="event-main"><b>{e.lotId}</b> &rarr; {e.availableSlots} slots</div>
                    <div className="event-meta">{new Date(e.ts).toLocaleString("vi-VN")} | {e.source}</div>
                  </div>
                ))}
                {events.length === 0 && <div className="empty">Chưa có sự kiện.</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === "lots" && (
        <div className="table-section">
          <h2>Danh sách bãi xe</h2>
          <table className="data-table">
            <thead><tr><th>ID</th><th>Tên bãi xe</th><th>Sức chứa</th><th>Còn trống</th><th>Tỷ lệ lấp đầy</th><th>Giá/h</th><th>EV</th></tr></thead>
            <tbody>
              {lots.map((l) => {
                const pct = l.capacity > 0 ? Math.round(((l.capacity - l.availableSlots) / l.capacity) * 100) : 0;
                return (
                  <tr key={l.id} className={pct >= 90 ? "row-critical" : pct >= 70 ? "row-warning" : ""}>
                    <td>{l.id}</td><td><b>{l.name}</b></td><td>{l.capacity}</td><td>{l.availableSlots}</td>
                    <td><div className="pct-bar"><div className={`pct-fill ${pct >= 90 ? "critical" : pct >= 70 ? "warning" : "ok"}`} style={{ width: `${pct}%` }} />{pct}%</div></td>
                    <td>{formatCurrency(l.pricePerHour)}</td>
                    <td>{l.evSupported ? "Có" : "Không"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "bookings" && (
        <div className="table-section">
          <h2>Danh sách đặt chỗ</h2>
          <table className="data-table">
            <thead><tr><th>ID</th><th>Bãi xe</th><th>Biển số</th><th>Số tiền</th><th>TT</th><th>Nhà cung cấp</th><th>Ngày tạo</th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.id}</td><td>{b.lot_name}</td><td>{b.plate_number}</td><td>{formatCurrency(b.amount)}</td>
                  <td><span className={`pay-badge ${b.payment_status}`}>{paymentLabel(b.payment_status)}</span></td>
                  <td>{b.payment_provider || "-"}</td>
                  <td>{new Date(b.created_at).toLocaleString("vi-VN")}</td>
                </tr>
              ))}
              {bookings.length === 0 && <tr><td colSpan={7} className="empty">Chưa có đặt chỗ nào.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "gate" && (
        <div className="gate-section">
          <div className="chart-row">
            <div className="chart-card">
              <h3>QR Issue - Cấp mã QR</h3>
              <div className="form-group">
                <label>Chọn Bãi Đỗ Xe</label>
                <select value={selectedLotId} onChange={(e) => setSelectedLotId(e.target.value)}>
                  {lots.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.id})</option>)}
                </select>
              </div>
              <div className="form-group"><label>Booking ID</label><input value={bookingId} onChange={(e) => setBookingId(e.target.value)} /></div>
              <div className="form-group"><label>Biển số xe</label><input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} /></div>
              <button className="btn btn-primary btn-block" onClick={issueQr}>Cấp QR cho User</button>
              <textarea value={issuedQr} readOnly rows={5} className="qr-textarea" placeholder="QR token sẽ hiển thị ở đây..." />
              {issuedQr && (
                <div className="qr-display">
                  <p>Mã QR:</p>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(issuedQr)}`} alt="QR Code" className="qr-img" />
                </div>
              )}
            </div>
            <div className="chart-card">
              <h3>Gate Scanner - Quét mã QR</h3>
              <textarea value={scanToken} onChange={(e) => setScanToken(e.target.value)} rows={5} className="qr-textarea" placeholder="Dán mã QR vào đây để quét..." />
              <button className="btn btn-success btn-block" onClick={scanQr}>Quét QR / Mở Cổng</button>
              <div className="gate-result">{gateStatus || "Sẵn sàng quét mã..."}</div>
              <div className="gate-events">
                <h4>Gate Events ({gateEvents.length})</h4>
                <div className="event-list">
                  {gateEvents.slice(0, 15).map((e, i) => (
                    <div key={`${e.ts}-${i}`} className={`event-item ${e.granted ? "granted" : "denied"}`}>
                      <div><b>{e.granted ? "CHO PHÉP" : "TỪ CHỐI"}</b> | {e.gateId} | {e.actor}</div>
                      <div className="event-meta">{new Date(e.ts).toLocaleString("vi-VN")} | {e.role} | {e.direction}</div>
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
