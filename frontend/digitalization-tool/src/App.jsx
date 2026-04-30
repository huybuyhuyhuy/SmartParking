import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import "./App.css";

export default function App() {
  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3002";
  const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || "dev-admin-key";

  const mapRef = useRef(null);
  const map = useRef(null);
  const drawn = useRef(null);
  const existingLayer = useRef(null);
  const [lastGeoJson, setLastGeoJson] = useState(null);
  const [status, setStatus] = useState("");
  const [lots, setLots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Undo/Redo
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const [form, setForm] = useState({
    id: `HUE-P${String(Math.floor(Math.random() * 900) + 100)}`,
    name: "Bãi xe mới",
    capacity: 100,
    pricePerHour: 5000,
    evSupported: false,
    vehicleType: "CAR",
    openTime: "06:00",
    closeTime: "22:00",
    hasSecurity: false,
    contactPhone: "",
    description: "",
    imageUrl: ""
  });

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
    if (map.current) return;
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
        setForm({
          id: `HUE-P${String(Math.floor(Math.random() * 900) + 100)}`,
          name: "Bãi xe mới", capacity: 100, pricePerHour: 5000, evSupported: false,
          vehicleType: "CAR", openTime: "06:00", closeTime: "22:00", hasSecurity: false,
          contactPhone: "", description: "", imageUrl: ""
        });
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
  }, []);

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
      layer.bindPopup(`<b>${lot.name}</b><br/>ID: ${lot.id}<br/>Sức chứa: ${lot.capacity}`);
      layer.addTo(existingLayer.current);
    }
  }, [lots, selectedId]);

  const clearDraft = () => {
    setSelectedId(null);
    setIsEditing(false);
    setLastGeoJson(null);
    setHistory([]);
    setHistoryIdx(-1);
    setForm({
      id: `HUE-P${String(Math.floor(Math.random() * 900) + 100)}`,
      name: "Bãi xe mới", capacity: 100, pricePerHour: 5000, evSupported: false,
      vehicleType: "CAR", openTime: "06:00", closeTime: "22:00", hasSecurity: false,
      contactPhone: "", description: "", imageUrl: ""
    });
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
    if (!form.id.trim()) errors.push("ID không được để trống");
    if (!form.name.trim()) errors.push("Tên bãi xe không được để trống");
    if (Number(form.capacity) < 1) errors.push("Sức chứa phải > 0");
    if (Number(form.pricePerHour) < 0) errors.push("Giá không được âm");
    const dup = lots.find((l) => l.id === form.id && l.id !== selectedId);
    if (dup) errors.push(`ID "${form.id}" đã tồn tại. Vui lòng chọn ID khác.`);
    return errors;
  };

  const save = async () => {
    if (!featureToSave) { setStatus("Chưa có polygon. Hãy vẽ 1 Polygon trước."); return; }
    const errors = validateForm();
    if (errors.length > 0) { setStatus("Lỗi: " + errors.join("; ")); return; }

    setStatus("Đang lưu...");
    const res = await fetch(`${API_BASE}/api/admin/parking-lots`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
      body: JSON.stringify(featureToSave)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(`Lưu thất bại: ${data?.message || res.statusText}`); return; }
    setStatus(isEditing ? `Đã cập nhật: ${data.id}` : `Đã lưu: ${data.id}`);
    setIsEditing(true);
    setSelectedId(form.id);
    await loadLots();
  };

  const removeLot = async () => {
    if (!selectedId) { setStatus("Chọn 1 bãi xe trong danh sách trước khi xóa."); return; }
    if (!window.confirm(`Bạn có chắc muốn xóa bãi xe "${selectedId}"?`)) return;
    setStatus("Đang xóa...");
    const res = await fetch(`${API_BASE}/api/admin/parking-lots/${selectedId}`, {
      method: "DELETE",
      headers: { "x-admin-key": ADMIN_KEY }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus(`Xóa thất bại: ${data?.message || res.statusText}`); return; }
    clearDraft();
    await loadLots();
    setStatus(`Đã xóa: ${selectedId}`);
  };

  // Bulk export
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
    setStatus("Đã xuất file GeoJSON!");
  };

  // Bulk import
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
          const res = await fetch(`${API_BASE}/api/admin/parking-lots`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
            body: JSON.stringify(f)
          });
          if (res.ok) count++;
        }
        setStatus(`Đã import ${count}/${features.length} bãi xe.`);
        await loadLots();
      } catch (_e) {
        setStatus("Lỗi đọc file. Hãy chắc chắn file là GeoJSON hợp lệ.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="digi-app">
      <div className="digi-sidebar">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2>Huế Parking - Công cụ Số hóa</h2>
        </div>
        <p className="digi-subtitle">Vẽ Polygon, nhập thông tin bãi xe, rồi bấm Save.</p>

        <div className="digi-form">
          <div className="form-row">
            <label>ID <input value={form.id} onChange={(e) => setForm((s) => ({ ...s, id: e.target.value }))} /></label>
            <label>Tên bãi xe <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} /></label>
          </div>
          <div className="form-row">
            <label>Sức chứa <input type="number" value={form.capacity} onChange={(e) => setForm((s) => ({ ...s, capacity: Number(e.target.value) }))} /></label>
            <label>Giá/giờ (VNĐ) <input type="number" value={form.pricePerHour} onChange={(e) => setForm((s) => ({ ...s, pricePerHour: Number(e.target.value) }))} /></label>
          </div>
          <div className="form-row">
            <label>Loại xe
              <select value={form.vehicleType} onChange={(e) => setForm((s) => ({ ...s, vehicleType: e.target.value }))}>
                <option value="CAR">Ô tô</option>
                <option value="MOTORBIKE">Xe máy</option>
                <option value="BOTH">Cả hai</option>
              </select>
            </label>
            <label>Giờ mở cửa <input type="time" value={form.openTime} onChange={(e) => setForm((s) => ({ ...s, openTime: e.target.value }))} /></label>
          </div>
          <div className="form-row">
            <label>Giờ đóng cửa <input type="time" value={form.closeTime} onChange={(e) => setForm((s) => ({ ...s, closeTime: e.target.value }))} /></label>
            <label>SĐT liên hệ <input type="tel" value={form.contactPhone} onChange={(e) => setForm((s) => ({ ...s, contactPhone: e.target.value }))} placeholder="VD: 0905123456" /></label>
          </div>
          <div className="form-row">
            <label>URL ảnh bãi xe <input value={form.imageUrl} onChange={(e) => setForm((s) => ({ ...s, imageUrl: e.target.value }))} placeholder="https://..." /></label>
          </div>
          <label>Mô tả <textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} rows={2} placeholder="Mô tả về bãi xe..." /></label>

          <div className="form-checks">
            <label className="check-label">
              <input type="checkbox" checked={form.evSupported} onChange={(e) => setForm((s) => ({ ...s, evSupported: e.target.checked }))} />
              Hỗ trợ EV
            </label>
            <label className="check-label">
              <input type="checkbox" checked={form.hasSecurity} onChange={(e) => setForm((s) => ({ ...s, hasSecurity: e.target.checked }))} />
              Có bảo vệ
            </label>
          </div>
        </div>

        <div className="digi-actions">
          <button className="btn btn-primary" onClick={save}>
            {isEditing ? "Cập nhật" : "Save to GeoJSON"}
          </button>
          <button className="btn btn-danger" onClick={removeLot}>Xóa bãi đã chọn</button>
          <button className="btn btn-outline" onClick={clearDraft}>Tạo mới</button>
        </div>

        <div className="undo-redo">
          <button className="btn btn-sm btn-outline" onClick={undo} disabled={historyIdx <= 0}>Undo</button>
          <button className="btn btn-sm btn-outline" onClick={redo} disabled={historyIdx >= history.length - 1}>Redo</button>
          <span className="history-info">{history.length > 0 ? `${historyIdx + 1}/${history.length}` : "0"}</span>
        </div>

        <div className="digi-status">{status}</div>

        <div className="digi-import-export">
          <button className="btn btn-sm btn-outline" onClick={exportAll}>Xuất tất cả (GeoJSON)</button>
          <label className="btn btn-sm btn-outline import-label">
            Nhập GeoJSON
            <input type="file" accept=".json,.geojson" onChange={importFile} hidden />
          </label>
        </div>

        {form.imageUrl && (
          <div className="lot-preview-image">
            <img src={form.imageUrl} alt={form.name} onError={(e) => { e.target.style.display = "none"; }} />
          </div>
        )}

        <div className="digi-lot-list">
          <b>Danh sách bãi xe ({lots.length})</b>
          <div className="lot-list-scroll">
            {lots.map((lot) => (
              <button key={lot.id} onClick={() => selectLot(lot)}
                className={`lot-list-item ${selectedId === lot.id ? "selected" : ""}`}>
                <div><b>{lot.name}</b></div>
                <div className="lot-meta">{lot.id} | Sức chứa: {lot.capacity} | {lot.pricePerHour.toLocaleString()}đ/h</div>
              </button>
            ))}
          </div>
        </div>

        <details className="digi-preview">
          <summary>Xem trước GeoJSON</summary>
          <pre>{JSON.stringify(featureToSave, null, 2)}</pre>
        </details>
      </div>
      <div ref={mapRef} className="digi-map" />
    </div>
  );
}
