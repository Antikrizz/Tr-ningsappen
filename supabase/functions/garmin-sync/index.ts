// Edge Function: hämtar styrkepass från Garmin Connect (inofficiellt API via garmin-connect)
// och skriver in dem som workouts + sets. Anropas av klienten vid appöppning och manuellt.
//
// Actions (POST-body { action }):
//   "sync"            – hämta nya aktiviteter från Garmin och importera
//   "process-pending" – försök importera pass som väntar på övningsmappning
//
// Tokens skapas EN gång lokalt med garmin/link.mjs och ligger i tabellen garmin_tokens
// (endast åtkomlig med service role). Funktionen loggar aldrig in med lösenord.

import { createClient } from "npm:@supabase/supabase-js@2";
import { GarminConnect } from "npm:garmin-connect@1.6.2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Inbyggd mappning: Garmins övningsnycklar -> namn på delade standardövningar.
// Nycklar användaren mappat själv (tabellen garmin_mappings) har företräde.
const DEFAULT_MAP: Record<string, string> = {
  BENCH_PRESS: "Bänkpress",
  BARBELL_BENCH_PRESS: "Bänkpress",
  DUMBBELL_BENCH_PRESS: "Hantelpress",
  INCLINE_DUMBBELL_BENCH_PRESS: "Lutande hantelpress",
  INCLINE_BARBELL_BENCH_PRESS: "Lutande hantelpress",
  SQUAT: "Knäböj",
  BARBELL_BACK_SQUAT: "Knäböj",
  BARBELL_FRONT_SQUAT: "Knäböj",
  DEADLIFT: "Marklyft",
  BARBELL_DEADLIFT: "Marklyft",
  ROMANIAN_DEADLIFT: "Rumänsk marklyft",
  BARBELL_ROMANIAN_DEADLIFT: "Rumänsk marklyft",
  SHOULDER_PRESS: "Axelpress",
  OVERHEAD_PRESS: "Axelpress",
  MILITARY_PRESS: "Axelpress",
  DUMBBELL_SHOULDER_PRESS: "Axelpress",
  LAT_PULLDOWN: "Latsdrag",
  PULL_DOWN: "Latsdrag",
  PULL_UP: "Chins",
  CHIN_UP: "Chins",
  DIP: "Dips",
  TRICEPS_DIP: "Dips",
  ROW: "Skivstångsrodd",
  BARBELL_ROW: "Skivstångsrodd",
  BENT_OVER_ROW_WITH_BARBELL: "Skivstångsrodd",
  SEATED_CABLE_ROW: "Sittande rodd",
  DUMBBELL_ROW: "Hantelrodd",
  ONE_ARM_DUMBBELL_ROW: "Hantelrodd",
  CURL: "Bicepscurl",
  BICEPS_CURL: "Bicepscurl",
  STANDING_DUMBBELL_BICEPS_CURL: "Bicepscurl",
  BARBELL_BICEPS_CURL: "Bicepscurl",
  HAMMER_CURL: "Hammercurl",
  TRICEPS_EXTENSION: "Triceps pushdown",
  CABLE_TRICEPS_PUSHDOWN: "Triceps pushdown",
  TRICEPS_PRESSDOWN: "Triceps pushdown",
  LEG_PRESS: "Benpress",
  SLED_LEG_PRESS: "Benpress",
  LUNGE: "Utfall",
  HIP_RAISE: "Höftlyft",
  BARBELL_HIP_THRUST: "Höftlyft",
  CALF_RAISE: "Vadpress",
  STANDING_CALF_RAISE: "Vadpress",
  LATERAL_RAISE: "Sidolyft",
  DUMBBELL_LATERAL_RAISE: "Sidolyft",
  LEG_EXTENSION: "Benspark",
  LEG_CURL: "Lårcurl",
  SEATED_LEG_CURL: "Lårcurl",
  LYING_LEG_CURL: "Lårcurl",
  PLANK: "Magträning (plankan)",
  SIT_UP: "Situps",
  CRUNCH: "Situps",
  FACE_PULL: "Facepull"
};

