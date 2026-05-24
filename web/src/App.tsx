import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth/AuthContext";
import { DummyLogin } from "./auth/DummyLogin";
import { MapView } from "./components/MapView";
import { WatershedSidebar } from "./components/WatershedSidebar";
import type { WatershedNode } from "./types";

export function App() {
  const { t, i18n } = useTranslation();
  const { user, loading, logout } = useAuth();
  const [selectedWatershed, setSelectedWatershed] = useState<WatershedNode | null>(null);

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>{t("login.loading")}</div>;
  }

  if (!user) return <DummyLogin />;

  return (
    <div style={layout.shell}>
      <header style={layout.header}>
        <div>
          <strong style={{ color: "#1976d2" }}>{t("app.title")}</strong>
          <span style={layout.sub}> — {t("app.subtitle")}</span>
        </div>
        <div style={layout.controls}>
          <label style={layout.label}>{t("nav.language")}:</label>
          <select
            value={i18n.language.startsWith("mr") ? "mr" : "en"}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={layout.select}
          >
            <option value="en">{t("lang.en")}</option>
            <option value="mr">{t("lang.mr")}</option>
          </select>
          <span style={layout.userInfo}>{user.name} ({user.role})</span>
          <button onClick={logout} style={layout.button}>{t("nav.logout")}</button>
        </div>
      </header>

      <main style={layout.main}>
        <WatershedSidebar
          selectedId={selectedWatershed?.id ?? null}
          onSelect={setSelectedWatershed}
        />
        <div style={layout.mapWrap}>
          <MapView focusWatershedId={selectedWatershed?.id ?? null} />
        </div>
      </main>
    </div>
  );
}

const layout: Record<string, React.CSSProperties> = {
  shell: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  header: {
    padding: "10px 16px",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  sub: { color: "#666", fontSize: 13 },
  controls: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  label: { fontSize: 13, color: "#555" },
  select: { padding: "4px 8px", fontSize: 13, borderRadius: 4, border: "1px solid #ccc" },
  userInfo: { fontSize: 13, color: "#333" },
  button: {
    padding: "6px 12px",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
  },
  main: { flex: 1, display: "flex", overflow: "hidden" },
  mapWrap: { flex: 1, position: "relative" },
};
