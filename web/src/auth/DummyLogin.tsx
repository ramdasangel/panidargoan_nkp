import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "./AuthContext";

interface DummyUser {
  email: string;
  name: string;
  role: string;
}

export function DummyLogin() {
  const { t } = useTranslation();
  const { loginDummy } = useAuth();
  const [users, setUsers] = useState<DummyUser[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<DummyUser[]>("/api/auth/dummy/users")
      .then((u) => {
        setUsers(u);
        if (u[0]) setSelected(u[0].email);
      })
      .catch((e) => setError(String(e)));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await loginDummy(selected);
    } catch (err) {
      setError(t("login.failed") + ": " + String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={onSubmit}>
        <h1 style={styles.h1}>{t("app.title")}</h1>
        <p style={styles.sub}>{t("app.subtitle")}</p>
        <h2 style={styles.h2}>{t("login.heading")}</h2>
        <p style={styles.sub}>{t("login.subheading")}</p>

        {!users && <p>{t("login.loading")}</p>}

        {users && (
          <>
            <label style={styles.label}>{t("login.selectUser")}</label>
            <select style={styles.select} value={selected} onChange={(e) => setSelected(e.target.value)}>
              {users.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
            <button type="submit" style={styles.button} disabled={busy}>
              {t("login.signIn")}
            </button>
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f4f6f8",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  card: {
    background: "#fff",
    padding: 32,
    borderRadius: 12,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    width: 360,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  h1: { margin: 0, color: "#1976d2", fontSize: 24 },
  h2: { margin: "16px 0 4px", fontSize: 16 },
  sub: { margin: 0, color: "#666", fontSize: 13 },
  label: { fontSize: 12, color: "#555", marginTop: 12 },
  select: {
    padding: "8px 10px",
    fontSize: 14,
    border: "1px solid #ccc",
    borderRadius: 6,
    background: "#fff",
  },
  button: {
    marginTop: 16,
    padding: "10px 16px",
    fontSize: 14,
    background: "#1976d2",
    color: "#fff",
    border: 0,
    borderRadius: 6,
    cursor: "pointer",
  },
  error: { color: "#c62828", fontSize: 13, marginTop: 8 },
};
