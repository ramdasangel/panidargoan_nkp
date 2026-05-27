import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./auth/Login";
import { MapView } from "./components/MapView";
import { Sidebar } from "./components/Sidebar";
import { UserManagement } from "./components/UserManagement";
import { WaterAvailabilityReport } from "./components/WaterAvailabilityReport";
import { emptyState, type AddState } from "./components/AddWaterSource";
import { useMediaQuery } from "./hooks/useMediaQuery";
import type { MapLayers, WatershedNode } from "./types";

export function App() {
  const { t, i18n } = useTranslation();
  const { user, loading, logout } = useAuth();
  const [selectedWatershed, setSelectedWatershed] = useState<WatershedNode | null>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [layers, setLayers] = useState<MapLayers>({
    talukas: true, watersheds: true,
    waterSourcesManual: true,
    waterSourcesBhuvan: true,
    bhuvanWaterbodies: false,
    bhuvanWatersheds: false,
    bhuvanSubbasins: false,
  });
  const [addState, setAddState] = useState<AddState | null>(null);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => { setSidebarOpen(!isMobile); }, [isMobile]);

  function handleSelectWatershed(node: WatershedNode | null) {
    setSelectedWatershed(node);
  }

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>{t("login.loading")}</div>;
  }

  if (!user) return <Login />;

  return (
    <div style={layout.shell}>
      <header className="pdg-header" style={layout.header}>
        <div style={layout.brandRow}>
          <button
            className="pdg-hamburger"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <strong style={{ color: "#1976d2" }}>{t("app.title")}</strong>
          <span className="pdg-tagline" style={layout.sub}> — {t("app.subtitle")}</span>
        </div>
        <div className="pdg-header-controls" style={layout.controls}>
          <select
            value={i18n.language.startsWith("mr") ? "mr" : "en"}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={layout.select}
            aria-label={t("nav.language")}
          >
            <option value="en">{t("lang.en")}</option>
            <option value="mr">{t("lang.mr")}</option>
          </select>
          <span className="pdg-userinfo" style={layout.userInfo}>{user.name} ({user.role})</span>
          <button onClick={logout} style={layout.button}>{t("nav.logout")}</button>
        </div>
      </header>

      <main style={layout.main}>
        <Sidebar
          selectedId={selectedWatershed?.id ?? null}
          onSelect={handleSelectWatershed}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          isMobile={isMobile}
          layers={layers}
          onLayersChange={setLayers}
          onOpenAddWaterSource={() => setAddState(emptyState())}
          addModeActive={addState !== null}
          isAdmin={user.role === "admin"}
          onOpenUserManagement={() => setShowUserMgmt(true)}
          onOpenReport={() => setShowReport(true)}
        />
        <div style={layout.mapWrap}>
          <MapView
            focusWatershedId={selectedWatershed?.id ?? null}
            layers={layers}
            addState={addState}
            setAddState={setAddState}
          />
        </div>
      </main>

      {showUserMgmt && user.role === "admin" && (
        <UserManagement currentUserId={user.id} onClose={() => setShowUserMgmt(false)} />
      )}
      {showReport && (
        <WaterAvailabilityReport onClose={() => setShowReport(false)} />
      )}
    </div>
  );
}

const layout: Record<string, React.CSSProperties> = {
  shell: { height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif" },
  header: { padding: "10px 16px", background: "#fff", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
  brandRow: { display: "flex", alignItems: "center", gap: 6 },
  sub: { color: "#666", fontSize: 13 },
  controls: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  select: { padding: "4px 8px", fontSize: 13, borderRadius: 4, border: "1px solid #ccc" },
  userInfo: { fontSize: 13, color: "#333" },
  button: { padding: "6px 12px", background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", fontSize: 13 },
  main: { flex: 1, display: "flex", overflow: "hidden" },
  mapWrap: { flex: 1, position: "relative" },
};
