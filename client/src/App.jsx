import { useEffect, useState, useCallback } from "react";
import { supabase, configOk } from "./supabase.js";
import Auth from "./views/Auth.jsx";
import LogWorkout from "./views/LogWorkout.jsx";
import History from "./views/History.jsx";
import Progress from "./views/Progress.jsx";
import More from "./views/More.jsx";

const TABS = [
  { id: "logga", label: "Logga", icon: "🏋️" },
  { id: "historik", label: "Historik", icon: "📅" },
  { id: "progress", label: "Progress", icon: "📈" },
  { id: "mer", label: "Mer", icon: "⚙️" }
];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = laddar
  const [tab, setTab] = useState("logga");
  const [editWorkout, setEditWorkout] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!configOk) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Garmin-synk vid appöppning (tyst — misslyckas den märks inget, knappen finns under Mer)
  const runSync = useCallback(
    async (action) => {
      try {
        const { data, error } = await supabase.functions.invoke("garmin-sync", {
          body: { action: action ?? "sync" }
        });
        if (error || !data) return null;
        setSyncResult(data);
        setPendingCount(data.pendingUnmapped?.length ?? 0);
        if (data.imported > 0) {
          showToast(`${data.imported} nya pass hämtade från Garmin`);
          bumpRefresh();
        }
        return data;
      } catch {
        return null;
      }
    },
    [showToast, bumpRefresh]
  );

  useEffect(() => {
    if (session) runSync("sync");
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!configOk) {
    return (
      <div className="auth-wrap">
        <div className="auth-logo">🏋️</div>
        <h1 className="auth-title">Träningslogg</h1>
        <div className="info-box">
          Appen är inte konfigurerad ännu. Kopiera <code>client/.env.example</code> till{" "}
          <code>client/.env</code> och fyll i Supabase-URL och anon-nyckel, starta sedan om.
        </div>
      </div>
    );
  }

  if (session === undefined) return null;
  if (!session) return <Auth />;

  const startEdit = (workout) => {
    setEditWorkout(workout);
    setTab("logga");
  };

  return (
    <>
      <main className="app-main">
        {tab === "logga" && (
          <LogWorkout
            key={editWorkout ? `edit-${editWorkout.id}` : `new-${refreshKey}`}
            editWorkout={editWorkout}
            onDone={() => {
              setEditWorkout(null);
              bumpRefresh();
              showToast("Passet sparat 💪");
            }}
            onCancelEdit={() => setEditWorkout(null)}
          />
        )}
        {tab === "historik" && (
          <History key={refreshKey} onEdit={startEdit} onChanged={bumpRefresh} showToast={showToast} />
        )}
        {tab === "progress" && <Progress key={refreshKey} />}
        {tab === "mer" && (
          <More
            session={session}
            syncResult={syncResult}
            runSync={runSync}
            showToast={showToast}
            onImported={bumpRefresh}
          />
        )}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            {t.label}
            {t.id === "mer" && pendingCount > 0 && <span className="badge-dot" />}
          </button>
        ))}
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
