import { useEffect, useState } from "react";

const API = "http://localhost:8080";

export default function App() {
  const [dashboard, setDashboard] = useState({});
  const [heatmap, setHeatmap] = useState([]);

  useEffect(() => {
    fetch(`${API}/api/v1/admin/dashboard`).then((r) => r.json()).then(setDashboard);
    fetch(`${API}/api/v1/admin/heatmap`).then((r) => r.json()).then(setHeatmap);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <h1 className="text-2xl font-bold">Admin IOC</h1>
      <div className="grid grid-cols-2 gap-3 mt-4">
        {Object.entries(dashboard).map(([k, v]) => (
          <div key={k} className="rounded border border-slate-700 p-3">
            <div className="text-slate-400 text-sm">{k}</div>
            <div className="text-xl">{String(v)}</div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <h2 className="font-semibold">Heatmap Points</h2>
        <pre className="bg-slate-800 p-3 rounded mt-2">{JSON.stringify(heatmap, null, 2)}</pre>
      </div>
    </div>
  );
}
