import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { todayIso, formatDate } from "../lib/stats.js";

const emptySet = { reps: "", weight: "" };

export default function LogWorkout({ editWorkout, onDone, onCancelEdit }) {
  const [date, setDate] = useState(editWorkout?.date ?? todayIso());
  const [note, setNote] = useState(editWorkout?.note ?? "");
  const [entries, setEntries] = useState(() => (editWorkout ? entriesFromWorkout(editWorkout) : []));
  const [exercises, setExercises] = useState([]);
  const [hints, setHints] = useState({});
  const [pickerValue, setPickerValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("exercises")
      .select("id,name")
      .order("name")
      .then(({ data }) => setExercises(data ?? []));
  }, []);

  async function fetchHint(exerciseId) {
    const { data } = await supabase
      .from("workouts")
      .select("id,date,sets!inner(set_number,reps,weight,exercise_id)")
      .eq("sets.exercise_id", exerciseId)
      .neq("id", editWorkout?.id ?? -1)
      .order("date", { ascending: false })
      .limit(1);
    if (data?.length) {
      const w = data[0];
      const sets = [...w.sets].sort((a, b) => a.set_number - b.set_number);
      setHints((h) => ({ ...h, [exerciseId]: { date: w.date, sets } }));
    }
  }

  async function addExercise(idStr) {
    setPickerValue("");
    if (!idStr) return;

    let id;
    if (idStr === "__new__") {
      const name = window.prompt("Namn på nya övningen:");
      if (!name?.trim()) return;
      const { data, error } = await supabase
        .from("exercises")
        .insert({ name: name.trim() })
        .select("id,name")
        .single();
      if (error) { setError("Kunde inte skapa övningen."); return; }
      setExercises((list) => [...list, data].sort((a, b) => a.name.localeCompare(b.name, "sv")));
      id = data.id;
    } else {
      id = Number(idStr);
    }

    if (entries.some((en) => en.exerciseId === id)) return;
    const name = idStr === "__new__"
      ? exercises.find((e) => e.id === id)?.name ?? "(ny övning)"
      : exercises.find((e) => e.id === id)?.name ?? "";
    setEntries((en) => [...en, { exerciseId: id, name: name || "(övning)", sets: [{ ...emptySet }] }]);
    fetchHint(id);
  }

  function updateSet(entryIdx, setIdx, field, value) {
    setEntries((en) =>
      en.map((entry, i) =>
        i !== entryIdx
          ? entry
          : { ...entry, sets: entry.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: value })) }
      )
    );
  }

  function addSet(entryIdx) {
    setEntries((en) =>
      en.map((entry, i) => {
        if (i !== entryIdx) return entry;
        const last = entry.sets[entry.sets.length - 1] ?? emptySet;
        return { ...entry, sets: [...entry.sets, { ...last }] };
      })
    );
  }

  function removeSet(entryIdx, setIdx) {
    setEntries((en) =>
      en.map((entry, i) =>
        i !== entryIdx ? entry : { ...entry, sets: entry.sets.filter((_, j) => j !== setIdx) }
      ).filter((entry) => entry.sets.length > 0)
    );
  }

  function removeEntry(entryIdx) {
    setEntries((en) => en.filter((_, i) => i !== entryIdx));
  }

  async function repeatLast() {
    const { data } = await supabase
      .from("workouts")
      .select("id,date,sets(set_number,reps,weight,exercise_id,exercises(name))")
      .order("date", { ascending: false })
      .limit(1);
    if (!data?.length) { setError("Ingen tidigare pass att kopiera."); return; }
    setEntries(entriesFromWorkout(data[0]));
    for (const s of data[0].sets) fetchHint(s.exercise_id);
  }

  async function save() {
    setError(null);
    const cleaned = entries
      .map((en) => ({
        ...en,
        sets: en.sets
          .map((s) => ({ reps: Number(s.reps), weight: Number(String(s.weight).replace(",", ".")) || 0 }))
          .filter((s) => s.reps > 0)
      }))
      .filter((en) => en.sets.length > 0);

    if (cleaned.length === 0) {
      setError("Lägg till minst en övning med minst ett set (reps måste vara ifyllt).");
      return;
    }

    setBusy(true);
    try {
      let workoutId = editWorkout?.id;

      if (!editWorkout) {
        // dubblettkoll: finns redan ett Garmin-importerat pass samma dag?
        const { data: sameDay } = await supabase
          .from("workouts")
          .select("id")
          .eq("date", date)
          .eq("source", "garmin");
        if (sameDay?.length) {
          const ok = window.confirm(
            "Du har redan ett pass importerat från Garmin detta datum. Spara ändå som eget pass?"
          );
          if (!ok) { setBusy(false); return; }
        }
        const { data, error } = await supabase
          .from("workouts")
          .insert({ date, note: note || null })
          .select("id")
          .single();
        if (error) throw error;
        workoutId = data.id;
      } else {
        const { error } = await supabase
          .from("workouts")
          .update({ date, note: note || null })
          .eq("id", workoutId);
        if (error) throw error;
        const { error: delErr } = await supabase.from("sets").delete().eq("workout_id", workoutId);
        if (delErr) throw delErr;
      }

      const rows = cleaned.flatMap((en) =>
        en.sets.map((s, i) => ({
          workout_id: workoutId,
          exercise_id: en.exerciseId,
          set_number: i + 1,
          reps: s.reps,
          weight: s.weight
        }))
      );
      const { error: setErr } = await supabase.from("sets").insert(rows);
      if (setErr) throw setErr;

      onDone();
    } catch (err) {
      setError("Kunde inte spara: " + (err.message ?? "okänt fel"));
    } finally {
      setBusy(false);
    }
  }

  const available = exercises.filter((e) => !entries.some((en) => en.exerciseId === e.id));

  return (
    <div>
      <h1>{editWorkout ? "Redigera pass" : "Logga pass"}</h1>

      {editWorkout && (
        <div className="info-box row-between">
          <span>
            Redigerar pass {formatDate(editWorkout.date)}
            {editWorkout.source === "garmin" && " (Garmin)"}
          </span>
          <button className="link" onClick={onCancelEdit}>Avbryt</button>
        </div>
      )}

      <label>Datum</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

      {entries.map((entry, ei) => (
        <div className="card" key={entry.exerciseId}>
          <div className="row-between">
            <strong>{entry.name}</strong>
            <button className="remove-x" onClick={() => removeEntry(ei)} title="Ta bort övning">✕</button>
          </div>

          {hints[entry.exerciseId] && (
            <div className="hint">
              Förra gången ({formatDate(hints[entry.exerciseId].date)}):{" "}
              {hints[entry.exerciseId].sets.map((s) => `${trim(s.weight)}kg×${s.reps}`).join(", ")}
            </div>
          )}

          <div className="set-grid">
            <span className="set-head">Set</span>
            <span className="set-head">Vikt (kg)</span>
            <span className="set-head">Reps</span>
            <span />
          </div>
          {entry.sets.map((s, si) => (
            <div className="set-grid" key={si}>
              <span className="set-nr">{si + 1}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                placeholder="0"
                value={s.weight}
                onChange={(e) => updateSet(ei, si, "weight", e.target.value)}
              />
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="0"
                value={s.reps}
                onChange={(e) => updateSet(ei, si, "reps", e.target.value)}
              />
              <button className="remove-x" onClick={() => removeSet(ei, si)}>✕</button>
            </div>
          ))}
          <button className="btn btn-secondary btn-small" onClick={() => addSet(ei)}>
            + Lägg till set
          </button>
        </div>
      ))}

      <div className="card">
        <label>Lägg till övning</label>
        <select value={pickerValue} onChange={(e) => addExercise(e.target.value)}>
          <option value="">Välj övning…</option>
          {available.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
          <option value="__new__">＋ Ny övning…</option>
        </select>
      </div>

      <label>Anteckning (valfritt)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="T.ex. tung dag, ny teknik…" />

      {error && <div className="error-box">{error}</div>}

      <div className="spacer" />
      <button className="btn" onClick={save} disabled={busy}>
        {busy ? "Sparar…" : editWorkout ? "Spara ändringar" : "Spara pass"}
      </button>

      {!editWorkout && entries.length === 0 && (
        <>
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={repeatLast}>
            🔁 Upprepa förra passet
          </button>
        </>
      )}
    </div>
  );
}

function entriesFromWorkout(workout) {
  const byExercise = new Map();
  const sorted = [...workout.sets].sort((a, b) => a.set_number - b.set_number);
  for (const s of sorted) {
    if (!byExercise.has(s.exercise_id)) {
      byExercise.set(s.exercise_id, {
        exerciseId: s.exercise_id,
        name: s.exercises?.name ?? "(övning)",
        sets: []
      });
    }
    byExercise.get(s.exercise_id).sets.push({ reps: String(s.reps), weight: trim(s.weight) });
  }
  return [...byExercise.values()];
}

function trim(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(num);
}
