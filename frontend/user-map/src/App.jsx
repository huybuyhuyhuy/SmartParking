import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import useWebSocket from "./useWebSocket";
import LangSwitcher from "./components/LangSwitcher.jsx";
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
  const layerGroup = useRef(null);
  const restrictedLayer = useRef(null);
  const polygonLayer = useRef(null);
  const userMarkerRef = useRef(null);
  const parkingLayer = useRef(null);

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
  const [warnings, setWarnings] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [showTrafficPanel, setShowTrafficPanel] = useState(false);
  const [locationRules, setLocationRules] = useState([]);
  const [nearbyParking, setNearbyParking] = useState([]);

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
        setLastUpdated(new Date().toLocaleTimeString(i18n.language === "vi" ? "vi-VN" : "en-US"));
      })
      .catch((err) => { console.error("[user-map] loadLots failed:", err); }), [i18n.language]);

  const loadRestricted = useCallback(() =>
    fetch(`${API_BASE}/api/restricted-zones`)
      .then((r) => r.json())
      .then((data) => {
        const feats = data.features || [];
        setRestrictedZones(feats);
        try { renderRestrictedZones(feats); } catch (err) { console.error("[user-map] renderRestrictedZones failed:", err); }
        try { renderParkingPoints(feats); } catch (err) { console.error("[user-map] renderParkingPoints failed:", err); }
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
  }, [i18n.language]);

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
    if (type === "PARKING") return t("zoneLabelParking");
    if (type === "ABSOLUTE_BAN") return t("zoneLabelAbsoluteBan");
    if ((type === "TIME_RESTRICTED" || type === "VEHICLE_RESTRICTED") && nowRestricted) return t("zoneLabelActiveBan");
    if (type === "TIME_RESTRICTED") return t("zoneLabelTimeBan");
    if (type === "VEHICLE_RESTRICTED") return t("zoneLabelVehicleRestricted");
    return t("zoneLabelConditional");
  };

  const getZoneLabelColor = (feature) => {
    const type = feature.properties.restriction_type;
    const timeRanges = feature.properties.time_ranges || [];
    const nowRestricted = timeRanges.some((r) => isInTimeRange(r));
    if (type === "PARKING") return "#16a34a";
    if (type === "ABSOLUTE_BAN" || ((type === "TIME_RESTRICTED" || type === "VEHICLE_RESTRICTED") && nowRestricted)) return "#dc2626";
    return "#d97706";
  };

  const vehicleTypeLabelFn = (types) => {
    if (!types || types.length === 0) return t("vehicleTypesAll");
    const map = { CAR: t("vehicleTypeCar"), MOTORBIKE: t("vehicleTypeMotorbike"), TRUCK: t("vehicleTypeTruck"), BUS: t("vehicleTypeBus") };
    return types.map((vt) => map[vt] || vt).join(", ");
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
              ${nowRestricted ? `<div class="zone-alert-active">${t("zoneAlertActive")}</div>` : ''}
              <p class="zone-desc">${feature.properties.description}</p>
              <div class="zone-details">
                <div class="zone-detail-row"><span>${t("zoneRule")}:</span><span>${feature.properties.rules}</span></div>
                <div class="zone-detail-row"><span>${t("zoneVehicles")}:</span><span>${vehicleTypeLabelFn(vehicleTypes)}</span></div>
                ${timeRanges.length > 0 ? `<div class="zone-detail-row"><span>${t("zoneBanHours")}:</span><span>${timeRanges.join(", ")}</span></div>` : ""}
                ${feature.properties.fine ? `<div class="zone-detail-row"><span>${t("zoneFine")}:</span><span class="fine">${feature.properties.fine}</span></div>` : ""}
                <div class="zone-detail-row"><span>${t("zoneArea")}:</span><span>${feature.properties.area || t("zoneCenter")}</span></div>
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
      const parkingType = feature.properties.parking_type === "mall" ? t("parkingTypeMall") : t("parkingTypePublic");
      L.marker([lat, lng], { icon })
        .bindPopup(`
          <div class="zone-popup">
            <div class="zone-popup-header" style="border-left: 4px solid #16a34a">
              <span class="zone-badge" style="background:#16a34a;color:white">${t("zoneLabelParking")}</span>
              <b class="zone-name">${feature.properties.name}</b>
            </div>
            <p class="zone-desc">${feature.properties.description}</p>
            <div class="zone-details">
              <div class="zone-detail-row"><span>${t("lotPrice")}:</span><span class="fine">${feature.properties.price || t("parkingPriceContact")}</span></div>
              <div class="zone-detail-row"><span>${i18n.language === "en" ? "Type" : "Loại"}:</span><span>${parkingType}</span></div>
            </div>
            <button class="popup-nav-btn" onclick="window.__openDirections(${lat},${lng})">${t("btnDirectionToHere")}</button>
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

  useWebSocket(handleWsMessage);

  useEffect(() => {
    if (restrictedZones.length > 0) {
      renderRestrictedZones(restrictedZones);
    }
  }, [vehicleType, t]);

  const formatCurrency = (n) =>
    new Intl.NumberFormat(i18n.language, { style: "currency", currency: "VND", minimumFractionDigits: 0 }).format(n || 0);

  const activeBookingLotIds = useMemo(
    () => new Set(userBookings.filter((b) => b.payment_status === "PAID" && !b.ended_at).map((b) => b.parking_lot_id)),
    [userBookings]
  );

  useEffect(() => {
    if (!map.current || !layerGroup.current) return;
    layerGroup.current.clearLayers();

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
      const availableText = lot.availableSlots > 0
        ? `${t("mapPopupAvailable")}: ${lot.availableSlots}`
        : t("mapPopupFull");
      const marker = L.circleMarker([lot.lat, lot.lng], {
        radius: 10, fillColor: color, color: "#fff", weight: 2, opacity: 1, fillOpacity: 0.8
      });
      marker.bindPopup(`
        <div style="min-width: 180px">
          <b style="font-size: 14px">${lot.name}</b><br/>
          <span style="font-size: 11px; color: #666">${lot.id}</span>
          <hr style="margin: 5px 0"/>
          <span style="color: ${color}; font-weight: bold">
            ${availableText}
          </span> / ${t("mapPopupTotal")}: ${lot.capacity}<br/>
          ${t("lotPrice")}: ${formatCurrency(lot.pricePerHour)}/h<br/>
          ${lot.evSupported ? `<span style="color:#2563eb;font-size:11px">${t("mapPopupEv")}</span><br/>` : ''}
          <button onclick="window.__openBooking('${lot.id}')" style="margin-top:8px;width:100%;background:#2563eb;color:white;border:none;padding:6px;border-radius:4px;cursor:pointer">
            ${activeBookingLotIds.has(lot.id) ? t("mapPopupViewQr") : t("mapPopupBookNow")}
          </button>
          ${lot.availableSlots > 0 ? `<button onclick="window.__openDirections(${lot.lat},${lot.lng})" style="margin-top:4px;width:100%;background:#fff;color:#2563eb;border:1px solid #2563eb;padding:5px;border-radius:4px;cursor:pointer;font-size:12px">
            ${t("mapPopupDirections")}
          </button>` : ''}
        </div>
      `);
      marker.addTo(layerGroup.current);
    }
  }, [lots, filters, t, i18n.language, activeBookingLotIds]);

  useEffect(() => {
    if (!map.current) return;
    if (polygonLayer.current) { polygonLayer.current.remove(); polygonLayer.current = null; }

    const features = lots
      .filter((l) => l.geometry && l.geometry.type === "Polygon")
      .map((l) => ({
        type: "Feature",
        properties: { id: l.id, name: l.name, availableSlots: l.availableSlots, pricePerHour: l.pricePerHour },
        geometry: l.geometry
      }));

    if (!features.length) return;

    polygonLayer.current = L.geoJSON(
      { type: "FeatureCollection", features },
      {
        style: (f) => {
          const available = (f?.properties?.availableSlots ?? 0) > 0;
          return {
            color: available ? "#16a34a" : "#dc2626",
            weight: 3,
            opacity: 0.9,
            fillOpacity: 0.2,
            fillColor: available ? "#22c55e" : "#ef4444",
            dashArray: null
          };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          layer.bindPopup(`
            <div style="min-width: 200px">
              <b style="font-size: 14px">${p.name}</b><br/>
              <span style="font-size: 11px; color: #666">${p.id}</span>
              <hr style="margin: 5px 0"/>
              ${t("mapPopupAvailable")}: <b>${p.availableSlots}</b><br/>
              ${t("lotPrice")}: ${formatCurrency(p.pricePerHour || 0)}/h
            </div>
          `);
          layer.bindTooltip(p.name, { permanent: true, direction: "center", className: "polygon-label" });
        }
      }
    ).addTo(map.current);
  }, [lots, t, i18n.language]);

  const checkProximity = useCallback((lat, lng) => {
    if (!restrictedZones.length) return;
    const userPos = { lat, lng };
    const newWarnings = [];
    const matchingRules = [];

    for (const zone of restrictedZones) {
      const props = zone.properties;
      if (props.restriction_type === "PARKING") continue;

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

    // Score and rank nearby lots from live data
    const maxPrice = Math.max(...lots.map((l) => l.pricePerHour || 0), 1);
    const speed = TRAVEL_SPEEDS[travelMode];
    const ranked = lots
      .filter((l) => l.availableSlots > 0)
      .map((lot) => {
        const s = scoreParkingLot(lot, userPos, maxPrice, speed);
        return { ...lot, _score: s.score, _distance: s.distance, _travelMin: s.travelMin };
      })
      .filter((l) => l._distance < 2000)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    setLocationRules(matchingRules);
    setNearbyParking(ranked);
  }, [restrictedZones, vehicleType, lots, travelMode]);

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
    if (!map.current) return;
    map.current.locate({ setView: true, maxZoom: 16 });
    map.current.once("locationfound", (e) => {
      const { lat, lng } = e.latlng;
      if (userMarkerRef.current) map.current.removeLayer(userMarkerRef.current);
      userMarkerRef.current = L.marker([lat, lng], {
        icon: L.divIcon({ className: "user-marker", html: '<div style="width:16px;height:16px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(37,99,235,0.6)"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
      }).addTo(map.current).bindPopup(t("myLocation")).openPopup();
      setUserLocation({ lat, lng });
      checkProximity(lat, lng);
    });
  };

  const dismissWarning = (id) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingId: data.bookingId, provider: "DIRECT", status: "PAID" })
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
              const scored = lots
                .filter((l) => l.availableSlots > 0)
                .map((lot) => {
                  const s = userLocation ? scoreParkingLot(lot, userLocation, maxPrice, speed) : { score: 0, distance: Infinity, travelMin: 0 };
                  return { ...lot, _score: s.score, _distance: s.distance, _travelMin: s.travelMin };
                })
                .sort((a, b) => {
                  if (sortMode === "score" && userLocation) return b._score - a._score;
                  if (sortMode === "distance" && userLocation) return a._distance - b._distance;
                  if (sortMode === "price") return (a.pricePerHour || 0) - (b.pricePerHour || 0);
                  return (b.availableSlots / (b.capacity || 1)) - (a.availableSlots / (a.capacity || 1));
                });
              if (scored.length === 0) return <p className="lot-list-empty">{t("lotListEmpty")}</p>;
              return scored.map((lot, index) => (
                <div key={lot.id} className="lot-card">
                  <div className="lot-card-info">
                    <div className="lot-card-name">{lot.name}</div>
                    {userLocation && index === 0 && (
                      <div className="lot-card-recommended">{t("recommendedBadge")}</div>
                    )}
                    <div className="lot-card-meta">
                      <span className="lot-card-slots">{t("lotSlots", { count: `${lot.availableSlots}/${lot.capacity}` })}</span>
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
                      const existing = userBookings.find((b) => b.parking_lot_id === lot.id && b.payment_status === "PAID" && !b.ended_at);
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
                    {userBookings.some((b) => b.parking_lot_id === lot.id && b.payment_status === "PAID" && !b.ended_at) ? t("btnViewQr") : t("btnBookNow")}
                  </button>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      <div className="warning-toast-container">
        {warnings.map((w) => (
          <div key={w.id} className={`warning-toast ${w.type}`}>
            <div className="warning-toast-header">
              <span className="warning-toast-icon">{w.type === "danger" ? t("warningDanger") : t("warningInfo")}</span>
              <span className="warning-toast-msg">{w.msg}</span>
              <button className="warning-toast-close" onClick={() => dismissWarning(w.id)}>x</button>
            </div>
            {w.detail && <div className="warning-toast-detail">{w.detail}</div>}
            {w.fine && <div className="warning-toast-fine">{t("warningFine")}: {w.fine}</div>}
          </div>
        ))}
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
          <button className="btn btn-sm btn-outline" onClick={() => {
            if (userLocation) {
              checkProximity(userLocation.lat, userLocation.lng);
              setShowTrafficPanel(!showTrafficPanel);
            } else {
              locateUser();
            }
          }}>{t("btnTrafficLaw")}</button>
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
            if (filters.availableOnly && l.availableSlots <= 0) return false;
            if (filters.evOnly && !l.evSupported) return false;
            if (filters.maxPrice > 0 && l.pricePerHour > filters.maxPrice) return false;
            if (filters.search) { const q = filters.search.toLowerCase(); if (!l.name.toLowerCase().includes(q) && !l.id.toLowerCase().includes(q)) return false; }
            return true;
          }).length })}</span>
        </div>
      )}

      {showTrafficPanel && (
        <div className="traffic-panel">
          <div className="traffic-panel-header">
            <h3>{t("trafficPanelTitle")}</h3>
            <button className="modal-close" onClick={() => setShowTrafficPanel(false)}>x</button>
          </div>
          <div className="traffic-panel-body">
            {!userLocation ? (
              <p className="empty-text">{t("trafficNoLocation")}</p>
            ) : locationRules.length === 0 ? (
              <p className="empty-text" style={{ color: "#16a34a" }}>{t("trafficAllClear")}</p>
            ) : (
              <>
                <p className="traffic-location">{t("trafficNearbyAreas", { count: locationRules.length })}</p>
                {locationRules.map((rule) => (
                  <div key={rule.id} className={`traffic-rule-item ${rule.isActiveBan ? "active-ban" : ""}`}>
                    <div className="traffic-rule-header">
                      <span className={`traffic-rule-badge ${rule.isActiveBan ? "danger" : "warning"}`}>
                        {rule.isActiveBan ? t("trafficActiveBan") : t("trafficRestricted")}
                      </span>
                      <b>{rule.name}</b>
                      <span className="traffic-distance">{t("trafficDistance", { distance: rule.distance })}</span>
                    </div>
                    <p className="traffic-rule-desc">{rule.description}</p>
                    <div className="traffic-rule-meta">
                      <span>{t("trafficRule")}: {rule.rules}</span>
                      {rule.fine && <span className="traffic-fine">{t("trafficFineLabel")}: {rule.fine}</span>}
                    </div>
                  </div>
                ))}
              </>
            )}

            {nearbyParking.length > 0 && (
              <div className="nearby-parking-section">
                <h4>{t("nearbyParkingTitle")}</h4>
                {nearbyParking.map((p) => (
                  <div key={p.id} className="parking-suggestion">
                    <div className="parking-suggestion-header">
                      <span className="parking-icon-small">P</span>
                      <div>
                        <b>{p.name}</b>
                        <span className="parking-distance">{t("trafficDistance", { distance: Math.round(p._distance) })}</span>
                      </div>
                      {p._score > 0 && (
                        <span className="parking-score-badge" title={t("scoreLabel")}>{t("scoreLabel")}: {(p._score * 100).toFixed(0)}</span>
                      )}
                    </div>
                    <div className="parking-suggestion-info">
                      <span>{t("lotPrice")}: {formatCurrency(p.pricePerHour)}/h</span>
                      <span>{t("lotAvailableSlots", { available: p.availableSlots, total: p.capacity })}</span>
                      {p._travelMin > 0 && <span>{t("travelTime", { mode: t(`travelMode_${travelMode}`), minutes: p._travelMin })}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="traffic-general-rules">
              <h4>{t("generalRulesTitle")}</h4>
              <ul>
                <li>{t("rule1")}</li>
                <li>{t("rule2")}</li>
                <li>{t("rule3")}</li>
                <li>{t("rule4")}</li>
                <li>{t("rule5")}</li>
                <li className="rule-fine">{t("ruleFineCar")}</li>
                <li className="rule-fine">{t("ruleFineMotorbike")}</li>
              </ul>
            </div>
          </div>
        </div>
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
                      {existingBooking.qr_code_token && (
                        <>
                          <p style={{ marginTop: 12, fontWeight: 600 }}>{t("qrEntryLabel")}</p>
                          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(existingBooking.qr_code_token)}`} alt="Entry QR" className="qr-image" />
                          <p className="qr-note" style={{ marginTop: 8 }}>{t("qrShowNote")}</p>
                        </>
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
                  <img src={bookingResult.qrDataUrl} alt="Entry QR" className="qr-image" />
                  <div className="qr-info">
                    <p>{t("bookingIdLabel")}: <b>{bookingResult.bookingId}</b></p>
                    <p>{t("checkoutPlateNumber")}: <b>{bookingForm.plateNumber}</b></p>
                    <p>{t("checkoutLotName")}: <b>{selectedLot.name}</b></p>
                    <p className="qr-note">{t("qrSaveNote")}</p>
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
          <div className="legend-item"><div className="legend-icon">P</div> {t("legendPublicParking")}</div>
        </div>
        <hr />
        <div className="legend-section">
          <span className="legend-section-title">{t("legendTrafficSection")}</span>
          <div className="legend-item"><div className="legend-line solid-red" /> {t("legendAbsoluteBan")}</div>
          <div className="legend-item"><div className="legend-line solid-orange" /> {t("legendTimeBanActive")}</div>
          <div className="legend-item"><div className="legend-line dashed-orange" /> {t("legendTimeBanInactive")}</div>
          <div className="legend-item"><div className="legend-line dashed-yellow" /> {t("legendConditional")}</div>
        </div>
        <hr />
        <div className="legend-section">
          <span className="legend-section-title">{t("legendFineSection")}</span>
          <div className="legend-item"><span className="legend-fine">{t("legendFineCar")}</span></div>
          <div className="legend-item"><span className="legend-fine">{t("legendFineMotorbike")}</span></div>
        </div>
        <div className="legend-note" dangerouslySetInnerHTML={{ __html: t("legendNote") }} />
      </div>

      <button className="booking-fab" onClick={() => setShowLotList((v) => !v)} title={t("fabTitle")}>
        <span className="booking-fab-icon">🚗</span>
        <span className="booking-fab-label">{t("fabLabel")}</span>
      </button>
    </div>
  );
}