type PendingSet = { key: string; reps: number; weightKg: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // identifiera anropande användare via JWT:n
    const authHeader = req.headers.get("Authorization") ?? "";
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userErr } = await anon.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "not authenticated" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "sync";

    // tokens?
    const { data: tokenRow } = await service
      .from("garmin_tokens")
      .select("token_data")
      .eq("user_id", userId)
      .maybeSingle();
    if (!tokenRow) return json({ linked: false, imported: 0, pendingUnmapped: [] });

    // användarens egna mappningar + delade/egna övningar
    const [{ data: mappings }, { data: exercises }] = await Promise.all([
      service.from("garmin_mappings").select("garmin_key,exercise_id").eq("user_id", userId),
      service.from("exercises").select("id,name,owner_id").or(`owner_id.is.null,owner_id.eq.${userId}`)
    ]);
    const userMap = new Map((mappings ?? []).map((m) => [m.garmin_key, m.exercise_id]));
    const sharedByName = new Map(
      (exercises ?? []).filter((e) => e.owner_id === null).map((e) => [e.name, e.id])
    );

    const resolveKey = (key: string): number | null => {
      if (userMap.has(key)) return userMap.get(key)!;
      const swedish = DEFAULT_MAP[key];
      if (swedish && sharedByName.has(swedish)) return sharedByName.get(swedish)!;
      return null;
    };

    let imported = 0;

    const importIfResolved = async (
      activityId: number,
      date: string,
      sets: PendingSet[],
      note: string | null
    ): Promise<string[]> => {
      const unmapped = [...new Set(sets.filter((s) => resolveKey(s.key) === null).map((s) => s.key))];
      if (unmapped.length > 0) return unmapped;

      const { data: w, error: wErr } = await service
        .from("workouts")
        .insert({
          user_id: userId,
          date,
          note,
          source: "garmin",
          garmin_activity_id: activityId
        })
        .select("id")
        .single();
      if (wErr) {
        // unique-krock på garmin_activity_id = redan importerad (race) -> hoppa över tyst
        if (wErr.code === "23505") return [];
        throw wErr;
      }

      // set-nummer räknas per övning, i den ordning seten kördes
      const counter = new Map<number, number>();
      const rows = sets.map((s) => {
        const exId = resolveKey(s.key)!;
        const n = (counter.get(exId) ?? 0) + 1;
        counter.set(exId, n);
        return {
          workout_id: w.id,
          exercise_id: exId,
          set_number: n,
          reps: s.reps,
          weight: s.weightKg
        };
      });
      const { error: sErr } = await service.from("sets").insert(rows);
      if (sErr) throw sErr;
      imported++;
      return [];
    };

    if (action === "process-pending") {
      const { data: pendingRows } = await service
        .from("garmin_pending")
        .select("activity_id,date,payload")
        .eq("user_id", userId);
      const stillUnmapped = new Set<string>();
      for (const p of pendingRows ?? []) {
        const sets = (p.payload?.sets ?? []) as PendingSet[];
        const unmapped = await importIfResolved(p.activity_id, p.date, sets, p.payload?.name ?? null);
        if (unmapped.length === 0) {
          await service.from("garmin_pending").delete().eq("activity_id", p.activity_id);
        } else {
          unmapped.forEach((k) => stillUnmapped.add(k));
        }
      }
      return json({ linked: true, imported, pendingUnmapped: [...stillUnmapped] });
    }

    // ===== action: "sync" =====
    const gc = new GarminConnect({ username: "", password: "" });
    gc.loadToken(tokenRow.token_data.oauth1, tokenRow.token_data.oauth2);

    const activities = await gcGet(
      gc,
      "https://connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=30"
    );
    const strength = (activities ?? []).filter(
      (a: any) => a?.activityType?.typeKey === "strength_training"
    );

    // vilka är redan importerade eller väntande?
    const [{ data: doneRows }, { data: pendRows }] = await Promise.all([
      service
        .from("workouts")
        .select("garmin_activity_id")
        .eq("user_id", userId)
        .not("garmin_activity_id", "is", null),
      service.from("garmin_pending").select("activity_id,unmapped").eq("user_id", userId)
    ]);
    const known = new Set([
      ...(doneRows ?? []).map((r) => Number(r.garmin_activity_id)),
      ...(pendRows ?? []).map((r) => Number(r.activity_id))
    ]);
    const pendingUnmapped = new Set<string>((pendRows ?? []).flatMap((r) => r.unmapped ?? []));

    for (const act of strength) {
      const activityId = Number(act.activityId);
      if (known.has(activityId)) continue;

      const detail = await gcGet(
        gc,
        `https://connectapi.garmin.com/activity-service/activity/${activityId}/exerciseSets`
      );
      const rawSets = (detail?.exerciseSets ?? []).filter(
        (s: any) => s.setType === "ACTIVE" && (s.repetitionCount ?? 0) > 0
      );
      if (rawSets.length === 0) continue;

      const sets: PendingSet[] = rawSets.map((s: any) => ({
        key: s.exercises?.[0]?.name ?? s.exercises?.[0]?.category ?? "UNKNOWN",
        reps: s.repetitionCount,
        // Garmin anger vikt i gram
        weightKg: s.weight ? Math.round((s.weight / 1000) * 100) / 100 : 0
      }));
      const date = String(act.startTimeLocal ?? act.startTimeGMT ?? "").slice(0, 10);
      if (!date) continue;

      const unmapped = await importIfResolved(activityId, date, sets, act.activityName ?? null);
      if (unmapped.length > 0) {
        await service.from("garmin_pending").upsert({
          activity_id: activityId,
          user_id: userId,
          date,
          payload: { sets, name: act.activityName ?? null },
          unmapped
        });
        unmapped.forEach((k) => pendingUnmapped.add(k));
      }
    }

    // spara ev. förnyade tokens så nästa anrop slipper refresh
    try {
      const client: any = (gc as any).client;
      if (client?.oauth1Token && client?.oauth2Token) {
        await service.from("garmin_tokens").upsert({
          user_id: userId,
          token_data: { oauth1: client.oauth1Token, oauth2: client.oauth2Token },
          updated_at: new Date().toISOString()
        });
      }
    } catch (_) { /* tokensparning är best effort */ }

    return json({ linked: true, imported, pendingUnmapped: [...pendingUnmapped] });
  } catch (err) {
    console.error("garmin-sync error:", err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

// garmin-connect-biblioteket exponerar en autentisierad GET (inkl. token-refresh);
// exakt metodnamn har varierat mellan versioner, så vi provar i tur och ordning.
async function gcGet(gc: any, url: string): Promise<any> {
  if (typeof gc.get === "function") return await gc.get(url);
  if (gc.client && typeof gc.client.get === "function") return await gc.client.get(url);
  const token = gc.client?.oauth2Token?.access_token ?? gc.oauth2Token?.access_token;
  if (!token) throw new Error("Hittar ingen Garmin-token att använda");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Garmin svarade ${res.status} för ${url}`);
  return await res.json();
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
