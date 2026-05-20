import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import useWebSocket from "./useWebSocket";
import LangSwitcher from "./components/LangSwitcher.jsx";
import ParkingLawPage from "./components/ParkingLawPage.jsx";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";
const HUE_CENTER = [107.58, 16.46];
const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || "";
const PARKING_LOT_SOURCE_ID = "smartparking-paid-lots";
const PARKING_LOT_FILL_LAYER_ID = "smartparking-paid-lots-fill";
const PARKING_LOT_OUTLINE_LAYER_ID = "smartparking-paid-lots-outline";
const PARKING_LOT_LABEL_LAYER_ID = "smartparking-paid-lots-label";
const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };

const MAP_STYLE = {
  version: 8,
  sources: {
    "osm-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  },
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  layers: [
    { id: "osm-raster", type: "raster", source: "osm-raster" }
  ]
};

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

const TRAVEL_SPEEDS = { walking: 83, motorbike: 500, car: 667 }; // meters per minute

function scoreParkingLot(lot, userPos, maxPrice, speed) {
  const distance = haversineMeters(userPos, { lat: lot.lat, lng: lot.lng });
  const travelMin = distance / speed;
  const distanceScore = Math.max(0, 1 - distance / 2000);
  const priceScore = maxPrice > 0 ? Math.max(0, 1 - (lot.pricePerHour || 0) / maxPrice) : 1;
  const availabilityScore = lot.capacity > 0 ? (lot.availableSlots || 0) / lot.capacity : 0;
  const travelScore = Math.max(0, 1 - travelMin / 30);
  const weights = { distance: 0.25, price: 0.25, availability: 0.30, travel: 0.20 };
  const score = +(weights.distance * distanceScore + weights.price * priceScore
    + weights.availability * availabilityScore + weights.travel * travelScore).toFixed(3);
  return { score, distance, travelMin: Math.round(travelMin) };
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [lots, setLots] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [restrictedZones, setRestrictedZones] = useState([]);
  const mapRef = useRef(null);
  const map = useRef(null);
  const userMarkerRef = useRef(null);
  const polygonClickHandlerRef = useRef(null);
  const polygonCursorHandlersRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const [showBooking, setShowBooking] = useState(false);
  const [selectedLot, setSelectedLot] = useState(null);
  const defaultStartDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const defaultStartTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [bookingForm, setBookingForm] = useState({
    plateNumber: "", phoneNumber: "", estimatedHours: 2, bookingVehicleType: "CAR",
    isScheduled: false, startDate: defaultStartDate(), startTime: defaultStartTime()
  });
  const [bookingResult, setBookingResult] = useState(null);
  const [bookingStep, setBookingStep] = useState("form");
  const [existingBooking, setExistingBooking] = useState(null);
  const [checkoutData, setCheckoutData] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [filters, setFilters] = useState({ search: "", maxPrice: 0, evOnly: false, availableOnly: true });
  const [showFilters, setShowFilters] = useState(false);

  const [userBookings, setUserBookings] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem("sp_token") || "");
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sp_user") || "null"); } catch (_e) { return null; }
  });
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ fullName: "", email: "", password: "", phone: "" });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [showLotList, setShowLotList] = useState(true);
  const [sortMode, setSortMode] = useState("score");
  const [travelMode, setTravelMode] = useState("walking");

  const [vehicleType, setVehicleType] = useState("CAR");
  const [userLocation, setUserLocation] = useState(null);
  const [showParkingLaw, setShowParkingLaw] = useState(false);

  useEffect(() => {
    document.title = t("appTitle");
  }, [t]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error("invalid_token");
        return res.json();
      })
      .then((user) => {
        const normalized = {
          id: user.id,
          fullName: user.full_name || user.fullName,
          email: user.email,
          role: user.role
        };
        setCurrentUser(normalized);
        localStorage.setItem("sp_user", JSON.stringify(normalized));
      })
      .catch(() => {
        localStorage.removeItem("sp_token");
        localStorage.removeItem("sp_user");
        setToken("");
        setCurrentUser(null);
      });
  }, [token]);

  useEffect(() => {
    if (!currentUser?.id || !token) {
      setUserBookings([]);
      return;
    }
    loadUserBookings();
  }, [currentUser?.id, token]);

  const ensureParkingLotLayers = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapInstance.isStyleLoaded()) return false;

    if (!mapInstance.getSource(PARKING_LOT_SOURCE_ID)) {
      mapInstance.addSource(PARKING_LOT_SOURCE_ID, {
        type: "geojson",
        data: EMPTY_FEATURE_COLLECTION
      });
    }

    if (!mapInstance.getLayer(PARKING_LOT_FILL_LAYER_ID)) {
      mapInstance.addLayer({
        id: PARKING_LOT_FILL_LAYER_ID,
        type: "fill",
        source: PARKING_LOT_SOURCE_ID,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["get", "hasActiveBooking"], false], "#2563eb",
            [">", ["to-number", ["get", "availableSlots"]], 0], "#22c55e",
            "#ef4444"
          ],
          "fill-opacity": 0.24
        }
      });
    }

    if (!mapInstance.getLayer(PARKING_LOT_OUTLINE_LAYER_ID)) {
      mapInstance.addLayer({
        id: PARKING_LOT_OUTLINE_LAYER_ID,
        type: "line",
        source: PARKING_LOT_SOURCE_ID,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["get", "hasActiveBooking"], false], "#1d4ed8",
            [">", ["to-number", ["get", "availableSlots"]], 0], "#16a34a",
            "#dc2626"
          ],
          "line-width": 3,
          "line-opacity": 0.95
        }
      });
    }

    if (!mapInstance.getLayer(PARKING_LOT_LABEL_LAYER_ID)) {
      mapInstance.addLayer({
        id: PARKING_LOT_LABEL_LAYER_ID,
        type: "symbol",
        source: PARKING_LOT_SOURCE_ID,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-font": ["Noto Sans Regular"],
          "text-anchor": "center",
          "text-allow-overlap": false,
          "text-ignore-placement": false
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#1e3a5f",
          "text-halo-width": 2
        }
      });
    }

    if (!polygonClickHandlerRef.current) {
      polygonClickHandlerRef.current = (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties || {};
        const lng = Number(props.lng ?? event.lngLat.lng);
        const lat = Number(props.lat ?? event.lngLat.lat);
        new maplibregl.Popup({ offset: 16 })
          .setLngLat([lng, lat])
          .setHTML(props.popupHtml || "")
          .addTo(mapInstance);
      };
      mapInstance.on("click", PARKING_LOT_FILL_LAYER_ID, polygonClickHandlerRef.current);
    }

    if (!polygonCursorHandlersRef.current) {
      const enter = () => { mapInstance.getCanvas().style.cursor = "pointer"; };
      const leave = () => { mapInstance.getCanvas().style.cursor = ""; };
      polygonCursorHandlersRef.current = { enter, leave };
      mapInstance.on("mouseenter", PARKING_LOT_FILL_LAYER_ID, enter);
      mapInstance.on("mouseleave", PARKING_LOT_FILL_LAYER_ID, leave);
    }

    return true;
  }, []);

  useEffect(() => {
    if (map.current || !mapRef.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE_URL || MAP_STYLE,
      center: HUE_CENTER,
      zoom: 14,
      attributionControl: false
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.current = mapInstance;

    mapInstance.on("load", () => {
      ensureParkingLotLayers();
      setMapReady(true);
    });

    return () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      polygonClickHandlerRef.current = null;
      polygonCursorHandlersRef.current = null;
      mapInstance.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [ensureParkingLotLayers]);

  const loadLots = useCallback(() =>
    fetch(`${API_BASE}/api/parking-lots`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setLots(Array.isArray(data) ? data : []);
        setLastUpdated(new Date().toLocaleTimeString(i18n.language === "vi" ? "vi-VN" : "en-US"));
      })
      .catch((err) => { console.error("[user-map] loadLots failed:", err); }), [i18n.language]);

  const loadRestricted = useCallback(() =>
    fetch(`${API_BASE}/api/restricted-zones`)
      .then((r) => r.json())
      .then((data) => {
        const feats = data.features || [];
        setRestrictedZones(feats);
      })
      .catch((err) => { console.error("[user-map] loadRestricted failed:", err); }), []);

  const handleWsMessage = useCallback((data) => {
    if (data.type === "slot_update") {
      setLots((prev) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((lot) =>
          lot.id === data.lotId
            ? { ...lot, availableSlots: data.availableSlots }
            : lot
        );
      });
      setLastUpdated(new Date().toLocaleTimeString(i18n.language === "vi" ? "vi-VN" : "en-US"));
    }
    if (data.type === "parking_lot_updated" || data.type === "parking_lot_deleted") {
      loadLots();
    }
  }, [i18n.language, loadLots]);

  const vehicleTypeLabelFn = (types) => {
    if (!types || types.length === 0) return t("vehicleTypesAll");
    const map = {
      CAR: t("vehicleTypeCar"),
      MOTORBIKE: t("vehicleTypeMotorbike"),
      BICYCLE: t("vehicleTypeBicycle"),
      TRUCK: t("vehicleTypeTruck"),
      BUS: t("vehicleTypeBus")
    };
    return types.map((vt) => map[vt] || vt).join(", ");
  };

  const renderRestrictedZones = () => {
    // Forbidden-road overlays stay hidden on the user map.
  };

  useEffect(() => {
    loadLots();
    loadRestricted();
    const timer = setInterval(loadLots, 5000);
    return () => clearInterval(timer);
  }, [loadLots, loadRestricted]);

  useWebSocket(handleWsMessage);

  useEffect(() => {
    if (restrictedZones.length > 0) {
      renderRestrictedZones(restrictedZones);
    }
  }, [restrictedZones]);

  const formatCurrency = (n) =>
    new Intl.NumberFormat(i18n.language, { style: "currency", currency: "VND", minimumFractionDigits: 0 }).format(n || 0);

  const activeBookingsByLotId = useMemo(
    () => new Map(
      userBookings
        .filter((b) => b.payment_status === "PAID" && !b.ended_at)
        .map((b) => [b.parking_lot_id, b])
    ),
    [userBookings]
  );
  const activeBookingLotIds = useMemo(
    () => new Set(activeBookingsByLotId.keys()),
    [activeBookingsByLotId]
  );

  useEffect(() => {
    if (!map.current || !mapReady) return;
    if (!ensureParkingLotLayers()) return;

    const features = lots
      .filter((l) => l.geometry && l.geometry.type === "Polygon")
      .map((l) => {
        const hasActiveBooking = activeBookingLotIds.has(l.id);
        const canOpenBooking = (l.availableSlots ?? 0) > 0 || hasActiveBooking;
        const hasPoint = Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng));
        const popupHtml = `
          <div style="min-width: 200px">
            <b style="font-size: 14px">${l.name}</b><br/>
            <span style="font-size: 11px; color: #666">${l.id}</span>
            <hr style="margin: 5px 0"/>
            ${t("mapPopupAvailable")}: <b>${l.availableSlots}</b> / ${t("mapPopupTotal")}: ${l.capacity}<br/>
            ${t("lotPrice")}: ${formatCurrency(l.pricePerHour || 0)}/h
            ${canOpenBooking ? `<button onclick="window.__openBooking('${l.id}')" style="margin-top:8px;width:100%;background:#2563eb;color:white;border:none;padding:6px;border-radius:4px;cursor:pointer">
              ${hasActiveBooking ? t("mapPopupManageBooking") : t("mapPopupBookNow")}
            </button>` : ""}
            ${hasPoint ? `<button onclick="window.__openDirections(${Number(l.lat)},${Number(l.lng)})" style="margin-top:4px;width:100%;background:#fff;color:#2563eb;border:1px solid #2563eb;padding:5px;border-radius:4px;cursor:pointer;font-size:12px">
              ${t("mapPopupDirections")}
            </button>` : ""}
          </div>
        `;
        return {
          type: "Feature",
          properties: {
            id: l.id,
            name: l.name,
            lat: l.lat,
            lng: l.lng,
            capacity: l.capacity,
            availableSlots: l.availableSlots,
            pricePerHour: l.pricePerHour,
            hasActiveBooking,
            popupHtml
          },
          geometry: l.geometry
        };
      });

    const source = map.current.getSource(PARKING_LOT_SOURCE_ID);
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }
  }, [lots, t, i18n.language, activeBookingLotIds, mapReady, ensureParkingLotLayers]);
  const checkProximity = useCallback(() => {
    // Parking-law warnings were moved off the map to keep the user view clean.
  }, []);

  useEffect(() => {
    window.__openBooking = (lotId) => {
      const lot = lots.find((l) => l.id === lotId);
      if (!lot) return;
      const existing = userBookings.find((b) => b.parking_lot_id === lotId && b.payment_status === "PAID" && !b.ended_at);
      if (existing) {
        setSelectedLot(lot);
        setExistingBooking(existing);
        setCheckoutData(null);
        setCheckoutLoading(false);
        setBookingStep("existing");
        setShowBooking(true);
      } else if (lot.availableSlots > 0) {
        setSelectedLot(lot);
        setBookingForm({ plateNumber: "", phoneNumber: "", estimatedHours: 2, bookingVehicleType: "CAR", isScheduled: false, startDate: defaultStartDate(), startTime: defaultStartTime() });
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
  }, [lots, userBookings]);

  const locateUser = () => {
    if (!map.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = coords.latitude;
        const lng = coords.longitude;
        if (userMarkerRef.current) {
          userMarkerRef.current.remove();
          userMarkerRef.current = null;
        }

        const el = document.createElement("div");
        el.className = "user-location-dot";
        userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .setPopup(new maplibregl.Popup({ offset: 14 }).setText(t("myLocation")))
          .addTo(map.current);
        userMarkerRef.current.togglePopup();

        map.current.flyTo({ center: [lng, lat], zoom: 16, essential: true });
        setUserLocation({ lat, lng });
        checkProximity(lat, lng);
      },
      (err) => {
        console.error("[user-map] geolocation failed:", err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };
  const requireAuth = () => {
    if (currentUser && token) return true;
    setAuthError(t("authLoginRequired"));
    setShowAuth(true);
    return false;
  };

  const submitAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : {
            fullName: authForm.fullName,
            email: authForm.email,
            password: authForm.password,
            phone: authForm.phone
          };
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.message || t("authErrorServer"));
        return;
      }
      localStorage.setItem("sp_token", data.token);
      localStorage.setItem("sp_user", JSON.stringify(data.user));
      setToken(data.token);
      setCurrentUser(data.user);
      setShowAuth(false);
      setAuthForm({ fullName: "", email: "", password: "", phone: "" });
    } catch (_e) {
      setAuthError(t("authErrorServer"));
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("sp_token");
    localStorage.removeItem("sp_user");
    setToken("");
    setCurrentUser(null);
    setUserBookings([]);
    setShowHistory(false);
  };

  const submitBooking = async () => {
    if (!selectedLot || !bookingForm.plateNumber || !requireAuth()) return;
    const res = await fetch(`${API_BASE}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        lotId: selectedLot.id,
        plateNumber: bookingForm.plateNumber,
        vehicleType: bookingForm.bookingVehicleType,
        phoneNumber: bookingForm.phoneNumber,
        estimatedHours: bookingForm.estimatedHours,
        ...(bookingForm.isScheduled ? { startTime: `${bookingForm.startDate}T${bookingForm.startTime}:00` } : {})
      })
    });
    const data = await res.json();
    if (data.success) {
      setBookingResult(data);
      setBookingStep("payment");
      const confirmRes = await fetch(`${API_BASE}/api/payments/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: data.bookingId, provider: "DIRECT" })
      });
      const confirmData = await confirmRes.json();
      if (confirmRes.ok) {
        setBookingResult((prev) => ({ ...prev, ...confirmData }));
        setBookingStep("qr");
        loadLots();
        loadUserBookings();
      } else {
        setBookingResult((prev) => ({ ...prev, error: confirmData.message || "Payment confirmation failed" }));
      }
    } else {
      alert(data.message || "Dat cho that bai");
    }
  };

  const submitCheckout = async () => {
    if (!existingBooking || !requireAuth()) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: existingBooking.id })
      });
      const data = await res.json();
      if (data.success) {
        setCheckoutData(data);
        loadLots();
        loadUserBookings();
      } else {
        alert(data.message || "Tra xe that bai");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      alert(t("authErrorServer"));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const loadUserBookings = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/me/bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUserBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[user-map] loadUserBookings failed:", err);
    }
  };

  const paymentStatusKey = (s) =>
    s === "PAID" ? "statusPaid" : s === "PENDING" ? "statusPending" : "statusFailed";

  const bookingStatusKey = (b) => b.ended_at ? "statusCompleted" : paymentStatusKey(b.payment_status);
  const bookingStatusClass = (b) => b.ended_at ? "COMPLETED" : b.payment_status;

  return (
    <div className="app-container">
      <div ref={mapRef} className="map-container" />

      <div className={`lot-list-panel ${showLotList ? "open" : "closed"}`}>
        <div className="lot-list-header" onClick={() => setShowLotList(!showLotList)}>
          <h3>{t("lotListTitle", { count: lots.filter((l) => l.availableSlots > 0).length })}</h3>
          <div className="lot-list-header-right" onClick={(e) => e.stopPropagation()}>
            {userLocation && (
              <>
                <div className="travel-mode-box">
                  <button className={`travel-mode-btn ${travelMode === "walking" ? "active" : ""}`}
                    onClick={() => setTravelMode("walking")} title={t("travelMode_walking")}>
                    <span className="travel-mode-icon">🚶</span>
                  </button>
                  <button className={`travel-mode-btn ${travelMode === "motorbike" ? "active" : ""}`}
                    onClick={() => setTravelMode("motorbike")} title={t("travelMode_motorbike")}>
                    <span className="travel-mode-icon">🏍</span>
                  </button>
                  <button className={`travel-mode-btn ${travelMode === "car" ? "active" : ""}`}
                    onClick={() => setTravelMode("car")} title={t("travelMode_car")}>
                    <span className="travel-mode-icon">🚗</span>
                  </button>
                </div>
                <select className="sort-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="score">{t("sortScore")}</option>
                  <option value="distance">{t("sortDistance")}</option>
                  <option value="price">{t("sortPrice")}</option>
                  <option value="availability">{t("sortAvailability")}</option>
                </select>
              </>
            )}
            <span className="lot-list-toggle">{showLotList ? "−" : "+"}</span>
          </div>
        </div>
        {showLotList && (
          <div className="lot-list-body">
            {lots.length === 0 ? (
              <p className="lot-list-empty">{t("lotListLoading")}</p>
            ) : (() => {
              const maxPrice = Math.max(...lots.map((l) => l.pricePerHour || 0), 1);
              const speed = TRAVEL_SPEEDS[travelMode];
              const decorateLot = (lot) => {
                const s = userLocation ? scoreParkingLot(lot, userLocation, maxPrice, speed) : { score: 0, distance: Infinity, travelMin: 0 };
                return { ...lot, _score: s.score, _distance: s.distance, _travelMin: s.travelMin };
              };
              const activeLots = lots
                .filter((l) => activeBookingLotIds.has(l.id))
                .map(decorateLot);
              const scored = lots
                .filter((l) => l.availableSlots > 0 && !activeBookingLotIds.has(l.id))
                .map((lot) => {
                  return decorateLot(lot);
                })
                .sort((a, b) => {
                  if (sortMode === "score" && userLocation) return b._score - a._score;
                  if (sortMode === "distance" && userLocation) return a._distance - b._distance;
                  if (sortMode === "price") return (a.pricePerHour || 0) - (b.pricePerHour || 0);
                  return (b.availableSlots / (b.capacity || 1)) - (a.availableSlots / (a.capacity || 1));
                });
              const visibleLots = [...activeLots, ...scored];
              return (
                <>
                  {visibleLots.length === 0 ? (
                    <p className="lot-list-empty">{t("lotListEmpty")}</p>
                  ) : visibleLots.map((lot, index) => {
                    const activeBooking = activeBookingsByLotId.get(lot.id);
                    const isActiveBookingLot = Boolean(activeBooking);
                    const isTopRecommendation = !isActiveBookingLot && userLocation && index === activeLots.length;
                    return (
                      <div key={lot.id} className={`lot-card ${isActiveBookingLot ? "active-booking" : ""}`}>
                        <div className="lot-card-info">
                          <div className="lot-card-name">{lot.name}</div>
                          {isActiveBookingLot && (
                            <div className="lot-card-active-booking">{t("activeBookingBadge")}</div>
                          )}
                          {isTopRecommendation && (
                            <div className="lot-card-recommended">{t("recommendedBadge")}</div>
                          )}
                          <div className="lot-card-meta">
                            <span className={`lot-card-slots ${lot.availableSlots <= 0 ? "full" : ""}`}>
                              {t("lotSlots", { count: `${lot.availableSlots}/${lot.capacity}` })}
                            </span>
                            <span className="lot-card-price">{formatCurrency(lot.pricePerHour)}/h</span>
                          </div>
                          <div className="lot-card-extra">
                            {userLocation && (
                              <>
                                <span className="lot-card-distance">{lot._distance < 1000 ? `${Math.round(lot._distance)}m` : `${(lot._distance / 1000).toFixed(1)}km`}</span>
                                <span className="lot-card-walk">{t("travelTime", { mode: t(`travelMode_${travelMode}`), minutes: lot._travelMin })}</span>
                              </>
                            )}
                            {lot.evSupported && <span className="lot-card-ev">{t("lotEv")}</span>}
                          </div>
                          {userLocation && lot._score > 0 && (
                            <div className="lot-score-bar">
                              <div className="lot-score-fill" style={{ width: `${(lot._score * 100).toFixed(0)}%` }} />
                              <span className="lot-score-text">{t("scoreLabel")}: {(lot._score * 100).toFixed(0)}</span>
                            </div>
                          )}
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const existing = activeBookingsByLotId.get(lot.id);
                            if (existing) {
                              setSelectedLot(lot);
                              setExistingBooking(existing);
                              setCheckoutData(null);
                              setCheckoutLoading(false);
                              setBookingStep("existing");
                              setShowBooking(true);
                            } else {
                              setSelectedLot(lot);
                              setBookingForm({ plateNumber: "", phoneNumber: "", estimatedHours: 2, bookingVehicleType: "CAR", isScheduled: false, startDate: defaultStartDate(), startTime: defaultStartTime() });
                              setBookingResult(null);
                              setExistingBooking(null);
                              setBookingStep("form");
                              setShowBooking(true);
                            }
                          }}
                        >
                          {isActiveBookingLot ? t("btnManageBooking") : t("btnBookNow")}
                        </button>
                      </div>
                    );
                  })}


                </>
              );
            })()}
          </div>
        )}
      </div>

      <div className="top-header">
        <div className="header-left">
          <h1>{t("headerTitle")}</h1>
          <span className="last-update">{t("updatedAt")}: {lastUpdated}</span>
        </div>
        <div className="header-right">
          <select
            className="vehicle-select"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            title={i18n.language === "en" ? "Select vehicle type" : "Chọn loại phương tiện"}
          >
            <option value="CAR">{t("vehicleCar")}</option>
            <option value="MOTORBIKE">{t("vehicleMotorbike")}</option>
            <option value="TRUCK">{t("vehicleTruck")}</option>
            <option value="BUS">{t("vehicleBus")}</option>
            <option value="ALL">{t("vehicleAll")}</option>
          </select>
          <button className="btn btn-sm btn-outline" onClick={() => setShowFilters(!showFilters)}>{t("btnFilter")}</button>
          <button className="btn btn-sm btn-outline" onClick={locateUser}>{t("btnMyLocation")}</button>
          <button className="btn btn-sm btn-outline" onClick={() => setShowParkingLaw(true)}>{t("btnTrafficLaw")}</button>
          <button className="btn btn-sm btn-outline" onClick={() => {
            if (!requireAuth()) return;
            loadUserBookings();
            setShowHistory(!showHistory);
          }}>{t("btnHistory")}</button>
          {currentUser ? (
            <>
              <span className="auth-user-chip">{currentUser.fullName || currentUser.email}</span>
              <button className="btn btn-sm btn-outline" onClick={logout}>{t("btnLogout")}</button>
            </>
          ) : (
            <button className="btn btn-sm btn-outline" onClick={() => { setAuthMode("login"); setAuthError(""); setShowAuth(true); }}>
              {t("btnLogin")}
            </button>
          )}
          <LangSwitcher />
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <input type="text" placeholder={t("filterSearchPlaceholder")} value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} className="filter-input" />
          <select value={filters.maxPrice}
            onChange={(e) => setFilters((f) => ({ ...f, maxPrice: Number(e.target.value) }))} className="filter-select">
            <option value="0">{t("filterAllPrice")}</option>
            <option value="5000">{t("filterUnder5k")}</option>
            <option value="10000">{t("filterUnder10k")}</option>
            <option value="20000">{t("filterUnder20k")}</option>
          </select>
          <label className="filter-check">
            <input type="checkbox" checked={filters.availableOnly} onChange={(e) => setFilters((f) => ({ ...f, availableOnly: e.target.checked }))} />
            {t("filterAvailable")}
          </label>
          <label className="filter-check">
            <input type="checkbox" checked={filters.evOnly} onChange={(e) => setFilters((f) => ({ ...f, evOnly: e.target.checked }))} />
            {t("filterEv")}
          </label>
          <span className="filter-count">{t("filterCount", { count: lots.filter((l) => {
            if (activeBookingLotIds.has(l.id)) return true;
            if (filters.availableOnly && l.availableSlots <= 0) return false;
            if (filters.evOnly && !l.evSupported) return false;
            if (filters.maxPrice > 0 && l.pricePerHour > filters.maxPrice) return false;
            if (filters.search) { const q = filters.search.toLowerCase(); if (!l.name.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false; }
            return true;
          }).length })}</span>
        </div>
      )}

      {showParkingLaw && (
        <ParkingLawPage onClose={() => setShowParkingLaw(false)} />
      )}

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
                    <span className="lot-badge available">{t("lotAvailableSlots", { available: selectedLot.availableSlots, total: selectedLot.capacity })}</span>
                    {selectedLot.evSupported && <span className="lot-badge ev">{t("lotEv")}</span>}
                  </div>
                  <div className="form-group">
                    <label>{t("labelVehicleType")}</label>
                    <div className="booking-mode-toggle">
                      <button
                        type="button"
                        className={`toggle-option ${bookingForm.bookingVehicleType === "MOTORBIKE" ? "active" : ""}`}
                        onClick={() => setBookingForm((f) => ({ ...f, bookingVehicleType: "MOTORBIKE" }))}
                      >{t("vehicleTypeMotorbike")} — {formatCurrency(selectedLot.pricePerHourMotorbike ?? selectedLot.pricePerHour ?? 2000)}/h</button>
                      <button
                        type="button"
                        className={`toggle-option ${bookingForm.bookingVehicleType === "CAR" ? "active" : ""}`}
                        onClick={() => setBookingForm((f) => ({ ...f, bookingVehicleType: "CAR" }))}
                      >{t("vehicleTypeCar")} — {formatCurrency(selectedLot.pricePerHour)}/h</button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t("labelPlateNumber")} <span className="required">{t("required")}</span></label>
                    <input type="text" placeholder="VD: 75A-12345" value={bookingForm.plateNumber}
                      onChange={(e) => setBookingForm((f) => ({ ...f, plateNumber: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>{t("labelPhoneNumber")}</label>
                    <input type="tel" placeholder="VD: 0905123456" value={bookingForm.phoneNumber}
                      onChange={(e) => setBookingForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>{t("labelEstimatedTime")}</label>
                    <div className="booking-mode-toggle">
                      <button
                        type="button"
                        className={`toggle-option ${!bookingForm.isScheduled ? "active" : ""}`}
                        onClick={() => setBookingForm((f) => ({ ...f, isScheduled: false }))}
                      >{t("bookNow")}</button>
                      <button
                        type="button"
                        className={`toggle-option ${bookingForm.isScheduled ? "active" : ""}`}
                        onClick={() => setBookingForm((f) => ({ ...f, isScheduled: true }))}
                      >{t("bookLater")}</button>
                    </div>
                  </div>
                  {bookingForm.isScheduled && (
                    <div className="form-row-split">
                      <div className="form-group">
                        <label>{t("labelArrivalDate")}</label>
                        <input type="date" value={bookingForm.startDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setBookingForm((f) => ({ ...f, startDate: e.target.value }))} />
                      </div>
                      <div className="form-group">
                        <label>{t("labelArrivalTime")}</label>
                        <input type="time" value={bookingForm.startTime}
                          onChange={(e) => setBookingForm((f) => ({ ...f, startTime: e.target.value }))} />
                      </div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>{t("labelEstimatedTime")}</label>
                    <select value={bookingForm.estimatedHours} onChange={(e) => setBookingForm((f) => ({ ...f, estimatedHours: Number(e.target.value) }))}>
                      {(() => {
                        const p = bookingForm.bookingVehicleType === "MOTORBIKE"
                          ? (selectedLot.pricePerHourMotorbike ?? selectedLot.pricePerHour ?? 2000)
                          : selectedLot.pricePerHour;
                        return <>
                          <option value="1">{t("duration1h")} - {formatCurrency(p)}</option>
                          <option value="2">{t("duration2h")} - {formatCurrency(p * 2)}</option>
                          <option value="4">{t("duration4h")} - {formatCurrency(p * 4)}</option>
                          <option value="8">{t("duration8h")} - {formatCurrency(p * 8)}</option>
                          <option value="24">{t("duration24h")} - {formatCurrency(p * 24)}</option>
                        </>;
                      })()}
                    </select>
                  </div>
                  <div className="total-row">
                    <span>{t("totalAmount")}:</span>
                    <span className="total-amount">{(() => {
                      const pph = bookingForm.bookingVehicleType === "MOTORBIKE"
                        ? (selectedLot.pricePerHourMotorbike ?? selectedLot.pricePerHour ?? 2000)
                        : selectedLot.pricePerHour;
                      return formatCurrency(pph * bookingForm.estimatedHours);
                    })()}</span>
                  </div>
                  <button className="btn btn-primary btn-block" onClick={submitBooking} disabled={!bookingForm.plateNumber}>
                    {t("btnConfirmBooking")}
                  </button>
                </>
              )}

              {bookingStep === "payment" && bookingResult && (
                <div className="payment-section">
                  <div className="booking-success">
                    <div className="success-icon">&#10003;</div>
                    <h3>{t("bookingSuccess")}</h3>
                    <p>{t("bookingIdLabel")}: <b>{bookingResult.bookingId}</b></p>
                    <p>{t("bookingAmountLabel")}: <b>{formatCurrency(bookingResult.amount)}</b></p>
                  </div>
                  <p className="payment-processing">{t("paymentProcessing")}</p>
                </div>
              )}

              {bookingStep === "existing" && existingBooking && selectedLot && (
                <div className="existing-booking-section">
                  {checkoutData ? (
                    <>
                      <div className="booking-success">
                        <div className="success-icon large">&#10003;</div>
                        <h3>{t("checkoutSuccess")}</h3>
                      </div>
                      <div className="existing-booking-info">
                        <div className="eb-row"><span>{t("checkoutPlateNumber")}:</span> <b>{checkoutData.plateNumber}</b></div>
                        <div className="eb-row"><span>{t("checkoutLotName")}:</span> <b>{checkoutData.lotName}</b></div>
                        <div className="eb-row"><span>{t("checkoutEnterTime")}:</span> <b>{new Date(checkoutData.started_at).toLocaleString(i18n.language)}</b></div>
                        <div className="eb-row"><span>{t("checkoutExitTime")}:</span> <b>{new Date(checkoutData.ended_at).toLocaleString(i18n.language)}</b></div>
                        <div className="eb-row"><span>{t("checkoutEstimated")}:</span> <b>{checkoutData.estimatedHours} {i18n.language === "en" ? "hours" : "giờ"}</b></div>
                        <div className="eb-row"><span>{t("checkoutActual")}:</span> <b>{checkoutData.actualHours.toFixed(2)} {i18n.language === "en" ? "hours" : "giờ"}</b></div>
                        <div className="eb-row"><span>{t("checkoutPaid")}:</span> <b>{formatCurrency(checkoutData.amount)}</b></div>
                        <div className="eb-row"><span>{t("checkoutPaidDurationCost")}:</span> <b>{formatCurrency(checkoutData.paidDurationCost)}</b></div>
                        {Number(checkoutData.lateMinutes || 0) > 0 && (
                          <div className="eb-row" style={{ color: "#dc2626" }}>
                            <span>{t("checkoutLateMinutes")}:</span> <b>{checkoutData.lateMinutes} {i18n.language === "en" ? "minutes" : "phút"}</b>
                          </div>
                        )}
                        {checkoutData.extraCharge > 0 ? (
                          <>
                            <div className="eb-row" style={{ color: "#dc2626" }}>
                              <span>{t("checkoutExtraCharge")}:</span> <b>+{formatCurrency(checkoutData.extraCharge)}</b>
                            </div>
                            <div className="eb-row" style={{ fontWeight: 700, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                              <span>{t("checkoutTotal")}:</span> <b style={{ color: "#dc2626" }}>{formatCurrency(checkoutData.totalCost)}</b>
                            </div>
                          </>
                        ) : (
                          <p style={{ marginTop: 10, color: "#16a34a", fontWeight: 600, textAlign: "center" }}>
                            {t("checkoutThankYou")}
                          </p>
                        )}
                      </div>
                      <button className="btn btn-primary btn-block" onClick={() => { setShowBooking(false); }}>
                        {t("btnClose")}
                      </button>
                    </>
                  ) : checkoutLoading ? (
                    <div style={{ textAlign: "center", padding: "24px" }}>
                      <p style={{ color: "#6b7280", fontSize: "14px" }}>{t("checkoutProcessing")}</p>
                    </div>
                  ) : (
                    <>
                      <div className="booking-success">
                        <div className="success-icon large">&#128274;</div>
                        <h3>{t("alreadyBookedTitle")}</h3>
                      </div>
                      <div className="existing-booking-info">
                        <div className="eb-row"><span>{t("alreadyBookedId")}:</span> <b>{existingBooking.id}</b></div>
                        <div className="eb-row"><span>{t("checkoutPlateNumber")}:</span> <b style={{ fontSize: "18px", color: "#dc2626" }}>{existingBooking.plate_number}</b></div>
                        <div className="eb-row"><span>{t("checkoutLotName")}:</span> <b>{selectedLot.name}</b></div>
                        <div className="eb-row"><span>{t("alreadyBookedStatus")}:</span> <span className="status-badge PAID">{t("statusPaid")}</span></div>
                        <div className="eb-row"><span>{t("bookingAmountLabel")}:</span> <b>{formatCurrency(existingBooking.amount)}</b></div>
                      </div>
                      {existingBooking.exit_qr_code_token && (
                        <>
                          <p style={{ marginTop: 12, fontWeight: 700, color: "#dc2626" }}>{t("qrExitLabel")}</p>
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(existingBooking.exit_qr_code_token)}`} alt="Exit QR" className="qr-image" style={{ width: 240, height: 240, borderColor: "#dc2626" }} />
                          <p className="qr-note" style={{ marginTop: 8, color: "#dc2626" }}>{t("qrExitNote")}</p>
                        </>
                      )}
                      {existingBooking.qr_code_token && (
                        <details style={{ marginTop: 10, textAlign: "left" }}>
                          <summary style={{ cursor: "pointer", fontWeight: 600, color: "#2563eb" }}>{t("qrEntryLabel")}</summary>
                          <div style={{ marginTop: 8, textAlign: "center" }}>
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(existingBooking.qr_code_token)}`} alt="Entry QR" className="qr-image" style={{ width: 180, height: 180 }} />
                            <p className="qr-note" style={{ marginTop: 8 }}>{t("qrEntryNote")}</p>
                          </div>
                        </details>
                      )}
                      <button
                        className="btn btn-outline-dark btn-block"
                        onClick={() => { window.location.href = `http://localhost:5176/booking/?bookingId=${existingBooking.id}`; }}
                        style={{ marginBottom: 8 }}
                      >
                        {t("btnViewBookingDetails")}
                      </button>
                      <button className="btn btn-danger btn-block" onClick={submitCheckout} style={{ marginBottom: 8 }}>
                        {t("btnCheckout")}
                      </button>
                      <button className="btn btn-outline-dark btn-block" onClick={() => { setShowBooking(false); }}>
                        {t("btnClose")}
                      </button>
                    </>
                  )}
                </div>
              )}

              {bookingStep === "qr" && bookingResult?.qrDataUrl && (
                <div className="qr-result-section">
                  <div className="success-icon large">&#10003;</div>
                  <h3>{t("paymentSuccess")}</h3>
                  <p>{t("qrEntryCode")}:</p>
                  <img src={bookingResult.exitQrDataUrl || bookingResult.qrDataUrl} alt="Exit QR" className="qr-image" />
                  <div className="qr-info">
                    <p>{t("bookingIdLabel")}: <b>{bookingResult.bookingId}</b></p>
                    <p>{t("checkoutPlateNumber")}: <b>{bookingForm.plateNumber}</b></p>
                    <p>{t("checkoutLotName")}: <b>{selectedLot.name}</b></p>
                    <p className="qr-note">{t("qrExitNote")}</p>
                    {bookingResult.qrDataUrl && bookingResult.exitQrDataUrl && (
                      <details style={{ marginTop: 10, textAlign: "left" }}>
                        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{t("qrEntryLabel")}</summary>
                        <div style={{ marginTop: 8, textAlign: "center" }}>
                          <img src={bookingResult.qrDataUrl} alt="Entry QR" className="qr-image" style={{ width: 180, height: 180 }} />
                          <p className="qr-note" style={{ marginTop: 8 }}>{t("qrEntryNote")}</p>
                        </div>
                      </details>
                    )}
                  </div>
                  <button className="btn btn-primary btn-block" onClick={() => { setShowBooking(false); }}>
                    {t("btnClose")}
                  </button>
                  <button
                    className="btn btn-outline-dark btn-block"
                    onClick={() => { window.location.href = `http://localhost:5176/booking/?bookingId=${bookingResult.bookingId}`; }}
                  >
                    {t("btnViewBookingDetails")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{authMode === "login" ? t("authLogin") : t("authRegister")}</h2>
              <button className="modal-close" onClick={() => setShowAuth(false)}>x</button>
            </div>
            <form className="modal-body" onSubmit={submitAuth}>
              {authError && <div className="auth-error-msg">{authError}</div>}
              {authMode === "register" && (
                <div className="form-group">
                  <label>{t("authFullName")}</label>
                  <input value={authForm.fullName} onChange={(e) => setAuthForm((f) => ({ ...f, fullName: e.target.value }))} required />
                </div>
              )}
              <div className="form-group">
                <label>{t("authEmail")}</label>
                <input type="email" value={authForm.email} onChange={(e) => setAuthForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>{t("authPassword")}</label>
                <input type="password" value={authForm.password} onChange={(e) => setAuthForm((f) => ({ ...f, password: e.target.value }))} required />
              </div>
              {authMode === "register" && (
                <div className="form-group">
                  <label>{t("authPhone")}</label>
                  <input value={authForm.phone} onChange={(e) => setAuthForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              )}
              <button className="btn btn-primary btn-block" disabled={authLoading}>
                {authLoading ? t("authProcessing") : (authMode === "login" ? t("authLogin") : t("authRegister"))}
              </button>
              <button
                type="button"
                className="auth-toggle"
                onClick={() => {
                  setAuthMode((mode) => mode === "login" ? "register" : "login");
                  setAuthError("");
                }}
              >
                {authMode === "login" ? t("authNoAccount") : t("authHasAccount")}
              </button>
            </form>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t("historyTitle")}</h2>
              <button className="modal-close" onClick={() => setShowHistory(false)}>x</button>
            </div>
            <div className="modal-body">
              {userBookings.length === 0 ? (
                <p className="empty-text">{t("historyEmpty")}</p>
              ) : (
                <div className="history-list">
                  {userBookings.map((b) => (
                    <div key={b.id} className="history-item">
                      <div className="history-main">
                        <b>{b.lot_name}</b>
                        <span className={`status-badge ${bookingStatusClass(b)}`}>{t(bookingStatusKey(b))}</span>
                      </div>
                      <div className="history-detail">
                        {t("historyPlateLabel")}: {b.plate_number} | {formatCurrency(b.amount)} | {new Date(b.created_at).toLocaleString(i18n.language)}
                      </div>
                      <div className="history-actions">
                        <button
                          className="btn btn-sm btn-outline-dark"
                          onClick={() => { window.location.href = `http://localhost:5176/booking/?bookingId=${b.id}`; }}
                        >
                          {t("btnViewBookingDetails")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="legend enhanced">
        <h4>{t("legendTitle")}</h4>
        <div className="legend-section">
          <span className="legend-section-title">{t("legendParkingSection")}</span>
          <div className="legend-item"><div className="legend-dot green" /> {t("legendAvailable")}</div>
          <div className="legend-item"><div className="legend-dot red" /> {t("legendFull")}</div>
        </div>
      </div>

      <button className="booking-fab" onClick={() => setShowLotList((v) => !v)} title={t("fabTitle")}>
        <span className="booking-fab-icon">🚗</span>
        <span className="booking-fab-label">{t("fabLabel")}</span>
      </button>
    </div>
  );
}







