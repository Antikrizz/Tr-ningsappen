import { useState } from "react";
import { supabase } from "../supabase.js";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } }
        });
        if (error) throw error;
        if (data.session) {
          await supabase.from("profiles").upsert({ id: data.session.user.id, name });
        } else {
          setInfo("Konto skapat! Kolla din mejl och bekräfta adressen, logga sedan in.");
          setMode("login");
        }
      }
    } catch (err) {
      setError(translateAuthError(err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-logo">🏋️</div>
      <h1 className="auth-title">Träningslogg</h1>

      <form onSubmit={submit}>
        {mode === "signup" && (
          <>
            <label>Namn</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Kristian" />
          </>
        )}
        <label>E-post</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label>Lösenord</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        {error && <div className="error-box">{error}</div>}
        {info && <div className="info-box">{info}</div>}

        <div className="spacer" />
        <button className="btn" disabled={busy}>
          {busy ? "Vänta…" : mode === "login" ? "Logga in" : "Skapa konto"}
        </button>
      </form>

      <div className="spacer" />
      <button className="link" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}>
        {mode === "login" ? "Ny här? Skapa konto" : "Har redan konto? Logga in"}
      </button>
    </div>
  );
}

function translateAuthError(msg) {
  if (!msg) return "Något gick fel.";
  if (msg.includes("Invalid login credentials")) return "Fel e-post eller lösenord.";
  if (msg.includes("already registered")) return "E-postadressen är redan registrerad.";
  if (msg.includes("at least 6 characters")) return "Lösenordet måste vara minst 6 tecken.";
  if (msg.includes("Email not confirmed")) return "E-postadressen är inte bekräftad ännu — kolla din inkorg.";
  return msg;
}
