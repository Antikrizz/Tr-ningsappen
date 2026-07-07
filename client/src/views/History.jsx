import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { formatDateLong } from "../lib/stats.js";

export default function History({ session, onEdit, onChanged, showToast }) {
  const uid = session.user.id;
  const [workouts, setWorkouts] = useState(null);
  const [names, setNames] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem("history-view") ?? "mine");

  async function load(currentView) {
    let query = supabase
      .from("workouts")
      .select("id,user_id,date,note,source,garmin_activity_id,sets(id,set_number,reps,weight,exercise_id,exercises(name))")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    if (currentView === "mine") query = query.eq("user_id", uid);
    const [{ data }, { data: profiles }] = await Promise.all([
      query,
      supabase.from("profiles").select("id,name")
    ]);
    setWorkouts(data ?? []);
    setNames(Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name?.trim() || "Okänd"])));
  }

  useEffect(() => {
    localStorage.setItem("history-view", view);
    setWorkouts(null);
    load(view);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(w) {
    if (!window.confirm(`Ta bort passet ${formatDateLong(w.date)}? Detta går inte att ångra.`)) return;
    const { error } = await supabase.from("workouts").delete().eq("id", w.id);
    if (error) { showToast("Kunde inte ta bort passet"); return; }
    showToast("Passet borttaget");
    setWorkouts((list) => list.filter((x) => x.id !== w.id));
    onChanged();
  }

  return (
    <div>
      <div className="row-between">
        <h1>Historik</h1>
        <div className="seg">
          <button className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>Mina</button>
          <button className={view === "both" ? "active" : ""} onClick={() => setView("both")}>Alla</button>
        </div>
      </div>

      {workouts === null && <div className="muted">Laddar…</div>}

      {workouts?.length === 0 && (
        <div className="card muted">
          Inga pass ännu. Logga ditt första under fliken Logga — eller koppla Garmin under Mer.
        </div>
      )}

      {workouts?.map((w) => {
        const mine = w.user_id === uid;
        const groups = groupSets(w.sets);
        const open = expanded === w.id;
        return (
          <div className="card card-tap" key={w.id} onClick={() => setExpanded(open ? null : w.id)}>
            <div className="row-between">
              <strong>{formatDateLong(w.date)}</strong>
              <span className="row" style={{ gap: 6 }}>
                {view === "both" && (
                  <span className={`badge ${mine ? "" : "partner"}`}>{names[w.user_id] ?? "?"}</span>
                )}
                <span className={`badge ${w.source === "garmin" ? "garmin" : ""}`}>
                  {w.source === "garmin" ? "Garmin" : "Manuellt"}
                </span>
              </span>
            </div>
            <div className="muted small">
              {groups.map((g) => g.name).join(" · ") || "Inga set"}
            </div>

            {open && (
              <div onClick={(e) => e.stopPropagation()}>
                <div className="divider" />
                {groups.map((g) => (
                  <div key={g.exerciseId} style={{ marginBottom: 12 }}>
                    <strong className="small">{g.name}</strong>
                    <div className="chips">
                      {g.sets.map((s, i) => (
                        <span className="chip" key={i}>
                          {Number(s.weight)}<span className="chip-unit">kg</span>
                          <span className="chip-x">×</span>{s.reps}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {w.note && <div className="muted small">📝 {w.note}</div>}
                {mine && (
                  <>
                    <div className="spacer" />
                    <div className="row">
                      <button className="btn btn-secondary btn-small" onClick={() => onEdit(w)}>
                        ✏️ Redigera
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => remove(w)}>
                        Ta bort
                      </button>
                    </div>
                  </>
                )}
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
