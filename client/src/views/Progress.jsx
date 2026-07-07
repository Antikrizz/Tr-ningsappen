import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, CartesianGrid
} from "recharts";
import { supabase } from "../supabase.js";
import { buildProgress, formatDate } from "../lib/stats.js";

export default function Progress({ session }) {
  const uid = session.user.id;
  const [exercises, setExercises] = useState([]);
  const [selected, setSelected] = useState(() => localStorage.getItem("progress-exercise") ?? "");
  const [data, setData] = useState(null);

  useEffect(() => {
    supabase
      .from("exercises")
      .select("id,name")
      .order("name")
      .then(({ data }) => {
        setExercises(data ?? []);
        if (!localStorage.getItem("progress-exercise") && data?.length) {
          const bench = data.find((e) => e.name === "Bänkpress");
          setSelected(String(bench?.id ?? data[0].id));
        }
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    localStorage.setItem("progress-exercise", selected);
    setData(null);
    supabase
      .from("workouts")
      .select("date, sets!inner(reps,weight,exercise_id)")
      .eq("sets.exercise_id", Number(selected))
      .eq("user_id", uid)
      .order("date")
      .then(({ data: rows }) => setData(buildProgress(rows ?? [])));
  }, [selected]);

  const hasData = data && data.chart.length > 0;

  return (
    <div>
      <h1>Progress</h1>

      <select value={selected} onChange={(e) => setSelected(e.target.value)}>
        <option value="" disabled>Välj övning…</option>
        {exercises.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      {data === null && selected && <div className="muted" style={{ marginTop: 16 }}>Laddar…</div>}

      {data !== null && !hasData && (
        <div className="card muted" style={{ marginTop: 16 }}>
          Ingen data för den här övningen ännu — logga några pass så växer graferna fram här.
        </div>
      )}

      {hasData && (
        <>
          <h2>Personliga rekord 🏆</h2>
          <div className="pr-grid">
            <div className="pr-card">
              <div className="pr-value">{trim(data.prs.maxWeight.weight)} kg</div>
              <div className="pr-label">Tyngsta set ({data.prs.maxWeight.reps} reps)<br />{formatDate(data.prs.maxWeight.date)}</div>
            </div>
            <div className="pr-card">
              <div className="pr-value">{trim(data.prs.maxE1rm.value)} kg</div>
              <div className="pr-label">Uppskattat 1RM<br />{formatDate(data.prs.maxE1rm.date)}</div>
            </div>
            <div className="pr-card">
              <div className="pr-value">{data.prs.maxVolume.volume}</div>
              <div className="pr-label">Största volym (kg)<br />{formatDate(data.prs.maxVolume.date)}</div>
            </div>
          </div>

          <h2>Vikt över tid</h2>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#2e3340" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#9aa1b0" fontSize={11} />
                <YAxis stroke="#9aa1b0" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "#232733", border: "1px solid #2e3340", borderRadius: 10 }}
                  labelFormatter={formatDate}
                  formatter={(v, name) => [`${v} kg`, name]}
                />
                <Legend />
                <Line type="monotone" dataKey="bestWeight" name="Tyngsta set" stroke="#4f8ef7" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="e1rm" name="Uppskattat 1RM" stroke="#3ecf8e" strokeWidth={2} dot={false} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h2>Volym per pass</h2>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#2e3340" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDate} stroke="#9aa1b0" fontSize={11} />
                <YAxis stroke="#9aa1b0" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "#232733", border: "1px solid #2e3340", borderRadius: 10 }}
                  labelFormatter={formatDate}
                  formatter={(v) => [`${v} kg`, "Volym"]}
                />
                <Bar dataKey="volume" name="Volym" fill="#4f8ef7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function trim(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}
