import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isInTimeRange(rangeStr) {
  if (!rangeStr) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [start, end] = rangeStr.split("-");
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return currentMinutes >= startMin && currentMinutes <= endMin;
}

export default function App() {
  const [lots, setLots] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [restrictedZones, setRestrictedZones] = useState([]);
  const mapRef = useRef(null);
  const map = useRef(null);
  const layerGroup = useRef(null);
  const restrictedLayer = useRef(null);
  const polygonLayer = useRef(null);
  const userMarkerRef = useRef(null);
  const parkingLayer = useRef(null);

  // Booking state
  const [showBooking, setShowBooking] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);
  const [bookingForm, setBookingForm] = useState({ plateNumber: "", phoneNumber: "", estimatedHours: 2 });
  const [bookingResult, setBookingResult] = useState(null);
  const [bookingStep, setBookingStep] = useState("form");
  const [existingBooking, setExistingBooking] = useState(null);

  // Filter state
  const [filters, setFilters] = useState({ search: "", maxPrice: 0, evOnly: false, availableOnly: true });
  const [showFilters, setShowFilters] = useState(false);

  // Auth state
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authForm, setAuthForm] = useState({ email: "", password: "", fullName: "", phone: "", mode: "login" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [userBookings, setUserBookings] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Parking lot list panel
  const [showLotList, setShowLotList] = useState(true);

  // Traffic regulation state
  const [vehicleType, setVehicleType] = useState("CAR");
  const [warnings, setWarnings] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [showTrafficPanel, setShowTrafficPanel] = useState(false);
  const [locationRules, setLocationRules] = useState([]);
  const [nearbyParking, setNearbyParking] = useState([]);

  useEffect(() => {
    if (map.current) return;
    map.current = L.map(mapRef.current).setView([16.46, 107.58], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map.current);
    layerGroup.current = L.layerGroup().addTo(map.current);
    restrictedLayer.current = L.layerGroup().addTo(map.current);
    parkingLayer.current = L.layerGroup().addTo(map.current);
  }, []);

  const loadLots = useCallback(() =>
    fetch(`${API_BASE}/api/parking-lots`)
      .then((r) => r.json())
      .then((data) => {
        setLots(Array.isArray(data) ? data : []);
        setLastUpdated(new Date().toLocaleTimeString());
      })
      .catch(() => {}), []);

  const loadRestricted = useCallback(() =>
    fetch(`${API_BASE}/api/restricted-zones`)
      .then((r) => r.json())
      .then((data) => {
        const features = data.features || [];
        setRestrictedZones(features);
        renderRestrictedZones(features);
        renderParkingPoints(features);
      })
      .catch(() => {}), []);

  const getZoneStyle = (feature) => {
    const type = feature.properties.restriction_type;
    const timeRanges = feature.properties.time_ranges || [];
    const nowRestricted = timeRanges.some((r) => isInTimeRange(r));

    if (type === "PARKING") {
      return { color: "#22c55e", weight: 3, opacity: 0.9, fillColor: "#22c55e", fillOpacity: 0.2 };
    }
    if (type === "ABSOLUTE_BAN") {
      return { color: "#ef4444", weight: 6, opacity: 0.85, dashArray: "" };
    }
    if (type === "TIME_RESTRICTED" || type === "VEHICLE_RESTRICTED") {
      return {
        color: nowRestricted ? "#ef4444" : "#f59e0b",
        weight: nowRestricted ? 6 : 4,
        opacity: nowRestricted ? 0.9 : 0.7,
        dashArray: nowRestricted ? "" : "8, 6"
      };
    }
    // CONDITIONAL
    return {
      color: nowRestricted ? "#ef4444" : "#f59e0b",
      weight: 4,
      opacity: 0.7,
      dashArray: "10, 10"
    };
  };

  const getZoneLabel = (feature) => {
    const type = feature.properties.restriction_type;
    const timeRanges = feature.properties.time_ranges || [];
    const nowRestricted = timeRanges.some((r) => isInTimeRange(r));

    if (type === "PARKING") return "BÃI ĐỖ XE";
    if (type === "ABSOLUTE_BAN") return "CẤM TUYỆT ĐỐI";
    if ((type === "TIME_RESTRICTED" || type === "VEHICLE_RESTRICTED") && nowRestricted) return "ĐANG CẤM (trong giờ)";
    if (type === "TIME_RESTRICTED") return "CẤM THEO GIỜ";
    if (type === "VEHICLE_RESTRICTED") return "HẠN CHẾ PHƯƠNG TIỆN";
    return "CẤM CÓ ĐIỀU KIỆN";
  };

  const getZoneLabelColor = (feature) => {
    const type = feature.properties.restriction_type;
    const timeRanges = feature.properties.time_ranges || [];
    const nowRestricted = timeRanges.some((r) => isInTimeRange(r));
    if (type === "PARKING") return "#16a34a";
    if (type === "ABSOLUTE_BAN" || ((type === "TIME_RESTRICTED" || type === "VEHICLE_RESTRICTED") && nowRestricted)) return "#dc2626";
    return "#d97706";
  };

  const vehicleTypeLabel = (types) => {
    if (!types || types.length === 0) return "Tất cả phương tiện";
    const map = { CAR: "Ô tô", MOTORBIKE: "Xe máy", TRUCK: "Xe tải", BUS: "Xe khách" };
    return types.map((t) => map[t] || t).join(", ");
  };

  const renderRestrictedZones = (features) => {
    if (!restrictedLayer.current) return;
    restrictedLayer.current.clearLayers();

    features.forEach((feature) => {
      if (feature.properties.restriction_type === "PARKING") return;
      if (feature.geometry.type === "Point") return;

      const timeRanges = feature.properties.time_ranges || [];
      const nowRestricted = timeRanges.some((r) => isInTimeRange(r));
      const style = getZoneStyle(feature);
      const label = getZoneLabel(feature);
      const labelColor = getZoneLabelColor(feature);
      const vehicleTypes = feature.properties.vehicle_types || [];

      const layer = L.geoJSON(feature, {
        style,
        onEachFeature: (_f, l) => {
          l.bindPopup(`
            <div class="zone-popup">
              <div class="zone-popup-header" style="border-left: 4px solid ${labelColor}">
                <span class="zone-badge" style="background:${labelColor};color:white">${label}</span>
                <b class="zone-name">${feature.properties.name}</b>
              </div>
              ${nowRestricted ? '<div class="zone-alert-active">CẢNH BÁO: ĐANG TRONG GIỜ CẤM</div>' : ''}
              <p class="zone-desc">${feature.properties.description}</p>
              <div class="zone-details">
                <div class="zone-detail-row"><span>Quy tắc:</span><span>${feature.properties.rules}</span></div>
                <div class="zone-detail-row"><span>Phương tiện:</span><span>${vehicleTypeLabel(vehicleTypes)}</span></div>
                ${timeRanges.length > 0 ? `<div class="zone-detail-row"><span>Giờ cấm:</span><span>${timeRanges.join(", ")}</span></div>` : ""}
                ${feature.properties.fine ? `<div class="zone-detail-row"><span>Mức phạt:</span><span class="fine">${feature.properties.fine}</span></div>` : ""}
                <div class="zone-detail-row"><span>Khu vực:</span><span>${feature.properties.area || "Trung tâm"}</span></div>
              </div>
            </div>
          `);
        }
      });

      if (feature.geometry.type === "Polygon") {
        layer.setStyle({ fillColor: style.color, fillOpacity: 0.12, weight: style.weight });
      }

      layer.addTo(restrictedLayer.current);
    });
  };

  const renderParkingPoints = (features) => {
    if (!parkingLayer.current) return;
    parkingLayer.current.clearLayers();

    features.forEach((feature) => {
      if (feature.properties.restriction_type !== "PARKING") return;
      if (feature.geometry.type !== "Point") return;

      const [lng, lat] = feature.geometry.coordinates;
      const icon = L.divIcon({
        className: "parking-icon",
        html: '<div class="parking-marker">P</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      L.marker([lat, lng], { icon })
        .bindPopup(`
          <div class="zone-popup">
            <div class="zone-popup-header" style="border-left: 4px solid #16a34a">
              <span class="zone-badge" style="background:#16a34a;color:white">BÃI ĐỖ XE</span>
              <b class="zone-name">${feature.properties.name}</b>
            </div>
            <p class="zone-desc">${feature.properties.description}</p>
            <div class="zone-details">
              <div class="zone-detail-row"><span>Giá:</span><span class="fine">${feature.properties.price || "Liên hệ"}</span></div>
              <div class="zone-detail-row"><span>Loại:</span><span>${feature.properties.parking_type === "mall" ? "Trung tâm thương mại" : "Bãi công cộng"}</span></div>
            </div>
            <button class="popup-nav-btn" onclick="window.__openDirections(${lat},${lng})">Chỉ đường đến đây</button>
          </div>
        `)
        .addTo(parkingLayer.current);
    });
  };

  useEffect(() => {
    loadLots();
    loadRestricted();
    const timer = setInterval(loadLots, 5000);
    return () => clearInterval(timer);
  }, [loadLots, loadRestricted]);

  // Re-render restricted zones when vehicle type changes
  useEffect(() => {
    if (restrictedZones.length > 0) {
      renderRestrictedZones(restrictedZones);
    }
  }, [vehicleType]);

  // Render map markers
  useEffect(() => {
    if (!map.current || !layerGroup.current) return;
    layerGroup.current.clearLayers();
    if (polygonLayer.current) { polygonLayer.current.remove(); polygonLayer.current = null; }

    const filtered = lots.filter((lot) => {
      if (filters.availableOnly && lot.availableSlots <= 0) return false;
      if (filters.evOnly && !lot.evSupported) return false;
      if (filters.maxPrice > 0 && lot.pricePerHour > filters.maxPrice) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!lot.name.toLowerCase().includes(q) && !lot.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    for (const lot of filtered) {
      const color = lot.availableSlots > 0 ? "#22c55e" : "#ef4444";
      const marker = L.circleMarker([lot.lat, lot.lng], {
        radius: 10, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.8
      });
      marker.bindPopup(`
        <div style="min-width: 180px">
          <b style="font-size: 14px">${lot.name}</b><br/>
          <span style="font-size: 11px; color: #666">${lot.id}</span>
          <hr style="margin: 5px 0"/>
          <span style="color: ${color}; font-weight: bold">
            ${lot.availableSlots > 0 ? `Còn trống: ${lot.availableSlots}` : "Đã hết chỗ"}
          </span> / Tổng: ${lot.capacity}<br/>
          Giá: ${lot.pricePerHour.toLocaleString()}đ/h<br/>
          ${lot.evSupported ? '<span style="color:#2563eb;font-size:11px">Sạc EV</span><br/>' : ''}
          <button onclick="window.__openBooking('${lot.id}')" style="margin-top:8px;width:100%;background:#2563eb;color:white;border:none;padding:6px;border-radius:4px;cursor:pointer">
            ${activeBookingLotIds.has(lot.id) ? 'Xem mã QR vào cổng' : 'Đặt chỗ ngay'}
          </button>
          ${lot.availableSlots > 0 ? `<button onclick="window.__openDirections(${lot.lat},${lot.lng})" style="margin-top:4px;width:100%;background:#fff;color:#2563eb;border:1px solid #2563eb;padding:5px;border-radius:4px;cursor:pointer;font-size:12px">
            Chỉ đường
          </button>` : ''}
        </div>
      `);
      marker.addTo(layerGroup.current);
    }

    const features = lots
      .filter((l) => l.geometry && l.geometry.type === "Polygon")
      .map((l) => ({
        type: "Feature",
        properties: { id: l.id, name: l.name, availableSlots: l.availableSlots },
        geometry: l.geometry
      }));

    if (features.length) {
      polygonLayer.current = L.geoJSON(
        { type: "FeatureCollection", features },
        {
          style: (f) => ({
            color: "#111827", weight: 2, fillOpacity: 0.35,
            fillColor: (f?.properties?.availableSlots ?? 0) > 0 ? "#22c55e" : "#ef4444"
          }),
          onEachFeature: (feature, layer) => {
            const p = feature.properties || {};
            layer.bindPopup(`<b>${p.name}</b><br/>Slots: ${p.availableSlots}`);
          }
        }
      ).addTo(map.current);
    }
  }, [lots, filters]);

  // GPS proximity check
  const checkProximity = useCallback((lat, lng) => {
    if (!restrictedZones.length) return;
    const userPos = { lat, lng };
    const newWarnings = [];
    const matchingRules = [];
    const parkingNearby = [];

    for (const zone of restrictedZones) {
      const props = zone.properties;
      if (props.restriction_type === "PARKING") {
        if (zone.geometry.type === "Point") {
          const [plng, plat] = zone.geometry.coordinates;
          const dist = haversineMeters(userPos, { lat: plat, lng: plng });
          if (dist < 1000) {
            parkingNearby.push({ ...props, distance: Math.round(dist) });
          }
        }
        continue;
      }

      // Check all coordinates for proximity
      let minDist = Infinity;
      const coords = zone.geometry.type === "Polygon"
        ? zone.geometry.coordinates[0]
        : zone.geometry.coordinates;

      for (const [clng, clat] of coords) {
        const dist = haversineMeters(userPos, { lat: clat, lng: clng });
        if (dist < minDist) minDist = dist;
      }

      const isRelevant = props.vehicle_types
        ? props.vehicle_types.includes(vehicleType) || vehicleType === "ALL"
        : true;

      if (minDist < 100 && isRelevant) {
        const timeRanges = props.time_ranges || [];
        const nowRestricted = timeRanges.some((r) => isInTimeRange(r));
        const isActiveBan = props.restriction_type === "ABSOLUTE_BAN" || nowRestricted;

        matchingRules.push({ ...props, distance: Math.round(minDist), isActiveBan });

        if (isActiveBan) {
          newWarnings.push({
            id: props.id,
            type: "danger",
            msg: nowRestricted
              ? `ĐANG TRONG GIỜ CẤM: ${props.name} - ${props.description}`
              : `VÀO KHU CẤM: ${props.name} - ${props.description}`,
            detail: props.rules,
            fine: props.fine
          });
        } else if (minDist < 50) {
          newWarnings.push({
            id: props.id,
            type: "warning",
            msg: `Sắp vào khu hạn chế: ${props.name}`,
            detail: props.rules,
            fine: props.fine
          });
        }
      }
    }

    if (newWarnings.length > 0) {
      setWarnings((prev) => {
        const existingIds = new Set(prev.map((w) => w.id));
        const fresh = newWarnings.filter((w) => !existingIds.has(w.id));
        return [...prev, ...fresh].slice(-5);
      });
    }

    setLocationRules(matchingRules);
    setNearbyParking(parkingNearby.sort((a, b) => a.distance - b.distance).slice(0, 3));
  }, [restrictedZones, vehicleType]);

  // Derived: lots where user has an active PAID booking
  const activeBookingLotIds = new Set(userBookings.filter((b) => b.payment_status === "PAID").map((b) => b.parking_lot_id));

  // Expose global handlers for popup buttons
  useEffect(() => {
    window.__openBooking = (lotId) => {
      const lot = lots.find((l) => l.id === lotId);
      if (!lot) return;
      const existing = userBookings.find((b) => b.parking_lot_id === lotId && b.payment_status === "PAID");
      if (existing) {
        setSelectedLot(lot);
        setExistingBooking(existing);
        setBookingStep("existing");
        setShowBooking(true);
      } else if (lot.availableSlots > 0) {
        setSelectedLot(lot);
        setBookingForm({ plateNumber: "", phoneNumber: "", estimatedHours: 2 });
        setBookingResult(null);
        setExistingBooking(null);
        setBookingStep("form");
        setShowBooking(true);
      }
    };
    window.__openDirections = (lat, lng) => {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
    };
    return () => { delete window.__openBooking; delete window.__openDirections; };
  }, [lots]);

  // User location
  const locateUser = () => {
    if (!map.current) return;
    map.current.locate({ setView: true, maxZoom: 16 });
    map.current.once("locationfound", (e) => {
      const { lat, lng } = e.latlng;
      if (userMarkerRef.current) map.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = L.marker([lat, lng], {
        icon: L.divIcon({ className: "user-marker", html: '<div style="width:16px;height:16px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(37,99,235,0.6)"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
      }).addTo(map.current).bindPopup("Vị trí của bạn").openPopup();
      setUserLocation({ lat, lng });
      checkProximity(lat, lng);
    });
  };

  const dismissWarning = (id) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  };

  // Booking flow
  const submitBooking = async () => {
    if (!selectedLot || !bookingForm.plateNumber) return;
    const res = await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lotId: selectedLot.id,
        plateNumber: bookingForm.plateNumber,
        phoneNumber: bookingForm.phoneNumber,
        estimatedHours: bookingForm.estimatedHours,
        userId: user?.id || 0
      })
    });
    const data = await res.json();
    if (data.success) {
      setBookingResult(data);
      setBookingStep("payment");

      // Auto-confirm payment directly (dev mode - skip MoMo)
      const confirmRes = await fetch(`${API_BASE}/api/payments/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: data.bookingId, provider: "DIRECT", status: "PAID" })
      });
      const confirmData = await confirmRes.json();
      if (confirmRes.ok) {
        setBookingResult((prev) => ({ ...prev, qrDataUrl: confirmData.qrDataUrl }));
        setBookingStep("qr");
        loadLots();
      } else {
        setBookingResult((prev) => ({ ...prev, error: confirmData.message || "Payment confirmation failed" }));
      }
    } else {
      alert(data.message || "Dat cho that bai");
    }
  };

  // Auth
  const handleAuth = async () => {
    setAuthError("");
    setAuthBusy(true);
    const endpoint = authForm.mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = authForm.mode === "login"
      ? { email: authForm.email, password: authForm.password }
      : { fullName: authForm.fullName, email: authForm.email, password: authForm.password, phone: authForm.phone };
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.token) {
        setUser(data.user);
        localStorage.setItem("sp_token", data.token);
        localStorage.setItem("sp_user", JSON.stringify(data.user));
        setShowAuth(false);
        setAuthError("");
        loadUserBookings(data.user.id);
      } else {
        setAuthError(data.message || "Authentication failed");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setAuthError("Không thể kết nối đến server.");
    } finally {
      setAuthBusy(false);
    }
  };

  const loadUserBookings = async (userId) => {
    const res = await fetch(`${API_BASE}/api/users/${userId}/bookings`);
    const data = await res.json();
    setUserBookings(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const token = localStorage.getItem("sp_token");
    const savedUser = localStorage.getItem("sp_user");
    if (token && savedUser) {
      try {
        const u = JSON.parse(savedUser);
        setUser(u);
        loadUserBookings(u.id);
      } catch (_e) {}
    }
  }, []);

  const logout = () => {
    localStorage.removeItem("sp_token");
    localStorage.removeItem("sp_user");
    setUser(null);
    setUserBookings([]);
  };

  const formatCurrency = (n) => Number(n || 0).toLocaleString() + "đ";
  const paymentStatusLabel = (s) => s === "PAID" ? "Đã thanh toán" : s === "PENDING" ? "Chờ thanh toán" : "Thất bại";

  return (
    <div className="app-container">
      <div ref={mapRef} className="map-container" />

      {/* PARKING LOT LIST PANEL */}
      <div className={`lot-list-panel ${showLotList ? "open" : "closed"}`}>
        <div className="lot-list-header" onClick={() => setShowLotList(!showLotList)}>
          <h3>Bãi đỗ xe ({lots.filter((l) => l.availableSlots > 0).length} còn chỗ)</h3>
          <span className="lot-list-toggle">{showLotList ? "−" : "+"}</span>
        </div>
        {showLotList && (
          <div className="lot-list-body">
            {lots.length === 0 ? (
              <p className="lot-list-empty">Đang tải dữ liệu bãi xe...</p>
            ) : lots.filter((l) => l.availableSlots > 0).length === 0 ? (
              <p className="lot-list-empty">Hiện không có bãi xe nào còn chỗ trống.</p>
            ) : (
              lots.filter((l) => l.availableSlots > 0).map((lot) => (
                <div key={lot.id} className="lot-card">
                  <div className="lot-card-info">
                    <div className="lot-card-name">{lot.name}</div>
                    <div className="lot-card-meta">
                      <span className="lot-card-slots">Còn {lot.availableSlots}/{lot.capacity} chỗ</span>
                      <span className="lot-card-price">{lot.pricePerHour.toLocaleString()}đ/h</span>
                    </div>
                    {lot.evSupported && <span className="lot-card-ev">Sạc EV</span>}
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const existing = userBookings.find((b) => b.parking_lot_id === lot.id && b.payment_status === "PAID");
                      if (existing) {
                        setSelectedLot(lot);
                        setExistingBooking(existing);
                        setBookingStep("existing");
                        setShowBooking(true);
                      } else {
                        setSelectedLot(lot);
                        setBookingForm({ plateNumber: "", phoneNumber: "", estimatedHours: 2 });
                        setBookingResult(null);
                        setExistingBooking(null);
                        setBookingStep("form");
                        setShowBooking(true);
                      }
                    }}
                  >
                    {userBookings.some((b) => b.parking_lot_id === lot.id && b.payment_status === "PAID") ? "Xem mã QR" : "Đặt chỗ"}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* WARNING TOASTS */}
      <div className="warning-toast-container">
        {warnings.map((w) => (
          <div key={w.id} className={`warning-toast ${w.type}`}>
            <div className="warning-toast-header">
              <span className="warning-toast-icon">{w.type === "danger" ? "!" : "i"}</span>
              <span className="warning-toast-msg">{w.msg}</span>
              <button className="warning-toast-close" onClick={() => dismissWarning(w.id)}>x</button>
            </div>
            {w.detail && <div className="warning-toast-detail">{w.detail}</div>}
            {w.fine && <div className="warning-toast-fine">Mức phạt: {w.fine}</div>}
          </div>
        ))}
      </div>

      {/* TOP HEADER */}
      <div className="top-header">
        <div className="header-left">
          <h1>Smart Parking Huế</h1>
          <span className="last-update">Cập nhật: {lastUpdated}</span>
        </div>
        <div className="header-right">
          <select
            className="vehicle-select"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            title="Chọn loại phương tiện"
          >
            <option value="CAR">Ô tô</option>
            <option value="MOTORBIKE">Xe máy</option>
            <option value="TRUCK">Xe tải</option>
            <option value="BUS">Xe khách</option>
            <option value="ALL">Tất cả</option>
          </select>
          <button className="btn btn-sm btn-outline" onClick={() => setShowFilters(!showFilters)}>
            Bộ lọc
          </button>
          <button className="btn btn-sm btn-outline" onClick={locateUser}>
            Vị trí của tôi
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => {
            if (userLocation) {
              checkProximity(userLocation.lat, userLocation.lng);
              setShowTrafficPanel(!showTrafficPanel);
            } else {
              locateUser();
            }
          }}>
            Luật đỗ xe
          </button>
          {user ? (
            <>
              <button className="btn btn-sm btn-outline" onClick={() => { loadUserBookings(user.id); setShowHistory(!showHistory); }}>
                Lịch sử
              </button>
              <span className="user-name">{user.fullName}</span>
              <button className="btn btn-sm btn-outline" onClick={logout}>Đăng xuất</button>
            </>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={() => setShowAuth(true)}>Đăng nhập</button>
          )}
        </div>
      </div>

      {/* FILTER PANEL */}
      {showFilters && (
        <div className="filter-panel">
          <input
            type="text"
            placeholder="Tìm bãi xe..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="filter-input"
          />
          <select
            value={filters.maxPrice}
            onChange={(e) => setFilters((f) => ({ ...f, maxPrice: Number(e.target.value) }))}
            className="filter-select"
          >
            <option value="0">Tất cả giá</option>
            <option value="5000">Dưới 5.000đ/h</option>
            <option value="10000">Dưới 10.000đ/h</option>
            <option value="20000">Dưới 20.000đ/h</option>
          </select>
          <label className="filter-check">
            <input type="checkbox" checked={filters.availableOnly} onChange={(e) => setFilters((f) => ({ ...f, availableOnly: e.target.checked }))} />
            Còn chỗ
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={filters.evOnly} onChange={(e) => setFilters((f) => ({ ...f, evOnly: e.target.checked }))} />
            Hỗ trợ EV
          </label>
          <span className="filter-count">{lots.filter((l) => {
            if (filters.availableOnly && l.availableSlots <= 0) return false;
            if (filters.evOnly && !l.evSupported) return false;
            if (filters.maxPrice > 0 && l.pricePerHour > filters.maxPrice) return false;
            if (filters.search) { const q = filters.search.toLowerCase(); if (!l.name.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false; }
            return true;
          }).length} bãi xe</span>
        </div>
      )}

      {/* TRAFFIC RULES PANEL */}
      {showTrafficPanel && (
        <div className="traffic-panel">
          <div className="traffic-panel-header">
            <h3>Luật giao thông & Đỗ xe</h3>
            <button className="modal-close" onClick={() => setShowTrafficPanel(false)}>x</button>
          </div>
          <div className="traffic-panel-body">
            {!userLocation ? (
              <p className="empty-text">Bấm "Vị trí của tôi" để kiểm tra luật đỗ xe tại vị trí hiện tại.</p>
            ) : locationRules.length === 0 ? (
              <p className="empty-text" style={{ color: "#16a34a" }}>Vị trí hiện tại không nằm trong khu vực hạn chế. Bạn có thể đỗ xe nếu tuân thủ quy định chung.</p>
            ) : (
              <>
                <p className="traffic-location">Vị trí của bạn nằm gần {locationRules.length} khu vực có quy định:</p>
                {locationRules.map((rule) => (
                  <div key={rule.id} className={`traffic-rule-item ${rule.isActiveBan ? "active-ban" : ""}`}>
                    <div className="traffic-rule-header">
                      <span className={`traffic-rule-badge ${rule.isActiveBan ? "danger" : "warning"}`}>
                        {rule.isActiveBan ? "ĐANG CẤM" : "HẠN CHẾ"}
                      </span>
                      <b>{rule.name}</b>
                      <span className="traffic-distance">Cách {rule.distance}m</span>
                    </div>
                    <p className="traffic-rule-desc">{rule.description}</p>
                    <div className="traffic-rule-meta">
                      <span>Quy tắc: {rule.rules}</span>
                      {rule.fine && <span className="traffic-fine">Phạt: {rule.fine}</span>}
                    </div>
                  </div>
                ))}
              </>
            )}

            {nearbyParking.length > 0 && (
              <div className="nearby-parking-section">
                <h4>Bãi đỗ xe gần bạn</h4>
                {nearbyParking.map((p) => (
                  <div key={p.id} className="parking-suggestion">
                    <div className="parking-suggestion-header">
                      <span className="parking-icon-small">P</span>
                      <div>
                        <b>{p.name}</b>
                        <span className="parking-distance">Cách {p.distance}m</span>
                      </div>
                    </div>
                    <div className="parking-suggestion-info">
                      <span>Giá: {p.price || "Liên hệ"}</span>
                      <span>{p.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="traffic-general-rules">
              <h4>Quy định đỗ xe chung</h4>
              <ul>
                <li>Đỗ sát lề phải, không cách lề quá 0.25m</li>
                <li>Cấm đỗ trong phạm vi 5m tính từ giao lộ</li>
                <li>Cấm đỗ trên cầu, gầm cầu, vỉa hè trái phép</li>
                <li>Cấm đỗ trước cổng cơ quan, trạm xe buýt</li>
                <li>Cấm đỗ trên đường hẹp 1 làn</li>
                <li className="rule-fine">Ô tô đỗ sai: phạt 800.000–1.000.000 VNĐ</li>
                <li className="rule-fine">Xe máy đỗ sai: phạt 400.000–600.000 VNĐ</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* BOOKING MODAL */}
      {showBooking && selectedLot && (
        <div className="modal-overlay" onClick={() => setShowBooking(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedLot.name}</h2>
              <button className="modal-close" onClick={() => { setShowBooking(false); }}>x</button>
            </div>
            <div className="modal-body">
              {bookingStep === "form" && (
                <>
                  <div className="lot-info">
                    <span className="lot-badge available">Còn {selectedLot.availableSlots}/{selectedLot.capacity} chỗ</span>
                    <span className="lot-badge price">{selectedLot.pricePerHour.toLocaleString()}đ/h</span>
                    {selectedLot.evSupported && <span className="lot-badge ev">Sạc EV</span>}
                  </div>
                  <div className="form-group">
                    <label>Biển số xe <span className="required">*</span></label>
                    <input type="text" placeholder="VD: 75A-12345" value={bookingForm.plateNumber}
                      onChange={(e) => setBookingForm((f) => ({ ...f, plateNumber: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Số điện thoại</label>
                    <input type="tel" placeholder="VD: 0905123456" value={bookingForm.phoneNumber}
                      onChange={(e) => setBookingForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Thời gian gửi dự kiến</label>
                    <select value={bookingForm.estimatedHours} onChange={(e) => setBookingForm((f) => ({ ...f, estimatedHours: Number(e.target.value) }))}>
                      <option value="1">1 giờ - {selectedLot.pricePerHour.toLocaleString()}đ</option>
                      <option value="2">2 giờ - {(selectedLot.pricePerHour * 2).toLocaleString()}đ</option>
                      <option value="4">4 giờ - {(selectedLot.pricePerHour * 4).toLocaleString()}đ</option>
                      <option value="8">8 giờ - {(selectedLot.pricePerHour * 8).toLocaleString()}đ</option>
                      <option value="24">24 giờ - {(selectedLot.pricePerHour * 24).toLocaleString()}đ</option>
                    </select>
                  </div>
                  <div className="total-row">
                    <span>Tổng tiền:</span>
                    <span className="total-amount">{(selectedLot.pricePerHour * bookingForm.estimatedHours).toLocaleString()}đ</span>
                  </div>
                  <button className="btn btn-primary btn-block" onClick={submitBooking} disabled={!bookingForm.plateNumber}>
                    Xác nhận đặt chỗ
                  </button>
                </>
              )}

              {bookingStep === "payment" && bookingResult && (
                <div className="payment-section">
                  <div className="booking-success">
                    <div className="success-icon">&#10003;</div>
                    <h3>Đặt chỗ thành công!</h3>
                    <p>Mã đặt chỗ: <b>{bookingResult.bookingId}</b></p>
                    <p>Số tiền: <b>{formatCurrency(bookingResult.amount)}</b></p>
                  </div>
                  <p className="payment-processing">Đang xác nhận thanh toán...</p>
                </div>
              )}

              {bookingStep === "existing" && existingBooking && selectedLot && (
                <div className="existing-booking-section">
                  <div className="booking-success">
                    <div className="success-icon large">&#128274;</div>
                    <h3>Bạn đã đặt chỗ tại bãi này!</h3>
                  </div>
                  <div className="existing-booking-info">
                    <div className="eb-row"><span>Mã đặt chỗ:</span> <b>{existingBooking.id}</b></div>
                    <div className="eb-row"><span>Biển số xe:</span> <b style={{fontSize:"18px",color:"#dc2626"}}>{existingBooking.plate_number}</b></div>
                    <div className="eb-row"><span>Bãi xe:</span> <b>{selectedLot.name}</b></div>
                    <div className="eb-row"><span>Trạng thái:</span> <span className="status-badge PAID">Đã thanh toán</span></div>
                    <div className="eb-row"><span>Số tiền:</span> <b>{formatCurrency(existingBooking.amount)}</b></div>
                  </div>
                  <p style={{marginTop:12,fontWeight:600}}>QR Code vào cổng:</p>
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(JSON.stringify({bookingId:existingBooking.id,plate:existingBooking.plate_number,lot:selectedLot.id}))}`} alt="Entry QR" className="qr-image" />
                  <p className="qr-note" style={{marginTop:8}}>Đưa mã QR này cho nhân viên tại cổng bãi xe để vào cổng.</p>
                  <button className="btn btn-primary btn-block" onClick={() => { setShowBooking(false); }}>
                    Đóng
                  </button>
                </div>
              )}

              {bookingStep === "qr" && bookingResult?.qrDataUrl && (
                <div className="qr-result-section">
                  <div className="success-icon large">&#10003;</div>
                  <h3>Thanh toán thành công!</h3>
                  <p>QR Code vào cổng:</p>
                  <img src={bookingResult.qrDataUrl} alt="Entry QR" className="qr-image" />
                  <div className="qr-info">
                    <p>Mã đặt chỗ: <b>{bookingResult.bookingId}</b></p>
                    <p>Biển số: <b>{bookingForm.plateNumber}</b></p>
                    <p>Bãi xe: <b>{selectedLot.name}</b></p>
                    <p className="qr-note">Lưu QR này để quét tại cổng bãi xe. QR có hiệu lực 4 giờ.</p>
                  </div>
                  <button className="btn btn-primary btn-block" onClick={() => { setShowBooking(false); }}>
                    Đóng
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{authForm.mode === "login" ? "Đăng nhập" : "Đăng ký"}</h2>
              <button className="modal-close" onClick={() => setShowAuth(false)}>x</button>
            </div>
            <div className="modal-body">
              {authForm.mode === "register" && (
                <>
                  <div className="form-group"><label>Họ tên</label><input type="text" value={authForm.fullName} onChange={(e) => setAuthForm((f) => ({ ...f, fullName: e.target.value }))} /></div>
                  <div className="form-group"><label>Số điện thoại</label><input type="tel" value={authForm.phone} onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                </>
              )}
              <div className="form-group"><label>Email</label><input type="email" value={authForm.email} onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))} placeholder="admin@hue.vn" /></div>
              <div className="form-group"><label>Mật khẩu</label><input type="password" value={authForm.password} onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))} placeholder="123456" /></div>
              {authError && <div className="auth-error-msg">{authError}</div>}
              <button className="btn btn-primary btn-block" onClick={handleAuth} disabled={authBusy}>
                {authBusy ? "Đang xử lý..." : authForm.mode === "login" ? "Đăng nhập" : "Đăng ký"}
              </button>
              <button className="btn btn-link btn-block" onClick={() => { setAuthForm((f) => ({ ...f, mode: f.mode === "login" ? "register" : "login" })); setAuthError(""); }}>
                {authForm.mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOOKING HISTORY */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Lịch sử đặt chỗ</h2>
              <button className="modal-close" onClick={() => setShowHistory(false)}>x</button>
            </div>
            <div className="modal-body">
              {userBookings.length === 0 ? (
                <p className="empty-text">Chưa có lịch sử đặt chỗ.</p>
              ) : (
                <div className="history-list">
                  {userBookings.map((b) => (
                    <div key={b.id} className="history-item">
                      <div className="history-main">
                        <b>{b.lot_name}</b>
                        <span className={`status-badge ${b.payment_status}`}>{paymentStatusLabel(b.payment_status)}</span>
                      </div>
                      <div className="history-detail">
                        Biển số: {b.plate_number} | {formatCurrency(b.amount)} | {new Date(b.created_at).toLocaleString("vi-VN")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ENHANCED LEGEND */}
      <div className="legend enhanced">
        <h4>Ghi chú bản đồ</h4>
        <div className="legend-section">
          <span className="legend-section-title">Bãi đỗ xe</span>
          <div className="legend-item"><div className="legend-dot green" /> Còn chỗ</div>
          <div className="legend-item"><div className="legend-dot red" /> Đầy chỗ</div>
          <div className="legend-item"><div className="legend-icon">P</div> Bãi đỗ công cộng</div>
        </div>
        <hr />
        <div className="legend-section">
          <span className="legend-section-title">Quy định giao thông</span>
          <div className="legend-item"><div className="legend-line solid-red" /> Cấm tuyệt đối</div>
          <div className="legend-item"><div className="legend-line solid-orange" /> Cấm theo giờ (đang áp dụng)</div>
          <div className="legend-item"><div className="legend-line dashed-orange" /> Cấm theo giờ (ngoài giờ)</div>
          <div className="legend-item"><div className="legend-line dashed-yellow" /> Hạn chế có điều kiện</div>
        </div>
        <hr />
        <div className="legend-section">
          <span className="legend-section-title">Mức phạt vi phạm</span>
          <div className="legend-item"><span className="legend-fine">Ô tô: 800K–1M VNĐ</span></div>
          <div className="legend-item"><span className="legend-fine">Xe máy: 400K–600K VNĐ</span></div>
        </div>
        <div className="legend-note">* Click vào đường để xem chi tiết quy định<br/>* Chọn loại xe để lọc khu vực hạn chế</div>
      </div>
    </div>
  );
}
