import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

interface DummyUser {
  email: string;
  name: string;
  role: string;
}

export function Login() {
  const { t } = useTranslation();
  const { methods, loginDummy, loginGoogle } = useAuth();
  const [users, setUsers] = useState<DummyUser[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const showDummy = methods?.authMode === "dummy" || methods?.authMode === "both";
  const showGoogle = (methods?.authMode === "google" || methods?.authMode === "both") && !!methods?.googleClientId;

  useEffect(() => {
    if (!showDummy) return;
    api<DummyUser[]>("/api/auth/dummy/users")
      .then((u) => { setUsers(u); if (u[0]) setSelected(u[0].email); })
      .catch((e) => setError(String(e)));
  }, [showDummy]);

  async function onDummySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true); setError(null);
    try { await loginDummy(selected); }
    catch (err) { setError(t("login.failed") + ": " + String(err)); }
    finally { setBusy(false); }
  }

  async function onGoogleSuccess(credential: string) {
    setBusy(true); setError(null);
    try { await loginGoogle(credential); }
    catch (err) { setError(t("login.failed") + ": " + String(err)); }
    finally { setBusy(false); }
  }

  const dummyForm = (
    <form style={styles.card} onSubmit={onDummySubmit}>
      <h2 style={styles.h2}>{t("login.heading")}</h2>
      <p style={styles.sub}>{t("login.subheading")}</p>
      {!users && showDummy && <p>{t("login.loading")}</p>}
      {users && (
        <>
          <label style={styles.label}>{t("login.selectUser")}</label>
          <select style={styles.select} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {users.map((u) => (<option key={u.email} value={u.email}>{u.name} — {u.role}</option>))}
          </select>
          <button type="submit" style={styles.button} disabled={busy}>{t("login.signIn")}</button>
        </>
      )}
    </form>
  );

  const googleForm = (
    <div style={styles.card}>
      <h2 style={styles.h2}>{t("login.signInWithGoogle")}</h2>
      <p style={styles.sub}>{t("login.googleHint")}</p>
      <div style={styles.googleWrap}>
        <GoogleLogin
          onSuccess={(r) => r.credential && onGoogleSuccess(r.credential)}
          onError={() => setError(t("login.failed"))}
          useOneTap={false}
          theme="filled_blue"
          size="large"
          width="280"
        />
      </div>
    </div>
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.center}>
        <h1 style={styles.h1}>{t("app.title")}</h1>
        <p style={styles.sub}>{t("app.subtitle")}</p>
        {showGoogle && (
          <GoogleOAuthProvider clientId={methods!.googleClientId!}>
            {googleForm}
          </GoogleOAuthProvider>
        )}
        {showDummy && dummyForm}
        {!showGoogle && !showDummy && methods && (
          <div style={styles.card}>
            <p style={styles.warn}>{t("login.noMethods")}</p>
          </div>
        )}
        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6f8", fontFamily: "system-ui, -apple-system, sans-serif" },
  center: { width: 360, display: "flex", flexDirection: "column", gap: 16, padding: "0 16px" },
  card: { background: "#fff", padding: 24, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: 6 },
  h1: { margin: 0, color: "#1976d2", fontSize: 26, textAlign: "center" },
  h2: { margin: "0 0 4px", fontSize: 15 },
  sub: { margin: 0, color: "#666", fontSize: 13, textAlign: "center" },
  label: { fontSize: 11, color: "#555", marginTop: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  select: { padding: "8px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6, background: "#fff" },
  button: { marginTop: 12, padding: "10px 16px", fontSize: 14, background: "#1976d2", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer" },
  googleWrap: { display: "flex", justifyContent: "center", padding: "8px 0" },
  warn: { color: "#bf6000", fontSize: 13 },
  error: { color: "#c62828", fontSize: 13, textAlign: "center" },
};
