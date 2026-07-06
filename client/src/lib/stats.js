// Uppskattat 1RM enligt Epley: vikt × (1 + reps/30). Vid 1 rep = vikten själv.
export function epley(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

// workouts: [{date, sets: [{reps, weight}]}] för EN övning
// -> graf-data per datum + personliga rekord
export function buildProgress(workouts) {
  const chart = workouts
    .map((w) => {
      const active = w.sets.filter((s) => s.reps > 0);
      if (active.length === 0) return null;
      const bestWeight = Math.max(...active.map((s) => Number(s.weight)));
      const bestE1rm = Math.max(...active.map((s) => epley(Number(s.weight), s.reps)));
      const volume = active.reduce((sum, s) => sum + Number(s.weight) * s.reps, 0);
      return {
        date: w.date,
        bestWeight,
        e1rm: Math.round(bestE1rm * 10) / 10,
        volume: Math.round(volume)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  let maxWeight = null;
  let maxE1rm = null;
  let maxVolume = null;
  for (const w of workouts) {
    for (const s of w.sets) {
      if (s.reps <= 0) continue;
      const weight = Number(s.weight);
      if (!maxWeight || weight > maxWeight.weight) {
        maxWeight = { weight, reps: s.reps, date: w.date };
      }
      const e = epley(weight, s.reps);
      if (!maxE1rm || e > maxE1rm.value) {
        maxE1rm = { value: Math.round(e * 10) / 10, weight, reps: s.reps, date: w.date };
      }
    }
  }
  for (const c of chart) {
    if (!maxVolume || c.volume > maxVolume.volume) {
      maxVolume = { volume: c.volume, date: c.date };
    }
  }

  return { chart, prs: { maxWeight, maxE1rm, maxVolume } };
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export function formatDateLong(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Export: alla pass -> CSV-rader (en rad per set)
export function workoutsToCsv(workouts) {
  const rows = [["datum", "övning", "set", "reps", "vikt_kg", "källa", "anteckning"]];
  for (const w of workouts) {
    for (const s of w.sets) {
      rows.push([
        w.date,
        s.exercises?.name ?? "",
        s.set_number,
        s.reps,
        String(s.weight).replace(".", ","),
        w.source,
        w.note ?? ""
      ]);
    }
  }
  return rows
    .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
    .join("\r\n");
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
