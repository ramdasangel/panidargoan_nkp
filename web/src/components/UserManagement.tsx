import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { Role } from "../auth/AuthContext";

interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  hasGoogle: boolean;
  createdAt: string;
}

const ROLES: Role[] = ["admin", "project_manager", "field_user", "viewer"];

interface Props {
  currentUserId: string;
  onClose: () => void;
}

export function UserManagement({ currentUserId, onClose }: Props) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");

  async function refresh() {
    try { setUsers(await api<ManagedUser[]>("/api/users")); }
    catch (e) { setError(String(e)); }
  }

  useEffect(() => { refresh(); }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setBusy(true); setError(null);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || undefined, role: newRole }),
      });
      setNewEmail(""); setNewName(""); setNewRole("viewer");
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function changeRole(id: string, role: Role) {
    setBusy(true); setError(null);
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(t("users.confirmDelete", { email }))) return;
    setBusy(true); setError(null);
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }

  const grouped: Record<Role, ManagedUser[]> = {
    admin: [], project_manager: [], field_user: [], viewer: [],
  };
  if (users) for (const u of users) grouped[u.role].push(u);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div className="pdg-user-modal" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <strong>{t("users.title")}</strong>
          <button onClick={onClose} style={styles.close} aria-label="Close">×</button>
        </div>

        <form onSubmit={addUser} style={styles.addForm}>
          <div style={styles.addRow}>
            <input
              type="email" required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t("users.emailPh")}
              style={styles.input}
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("users.namePh")}
              style={styles.input}
            />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} style={styles.select}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`users.role_${r}`)}</option>)}
            </select>
            <button type="submit" disabled={busy || !newEmail.trim()} style={styles.addBtn}>
              {t("users.add")}
            </button>
          </div>
          <p style={styles.hint}>{t("users.addHint")}</p>
        </form>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.body}>
          {!users && <p style={styles.muted}>{t("map.loading")}</p>}
          {users && ROLES.map((role) => (
            <section key={role} style={styles.section}>
              <h3 style={styles.sectionH}>
                {t(`users.role_${role}`)}
                <span style={styles.count}>{grouped[role].length}</span>
              </h3>
              {grouped[role].length === 0 && <p style={styles.muted}>{t("users.noneInRole")}</p>}
              {grouped[role].map((u) => (
                <div key={u.id} style={styles.userRow}>
                  <div style={styles.userInfo}>
                    <div style={styles.userEmail}>
                      {u.email}
                      {u.hasGoogle && <span style={styles.googleBadge} title="Signed in with Google">G</span>}
                      {u.id === currentUserId && <span style={styles.youBadge}>{t("users.you")}</span>}
                    </div>
                    <div style={styles.userMeta}>{u.name}</div>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value as Role)}
                    disabled={busy}
                    style={styles.roleSelect}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{t(`users.role_${r}`)}</option>)}
                  </select>
                  <button
                    onClick={() => deleteUser(u.id, u.email)}
                    disabled={busy || u.id === currentUserId}
                    style={styles.deleteBtn}
                    aria-label={t("users.delete")}
                    title={u.id === currentUserId ? t("users.cantDeleteSelf") : t("users.delete")}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" },
  modal: { background: "#fff", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", width: "100%", maxWidth: 720, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", fontSize: 13 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #eee", fontSize: 15 },
  close: { background: "none", border: 0, fontSize: 24, color: "#888", cursor: "pointer", lineHeight: 1 },
  addForm: { padding: "12px 18px", background: "#fafafa", borderBottom: "1px solid #eee" },
  addRow: { display: "grid", gridTemplateColumns: "minmax(180px, 2fr) minmax(120px, 1.5fr) 140px auto", gap: 8 },
  input: { padding: "6px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, minWidth: 0 },
  select: { padding: "6px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, background: "#fff" },
  addBtn: { padding: "6px 16px", background: "#1976d2", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 13, fontWeight: 500 },
  hint: { margin: "8px 0 0", fontSize: 11, color: "#777" },
  error: { padding: "8px 18px", background: "#ffebee", color: "#c62828", fontSize: 12 },
  body: { padding: "8px 18px 16px", overflow: "auto", flex: 1 },
  section: { marginTop: 12 },
  sectionH: { fontSize: 12, color: "#555", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 },
  count: { background: "#e3f2fd", color: "#1565c0", borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 600 },
  muted: { color: "#999", fontSize: 12, margin: "4px 0 0" },
  userRow: { display: "grid", gridTemplateColumns: "1fr 140px 32px", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid #f4f4f4" },
  userInfo: { minWidth: 0 },
  userEmail: { fontSize: 13, display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userMeta: { fontSize: 11, color: "#888", marginTop: 1 },
  googleBadge: { background: "#e3f2fd", color: "#1565c0", fontSize: 9, padding: "1px 5px", borderRadius: 8, fontWeight: 700 },
  youBadge: { background: "#fff3e0", color: "#bf6000", fontSize: 9, padding: "1px 5px", borderRadius: 8, fontWeight: 600 },
  roleSelect: { padding: "4px 6px", fontSize: 12, border: "1px solid #ccc", borderRadius: 4, background: "#fff" },
  deleteBtn: { width: 28, height: 28, border: "1px solid #eee", background: "#fff", color: "#c62828", cursor: "pointer", borderRadius: 4, fontSize: 14 },
};
