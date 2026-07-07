import { useEffect, useState } from "react";
import { supabase } from "../supabase.js";
import { workoutsToCsv, downloadFile, todayIso } from "../lib/stats.js";

export default function More({ session, runSync, garminExpired, showToast, onImported }) {
  const uid = session.user.id;
  const [profile, setProfile] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [pending, setPending] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [goals, setGoals] = useState({});
  const [goalOpen, setGoalOpen] = useState(null);
  const [goalDraft, setGoalDraft] = useState({ target_reps: 8, increment: 2.5 });
  const [mapDraft, setMapDraft] = useState({});
  const [newExercise, setNewExercise] = useState("");
  const [showMappings, setShowMappings] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const [{ data: prof }, { data: ex }, { data: pend }, { data: maps }, { data: goalRows }] =
      await Promise.all([
        supabase.from("profiles").select("name,garmin_linked").eq("id", uid).maybeSingle(),
        supabase.from("exercises").select("id,name,owner_id").or(`owner_id.is.null,owner_id.eq.${uid}`).order("name"),
        supabase.from("garmin_pending").select("activity_id,date,unmapped"),
        supabase.from("garmin_mappings").select("garmin_key,exercise_id,exercises(name)").order("garmin_key"),
        supabase.from("exercise_goals").select("exercise_id,target_reps,increment")
      ]);
    setProfile(prof ?? { name: "", garmin_linked: false });
    setExercises(ex ?? []);
    setPending(pend ?? []);
    setMappings(maps ?? []);
    setGoals(Object.fromEntries((goalRows ?? []).map((g) => [g.exercise_id, g])));
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

  async function removeMapping(m) {
    if (!window.confirm(`Ta bort mappningen "${prettyKey(m.garmin_key)} → ${m.exercises?.name}"? Nästa import frågar igen.`)) return;
    const { error } = await supabase
      .from("garmin_mappings")
      .delete()
      .eq("user_id", uid)
      .eq("garmin_key", m.garmin_key);
    if (error) { showToast("Kunde inte ta bort mappningen"); return; }
    setMappings((l) => l.filter((x) => x.garmin_key !== m.garmin_key));
  }

  function openGoal(ex) {
    const g = goals[ex.id];
    setGoalDraft({ target_reps: g?.target_reps ?? 8, increment: g?.increment ?? 2.5 });
    setGoalOpen(goalOpen === ex.id ? null : ex.id);
  }

  async function saveGoal(ex) {
    const target_reps = Math.max(1, Math.min(50, Number(goalDraft.target_reps) || 8));
    const increment = Math.max(0.25, Number(String(goalDraft.increment).replace(",", ".")) || 2.5);
    const { error } = await supabase
      .from("exercise_goals")
      .upsert({ user_id: uid, exercise_id: ex.id, target_reps, increment });
    if (error) { showToast("Kunde inte spara målet"); return; }
    setGoals((g) => ({ ...g, [ex.id]: { exercise_id: ex.id, target_reps, increment } }));
    setGoalOpen(null);
    showToast(`Mål för ${ex.name}: ${target_reps} reps, +${increment} kg`);
  }

  async function exportData(format) {
    const { data } = await supabase
      .from("workouts")
      .select("date,note,source,sets(set_number,reps,weight,exercises(name))")
      .eq("user_id", uid)
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
      {garminExpired && (
        <div className="error-box">
          ⚠️ <strong>Garmin-kopplingen har gått ut.</strong> Synken är pausad tills du kör
          link-skriptet på datorn igen (<code>py link_mfa.py</code> eller <code>node link.mjs</code>,
          se README). Din data är kvar och inget annat påverkas.
        </div>
      )}
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
            {mappings.length > 0 && (
              <>
                <div className="divider" />
                <button className="link" onClick={() => setShowMappings(!showMappings)}>
                  {showMappings ? "Dölj" : "Visa"} övningsmappningar ({mappings.length})
                </button>
                {showMappings && mappings.map((m) => (
                  <div className="row-between" key={m.garmin_key} style={{ padding: "4px 0" }}>
                    <span className="small">
                      <span className="muted">{prettyKey(m.garmin_key)}</span> → {m.exercises?.name ?? "?"}
                    </span>
                    <button className="remove-x" onClick={() => removeMapping(m)} title="Ta bort mappning">✕</button>
                  </div>
                ))}
              </>
            )}
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
          <div key={ex.id} style={{ padding: "5px 0" }}>
            <div className="row-between">
              <span className="small">
                {ex.name} {ex.owner_id && <span className="badge">egen</span>}
                {goals[ex.id] && (
                  <span className="badge goal">{goals[ex.id].target_reps} reps · +{Number(goals[ex.id].increment)} kg</span>
                )}
              </span>
              <span className="row" style={{ gap: 2 }}>
                <button className="remove-x" title="Repmål för vikt-förslag" onClick={() => openGoal(ex)}>🎯</button>
                {ex.owner_id === uid && (
                  <button className="remove-x" onClick={() => removeExercise(ex)}>✕</button>
                )}
              </span>
            </div>
            {goalOpen === ex.id && (
              <div className="goal-edit">
                <div className="muted small" style={{ marginBottom: 6 }}>
                  När du klarat repmålet på toppvikten två pass i rad föreslår appen +ökningen.
                </div>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <label>Repmål</label>
                    <input
                      type="number" inputMode="numeric" min="1" max="50"
                      value={goalDraft.target_reps}
                      onChange={(e) => setGoalDraft((d) => ({ ...d, target_reps: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Ökning (kg)</label>
                    <input
                      type="number" inputMode="decimal" step="0.25" min="0.25"
                      value={goalDraft.increment}
                      onChange={(e) => setGoalDraft((d) => ({ ...d, increment: e.target.value }))}
                    />
                  </div>
                  <button className="btn btn-small" style={{ alignSelf: "flex-end" }} onClick={() => saveGoal(ex)}>
                    Spara
                  </button>
                </div>
              </div>
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
