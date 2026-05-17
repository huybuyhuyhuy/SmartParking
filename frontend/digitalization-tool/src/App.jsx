import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import LangSwitcher from "./components/LangSwitcher.jsx";
import "./App.css";

const formatCurrency = (n, locale) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "VND", minimumFractionDigits: 0 }).format(n || 0);

export default function App() {
  const { t, i18n } = useTranslation();
  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";

  // Auth state
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState(null);

  const mapRef = useRef(null);
  const map = useRef(null);
  const drawn = useRef(null);
  const existingLayer = useRef(null);
  const [lastGeoJson, setLastGeoJson] = useState(null);
  const [status, setStatus] = useState("");
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const defaultName = () => t("defaultLotName");

  const initForm = (overrides = {}) => ({
    id: `HUE-P${String(Math.floor(Math.random() * 900) + 100)}`,
    name: defaultName(),
    capacity: 100,
    pricePerHour: 5000,
    evSupported: false,
    vehicleType: "CAR",
    openTime: "06:00",
    closeTime: "22:00",
    hasSecurity: false,
    contactPhone: "",
    description: "",
    imageUrl: "",
    ...overrides
  });

  const [form, setForm] = useState(initForm());

  const authFetch = (url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opts, headers });
  };

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
    setLots([]);
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

  const featureToSave = useMemo(() => {
    if (!lastGeoJson) return null;
    if (lastGeoJson.type !== "Feature") return null;
    if (lastGeoJson.geometry?.type !== "Polygon") return null;
    return {
      ...lastGeoJson,
      properties: {
        ...lastGeoJson.properties,
        id: form.id,
        name: form.name,
        capacity: Number(form.capacity),
        pricePerHour: Number(form.pricePerHour),
        evSupported: Boolean(form.evSupported),
        vehicleType: form.vehicleType,
        openTime: form.openTime,
        closeTime: form.closeTime,
        hasSecurity: Boolean(form.hasSecurity),
        contactPhone: form.contactPhone,
        description: form.description,
        imageUrl: form.imageUrl
      }
    };
  }, [lastGeoJson, form]);

  const pushHistory = (geoJson) => {
    const newHistory = history.slice(0, historyIdx + 1);
    newHistory.push(geoJson);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIdx > 0) {
      const prev = history[historyIdx - 1];
      setHistoryIdx(historyIdx - 1);
      setLastGeoJson(prev);
      if (drawn.current && prev) {
        drawn.current.clearLayers();
        const layer = L.geoJSON(prev);
        layer.eachLayer((l) => drawn.current.addLayer(l));
      }
    }
  };

  const redo = () => {
    if (historyIdx < history.length - 1) {
      const next = history[historyIdx + 1];
      setHistoryIdx(historyIdx + 1);
      setLastGeoJson(next);
      if (drawn.current && next) {
        drawn.current.clearLayers();
        const layer = L.geoJSON(next);
        layer.eachLayer((l) => drawn.current.addLayer(l));
      }
    }
  };

  const loadLots = async () => {
    const res = await fetch(`${API_BASE}/api/parking-lots`);
    const data = await res.json().catch(() => []);
    setLots(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (map.current || !mapRef.current) return;
    map.current = L.map(mapRef.current).setView([16.4637, 107.5909], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map.current);

    drawn.current = new L.FeatureGroup();
    map.current.addLayer(drawn.current);

    const control = new L.Control.Draw({
      draw: {
        polyline: false, rectangle: false, circle: false, circlemarker: false, marker: false,
        polygon: { allowIntersection: false, showArea: true }
      },
      edit: { featureGroup: drawn.current }
    });
    map.current.addControl(control);

    map.current.on(L.Draw.Event.CREATED, (e) => {
      drawn.current.clearLayers();
      drawn.current.addLayer(e.layer);
      const geoJson = e.layer.toGeoJSON();
      setLastGeoJson(geoJson);
      pushHistory(geoJson);
      if (!isEditing) {
        setSelectedId(null);
        setForm(initForm());
      }
    });
    map.current.on(L.Draw.Event.EDITED, () => {
      const layers = drawn.current.getLayers();
      const layer = layers[0];
      if (layer) { const gj = layer.toGeoJSON(); setLastGeoJson(gj); pushHistory(gj); }
    });
    map.current.on(L.Draw.Event.DELETED, () => {
      setLastGeoJson(null);
    });

    existingLayer.current = L.layerGroup().addTo(map.current);
    loadLots().catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!map.current || !existingLayer.current) return;
    existingLayer.current.clearLayers();
    for (const lot of lots) {
      if (!lot.geometry) continue;
      const layer = L.geoJSON(
        { type: "Feature", properties: { id: lot.id, name: lot.name }, geometry: lot.geometry },
        {
          style: {
            color: selectedId === lot.id ? "#2563eb" : "#374151",
            weight: selectedId === lot.id ? 3 : 2,
            fillOpacity: 0.12,
            fillColor: selectedId === lot.id ? "#93c5fd" : "#e5e7eb"
          }
        }
      );
      layer.on("click", () => selectLot(lot));
      layer.bindPopup(`<b>${lot.name}</b><br/>ID: ${lot.id}<br/>${t("labelCapacity")}: ${lot.capacity}`);
      layer.addTo(existingLayer.current);
    }
  }, [lots, selectedId, t]);

  const clearDraft = () => {
    setSelectedId(null);
    setIsEditing(false);
    setLastGeoJson(null);
    setHistory([]);
    setHistoryIdx(-1);
    setForm(initForm());
    if (drawn.current) drawn.current.clearLayers();
  };

  const selectLot = (lot) => {
    setSelectedId(lot.id);
    setIsEditing(true);
    setForm({
      id: lot.id,
      name: lot.name,
      capacity: lot.capacity ?? 100,
      pricePerHour: lot.pricePerHour ?? 5000,
      evSupported: Boolean(lot.evSupported),
      vehicleType: lot.vehicleType || "CAR",
      openTime: lot.openTime || "06:00",
      closeTime: lot.closeTime || "22:00",
      hasSecurity: Boolean(lot.hasSecurity),
      contactPhone: lot.contactPhone || "",
      description: lot.description || "",
      imageUrl: lot.imageUrl || ""
    });

    const feature = {
      type: "Feature",
      properties: { id: lot.id, name: lot.name, capacity: lot.capacity },
      geometry: lot.geometry
    };
    setLastGeoJson(feature);
    pushHistory(feature);

    if (drawn.current) {
      drawn.current.clearLayers();
      const geoLayer = L.geoJSON(feature);
      geoLayer.eachLayer((layer) => drawn.current.addLayer(layer));
      if (map.current) {
        const b = geoLayer.getBounds();
        if (b.isValid()) map.current.fitBounds(b.pad(0.2));
      }
    }
  };

  const validateForm = () => {
    const errors = [];
    if (!form.id.trim()) errors.push(t("errIdRequired"));
    if (!form.name.trim()) errors.push(t("errNameRequired"));
    if (Number(form.capacity) < 1) errors.push(t("errCapacityPositive"));
    if (Number(form.pricePerHour) < 0) errors.push(t("errPriceNegative"));
    const dup = lots.find((l) => l.id === form.id && l.id !== selectedId);
    if (dup) errors.push(t("errIdDuplicate", { id: form.id }));
    return errors;
  };

  const save = async () => {
    if (!featureToSave) { setStatus(t("statusNoPolygon")); return; }
    const errors = validateForm();
    if (errors.length > 0) { setStatus("Lỗi: " + errors.join("; ")); return; }

    setStatus(t("statusSaving"));
    const res = await authFetch(`${API_BASE}/api/admin/parking-lots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(featureToSave)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(`${t("statusSaveFailed")}: ${data?.message || res.statusText}`); return; }
    setStatus(isEditing ? t("statusUpdated", { id: data.id }) : t("statusSaved", { id: data.id }));
    setIsEditing(true);
    setSelectedId(form.id);
    await loadLots();
  };

  const removeLot = async () => {
    if (!selectedId) { setStatus(t("statusSelectToDelete")); return; }
    if (!window.confirm(t("confirmDelete", { id: selectedId }))) return;
    setStatus(t("statusDeleting"));
    const res = await authFetch(`${API_BASE}/api/admin/parking-lots/${selectedId}`, {
      method: "DELETE"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(`${t("statusDeleteFailed")}: ${data?.message || res.statusText}`); return; }
    clearDraft();
    await loadLots();
    setStatus(t("statusDeleted", { id: selectedId }));
  };

  const exportAll = async () => {
    const res = await fetch(`${API_BASE}/api/parking-lots`);
    const data = await res.json();
    const geoJson = {
      type: "FeatureCollection",
      features: data.filter((l) => l.geometry).map((l) => ({
        type: "Feature",
        properties: {
          id: l.id, name: l.name, capacity: l.capacity, pricePerHour: l.pricePerHour,
          evSupported: l.evSupported, vehicleType: l.vehicleType,
          openTime: l.openTime, closeTime: l.closeTime, hasSecurity: l.hasSecurity,
          contactPhone: l.contactPhone, description: l.description
        },
        geometry: l.geometry
      }))
    };
    const blob = new Blob([JSON.stringify(geoJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hue-parking-lots-${new Date().toISOString().slice(0, 10)}.geojson`; a.click();
    URL.revokeObjectURL(url);
    setStatus(t("statusExported"));
  };

  const importFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const geoJson = JSON.parse(ev.target.result);
        const features = geoJson.features || (geoJson.type === "Feature" ? [geoJson] : []);
        let count = 0;
        for (const f of features) {
          if (f.geometry?.type !== "Polygon") continue;
          const res = await authFetch(`${API_BASE}/api/admin/parking-lots`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(f)
          });
          if (res.ok) count++;
        }
        setStatus(t("statusImported", { count, total: features.length }));
        await loadLots();
      } catch (_e) {
        setStatus(t("errImportFailed"));
      }
    };
    reader.readAsText(file);
  };

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
    <div className="digi-app">
      <div className="digi-sidebar">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2>{t("header")}</h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <LangSwitcher />
            <button className="btn btn-sm btn-outline-dark" onClick={handleLogout} style={{ fontSize: 11 }}>Logout</button>
          </div>
        </div>
        <p className="digi-subtitle">{t("subtitle")}</p>

        <div className="digi-form">
          <div className="form-row">
            <label>{t("labelId")} <input value={form.id} onChange={(e) => setForm((s) => ({ ...s, id: e.target.value }))} /></label>
            <label>{t("labelName")} <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} /></label>
          </div>
          <div className="form-row">
            <label>{t("labelCapacity")} <input type="number" value={form.capacity} onChange={(e) => setForm((s) => ({ ...s, capacity: Number(e.target.value) }))} /></label>
            <label>{t("labelPricePerHour")} <input type="number" value={form.pricePerHour} onChange={(e) => setForm((s) => ({ ...s, pricePerHour: Number(e.target.value) }))} /></label>
          </div>
          <div className="form-row">
            <label>{t("labelVehicleType")}
              <select value={form.vehicleType} onChange={(e) => setForm((s) => ({ ...s, vehicleType: e.target.value }))}>
                <option value="CAR">{t("vehicleTypeCar")}</option>
                <option value="MOTORBIKE">{t("vehicleTypeMotorbike")}</option>
                <option value="BOTH">{t("vehicleTypeBoth")}</option>
              </select>
            </label>
            <label>{t("labelOpenTime")} <input type="time" value={form.openTime} onChange={(e) => setForm((s) => ({ ...s, openTime: e.target.value }))} /></label>
          </div>
          <div className="form-row">
            <label>{t("labelCloseTime")} <input type="time" value={form.closeTime} onChange={(e) => setForm((s) => ({ ...s, closeTime: e.target.value }))} /></label>
            <label>{t("labelContactPhone")} <input type="tel" value={form.contactPhone} onChange={(e) => setForm((s) => ({ ...s, contactPhone: e.target.value }))} placeholder={t("placeholderPhone")} /></label>
          </div>
          <div className="form-row">
            <label>{t("labelImageUrl")} <input value={form.imageUrl} onChange={(e) => setForm((s) => ({ ...s, imageUrl: e.target.value }))} placeholder={t("placeholderUrl")} /></label>
          </div>
          <label>{t("labelDescription")} <textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} rows={2} placeholder={t("placeholderDescription")} /></label>

          <div className="form-checks">
            <label className="check-label">
              <input type="checkbox" checked={form.evSupported} onChange={(e) => setForm((s) => ({ ...s, evSupported: e.target.checked }))} />
              {t("labelEvSupported")}
            </label>
            <label className="check-label">
              <input type="checkbox" checked={form.hasSecurity} onChange={(e) => setForm((s) => ({ ...s, hasSecurity: e.target.checked }))} />
              {t("labelHasSecurity")}
            </label>
          </div>
        </div>

        <div className="digi-actions">
          <button className="btn btn-primary" onClick={save}>
            {isEditing ? t("btnUpdate") : t("btnSave")}
          </button>
          <button className="btn btn-danger" onClick={removeLot}>{t("btnDelete")}</button>
          <button className="btn btn-outline" onClick={clearDraft}>{t("btnNew")}</button>
        </div>

        <div className="undo-redo">
          <button className="btn btn-sm btn-outline" onClick={undo} disabled={historyIdx <= 0}>{t("btnUndo")}</button>
          <button className="btn btn-sm btn-outline" onClick={redo} disabled={historyIdx >= history.length - 1}>{t("btnRedo")}</button>
          <span className="history-info">{history.length > 0 ? `${historyIdx + 1}/${history.length}` : "0"}</span>
        </div>

        <div className="digi-status">{status}</div>

        <div className="digi-import-export">
          <button className="btn btn-sm btn-outline" onClick={exportAll}>{t("btnExportAll")}</button>
          <label className="btn btn-sm btn-outline import-label">
            {t("btnImport")}
            <input type="file" accept=".json,.geojson" onChange={importFile} hidden />
          </label>
        </div>

        {form.imageUrl && (
          <div className="lot-preview-image">
            <img src={form.imageUrl} alt={form.name} onError={(e) => { e.target.style.display = "none"; }} />
          </div>
        )}

        <div className="digi-lot-list">
          <b>{t("lotListHeader", { count: lots.length })}</b>
          <div className="lot-list-scroll">
            {lots.map((lot) => (
              <button key={lot.id} onClick={() => selectLot(lot)}
                className={`lot-list-item ${selectedId === lot.id ? "selected" : ""}`}>
                <div><b>{lot.name}</b></div>
                <div className="lot-meta">{lot.id} | {t("labelCapacity")}: {lot.capacity} | {formatCurrency(lot.pricePerHour, i18n.language)}/h</div>
              </button>
            ))}
          </div>
        </div>

        <details className="digi-preview">
          <summary>{t("previewTitle")}</summary>
          <pre>{JSON.stringify(featureToSave, null, 2)}</pre>
        </details>
      </div>
      <div ref={mapRef} className="digi-map" />
    </div>
  );
}
