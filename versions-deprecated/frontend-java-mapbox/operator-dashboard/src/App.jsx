import { useEffect, useState } from "react";

const API = "http://localhost:8080";

export default function App() {
  const [slots, setSlots] = useState({});
  const [lotId, setLotId] = useState("P001");
  const [value, setValue] = useState(20);

  const refresh = () =>
    fetch(`${API}/api/v1/slots`)
      .then((r) => r.json())
      .then(setSlots)
      .catch(() => setSlots({}));

  useEffect(() => {
    refresh();
  }, []);

  const override = async () => {
    await fetch(`${API}/api/v1/slots/override?parkingLotId=${lotId}&availableSlots=${value}`, { method: "POST" });
    refresh();
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <h1 className="text-2xl font-bold">Operator Dashboard</h1>
      <div className="mt-4 flex gap-2">
        <input className="border p-2" value={lotId} onChange={(e) => setLotId(e.target.value)} />
        <input className="border p-2" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} />
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={override}>
          Manual Slot Override
        </button>
      </div>
      <pre className="mt-4 bg-slate-100 p-4 rounded">{JSON.stringify(slots, null, 2)}</pre>
    </div>
  );
}
