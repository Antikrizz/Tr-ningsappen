import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { formatDateLong } from "../lib/stats.js";

export default function History({ onEdit, onChanged, showToast }) {
  const [workouts, setWorkouts] = useState(null);
  const [expanded, setExpanded] = useState(null);

  async function load() {
    const { data } = await supabase
      .from("workouts")
      .select("id,date,note,source,garmin_activity_id,sets(id,set_number,reps,weight,exercise_id,exercises(name))")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    setWorkouts(data ?? []);
  }

  useEffect(() => { load(); }, []);

  async function remove(w) {
    if (!window.confirm(`Ta bort passet ${formatDateLong(w.date)}? Detta går inte att ångra.`)) return;
    const { error } = await supabase.from("workouts").delete().eq("id", w.id);
    if (error) { showToast("Kunde inte ta bort passet"); return; }
    showToast("Passet borttaget");
    setWorkouts((list) => list.filter((x) => x.id !== w.id));
    onChanged();
  }

  if (workouts === null) return <div className="muted">Laddar…</div>;

  return (
    <div>
      <h1>Historik</h1>
      {workouts.length === 0 && (
        <div className="card muted">
          Inga pass ännu. Logga ditt första under fliken Logga — eller koppla Garmin under Mer.
        </div>
      )}

      {workouts.map((w) => {
        const groups = groupSets(w.sets);
        const open = expanded === w.id;
        return (
          <div className="card card-tap" key={w.id} onClick={() => setExpanded(open ? null : w.id)}>
            <div className="row-between">
              <strong>{formatDateLong(w.date)}</strong>
              <span className={`badge ${w.source === "garmin" ? "garmin" : ""}`}>
                {w.source === "garmin" ? "Garmin" : "Manuellt"}
              </span>
            </div>
            <div className="muted small">
              {groups.map((g) => g.name).join(" · ") || "Inga set"}
            </div>

            {open && (
              <div onClick={(e) => e.stopPropagation()}>
                <div className="divider" />
                {groups.map((g) => (
                  <div key={g.exerciseId} style={{ marginBottom: 10 }}>
                    <strong className="small">{g.name}</strong>
                    <div className="muted small">
                      {g.sets.map((s) => `${Number(s.weight)}kg × ${s.reps}`).join("   ")}
                    </div>
                  </div>
                ))}
                {w.note && <div className="muted small">📝 {w.note}</div>}
                <div className="spacer" />
                <div className="row">
                  <button className="btn btn-secondary btn-small" onClick={() => onEdit(w)}>
                    ✏️ Redigera
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => remove(w)}>
                    Ta bort
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function groupSets(sets) {
  const map = new Map();
  for (const s of [...sets].sort((a, b) => a.set_number - b.set_number)) {
    if (!map.has(s.exercise_id)) {
      map.set(s.exercise_id, { exerciseId: s.exercise_id, name: s.exercises?.name ?? "(övning)", sets: [] });
    }
    map.get(s.exercise_id).sets.push(s);
  }
  return [...map.values()];
}
