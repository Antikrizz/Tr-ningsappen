import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { workoutsToCsv, downloadFile, todayIso } from "../lib/stats.js";

export default function More({ session, runSync, showToast, onImported }) {
  const [profile, setProfile] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [pending, setPending] = useState([]);
  const [mapDraft, setMapDraft] = useState({});
  const [newExercise, setNewExercise] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [{ data: prof }, { data: ex }, { data: pend }] = await Promise.all([
      supabase.from("profiles").select("name,garmin_linked").eq("id", session.user.id).maybeSingle(),
      supabase.from("exercises").select("id,name,owner_id").order("name"),
      supabase.from("garmin_pending").select("activity_id,date,unmapped")
    ]);
    setProfile(prof ?? { name: "", garmin_linked: false });
    setExercises(ex ?? []);
    setPending(pend ?? []);
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unmappedKeys = [...new Set(pending.flatMap((p) => p.unmapped))];

  async function syncNow() {
    setBusy(true);
    const res = await runSync("sync");
    setBusy(false);
    if (!res) { showToast("Synken misslyckades — se README för felsökning"); return; }
    if (!res.linked) { showToast("Garmin är inte kopplat ännu"); return; }
    showToast(res.imported > 0 ? `${res.imported} nya pass importerade` : "Inga nya pass hos Garmin");
    loadAll();
  }

  async function saveMappings() {
    setBusy(true);
    try {
      for (const key of unmappedKeys) {
        const choice = mapDraft[key];
        if (!choice) continue;
        let exerciseId = Number(choice);
        if (choice === "__new__") {
          const name = window.prompt(`Namn på ny övning för "${prettyKey(key)}":`, prettyKey(key));
          if (!name?.trim()) continue;
          const { data, error } = await supabase
            .from("exercises")
            .insert({ name: name.trim() })
            .select("id")
            .single();
          if (error) throw error;
          exerciseId = data.id;
        }
        const { error } = await supabase
          .from("garmin_mappings")
          .upsert({ user_id: session.user.id, garmin_key: key, exercise_id: exerciseId });
        if (error) throw error;
      }
      const res = await runSync("process-pending");
      if (res?.imported > 0) {
        showToast(`${res.imported} pass importerade`);
        onImported();
      }
      setMapDraft({});
      await loadAll();
    } catch (err) {
      showToast("Kunde inte spara mappningen");
    } finally {
      setBusy(false);
    }
  }

  async function addExercise() {
    if (!newExercise.trim()) return;
    const { data, error } = await supabase
      .from("exercises")
      .insert({ name: newExercise.trim() })
      .select("id,name,owner_id")
      .single();
    if (error) { showToast("Kunde inte skapa övningen"); return; }
    setExercises((l) => [...l, data].sort((a, b) => a.name.localeCompare(b.name, "sv")));
    setNewExercise("");
    showToast("Övning tillagd");
  }

  async function removeExercise(ex) {
    if (!window.confirm(`Ta bort övningen "${ex.name}"?`)) return;
    const { error } = await supabase.from("exercises").delete().eq("id", ex.id);
    if (error) {
      showToast("Går inte att ta bort — övningen används i loggade pass");
      return;
    }
    setExercises((l) => l.filter((e) => e.id !== ex.id));
  }

  async function exportData(format) {
    const { data } = await supabase
      .from("workouts")
      .select("date,note,source,sets(set_number,reps,weight,exercises(name))")
      .order("date");
    if (!data?.length) { showToast("Ingen data att exportera"); return; }
    if (format === "csv") {
      downloadFile(`traningslogg-${todayIso()}.csv`, workoutsToCsv(data), "text/csv;charset=utf-8");
    } else {
      downloadFile(`traningslogg-${todayIso()}.json`, JSON.stringify(data, null, 2), "application/json");
    }
  }

  return (
    <div>
      <h1>Mer</h1>

      <h2>Garmin</h2>
      <div className="card">
        {profile === null ? (
          <div className="muted">Laddar…</div>
        ) : profile.garmin_linked ? (
          <>
            <div className="row-between">
              <span>Garmin-konto kopplat <span style={{ color: "var(--green)" }}>✓</span></span>
              <button className="btn btn-small" onClick={syncNow} disabled={busy}>
                {busy ? "Hämtar…" : "Hämta nya pass"}
              </button>
            </div>
            <div className="muted small" style={{ marginTop: 6 }}>
              Nya styrkepass hämtas också automatiskt varje gång appen öppnas.
            </div>
          </>
        ) : (
          <div className="muted small">
            Inte kopplat ännu. Kör <code>node garmin/link.mjs</code> på datorn en gång (se README) så
            hämtas dina styrkepass från klockan automatiskt.
          </div>
        )}
      </div>

      {unmappedKeys.length > 0 && (
        <div className="card">
          <strong>Okända övningar från Garmin</strong>
          <div className="muted small" style={{ margin: "6px 0 10px" }}>
            {pending.length} pass väntar på att du kopplar de här övningarna. Valet sparas — du behöver
            bara göra det en gång per övning.
          </div>
          {unmappedKeys.map((key) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <label>{prettyKey(key)}</label>
              <select
                value={mapDraft[key] ?? ""}
                onChange={(e) => setMapDraft((d) => ({ ...d, [key]: e.target.value }))}
              >
                <option value="">Välj övning…</option>
                {exercises.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
                <option value="__new__">＋ Skapa ny övning</option>
              </select>
            </div>
          ))}
          <button className="btn" onClick={saveMappings} disabled={busy || unmappedKeys.every((k) => !mapDraft[k])}>
            Spara och importera
          </button>
        </div>
      )}

      <h2>Övningar</h2>
      <div className="card">
        <div className="row">
          <input
            value={newExercise}
            onChange={(e) => setNewExercise(e.target.value)}
            placeholder="Ny övning…"
            onKeyDown={(e) => e.key === "Enter" && addExercise()}
          />
          <button className="btn btn-small" onClick={addExercise}>Lägg till</button>
        </div>
        <div className="divider" />
        {exercises.map((ex) => (
          <div className="row-between" key={ex.id} style={{ padding: "5px 0" }}>
            <span className="small">
              {ex.name} {ex.owner_id && <span className="badge">egen</span>}
            </span>
            {ex.owner_id === session.user.id && (
              <button className="remove-x" onClick={() => removeExercise(ex)}>✕</button>
            )}
          </div>
        ))}
      </div>

      <h2>Export</h2>
      <div className="card row">
        <button className="btn btn-secondary" onClick={() => exportData("csv")}>⬇️ CSV</button>
        <button className="btn btn-secondary" onClick={() => exportData("json")}>⬇️ JSON</button>
      </div>

      <h2>Konto</h2>
      <div className="card">
        <div className="small">{profile?.name || "—"}</div>
        <div className="muted small">{session.user.email}</div>
        <div className="spacer" />
        <button className="btn btn-danger" onClick={() => supabase.auth.signOut()}>Logga ut</button>
      </div>
    </div>
  );
}

// GARMIN_KEY -> "Garmin key" (läsbart)
function prettyKey(key) {
  return key.charAt(0) + key.slice(1).toLowerCase().replaceAll("_", " ");
}
