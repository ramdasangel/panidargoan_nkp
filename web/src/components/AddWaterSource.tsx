import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMapEvents, CircleMarker, Polyline, Polygon } from "react-leaflet";
import L, { type LatLngTuple } from "leaflet";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { WaterSourceType } from "../types";
import { buildKml, parseKml, type GeometryKind } from "../kml";

export type { GeometryKind };

export interface AddState {
  type: WaterSourceType;
  geomKind: GeometryKind;
  points: LatLngTuple[]; // [lat, lng]
  form: {
    name: string;
    capacityM3: string;
    depthM: string;
    condition: string;
    notes: string;
  };
  kmlInput: string;
  inputMode: "draw" | "kml";
  saving: boolean;
  error: string | null;
  collapsed: boolean;
}

const POINT_TYPES: WaterSourceType[]   = ["well", "borewell", "check_dam", "bandhara", "kt_weir", "spring", "other"];
const LINE_TYPES: WaterSourceType[]    = ["river", "stream", "canal"];
const POLYGON_TYPES: WaterSourceType[] = ["pond", "lake", "percolation_tank", "farm_pond"];

export function geomKindFor(t: WaterSourceType): GeometryKind {
  if (LINE_TYPES.includes(t)) return "LineString";
  if (POLYGON_TYPES.includes(t)) return "Polygon";
  return "Point";
}

export function emptyState(t: WaterSourceType = "well"): AddState {
  return {
    type: t,
    geomKind: geomKindFor(t),
    points: [],
    form: { name: "", capacityM3: "", depthM: "", condition: "operational", notes: "" },
    kmlInput: "",
    inputMode: "draw",
    saving: false,
    error: null,
    collapsed: false,
  };
}

interface Props {
  state: AddState;
  setState: Dispatch<SetStateAction<AddState | null>>;
  onSaved: () => void;
}

/** Drawing layer: lives inside <MapContainer>, captures clicks and renders preview. */
export function AddWaterSourceLayer({ state, setState }: Props) {
  useMapEvents({
    click(e) {
      if (state.inputMode !== "draw") return;
      const pt: LatLngTuple = [e.latlng.lat, e.latlng.lng];
      setState((s) => {
        if (!s) return s;
        if (s.geomKind === "Point") return { ...s, points: [pt] };
        return { ...s, points: [...s.points, pt] };
      });
    },
  });

  if (state.points.length === 0) return null;

  if (state.geomKind === "Point") {
    return (
      <CircleMarker
        center={state.points[0]}
        radius={8}
        pathOptions={{ color: "#fff", weight: 2, fillColor: "#d81b60", fillOpacity: 0.9 }}
      />
    );
  }

  if (state.geomKind === "LineString" && state.points.length >= 1) {
    return (
      <>
        <Polyline positions={state.points} pathOptions={{ color: "#d81b60", weight: 4, dashArray: "6 4" }} />
        {state.points.map((p, i) => (
          <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#d81b60", fillColor: "#d81b60", fillOpacity: 1 }} />
        ))}
      </>
    );
  }

  if (state.geomKind === "Polygon" && state.points.length >= 1) {
    return (
      <>
        {state.points.length >= 3 ? (
          <Polygon
            positions={state.points}
            pathOptions={{ color: "#d81b60", weight: 2, dashArray: "6 4", fillColor: "#d81b60", fillOpacity: 0.2 }}
          />
        ) : (
          <Polyline positions={state.points} pathOptions={{ color: "#d81b60", weight: 2, dashArray: "6 4" }} />
        )}
        {state.points.map((p, i) => (
          <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#d81b60", fillColor: "#d81b60", fillOpacity: 1 }} />
        ))}
      </>
    );
  }

  return null;
}

function metric(state: AddState): string {
  if (state.points.length === 0) return "—";
  if (state.geomKind === "Point") {
    const [lat, lng] = state.points[0];
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  if (state.geomKind === "LineString") {
    if (state.points.length < 2) return `${state.points.length} pt`;
    const latlngs = state.points.map((p) => L.latLng(p[0], p[1]));
    let total = 0;
    for (let i = 1; i < latlngs.length; i++) total += latlngs[i - 1].distanceTo(latlngs[i]);
    return total >= 1000 ? `${(total / 1000).toFixed(2)} km` : `${Math.round(total)} m`;
  }
  // Polygon — show vertex count + area via shoelace approximation
  if (state.points.length < 3) return `${state.points.length} pts`;
  const R = 6371000;
  let sum = 0;
  for (let i = 0; i < state.points.length; i++) {
    const [lat1, lng1] = state.points[i];
    const [lat2, lng2] = state.points[(i + 1) % state.points.length];
    sum += (((lng2 - lng1) * Math.PI) / 180) * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  const area = Math.abs((sum * R * R) / 2);
  return area >= 1_000_000 ? `${(area / 1_000_000).toFixed(2)} km²` : `${Math.round(area)} m²`;
}

/** Form panel: lives OUTSIDE <MapContainer>. */
export function AddWaterSourcePanel({ state, setState, onSaved }: Props) {
  const { t } = useTranslation();
  const [hint, setHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canFinish =
    (state.geomKind === "Point" && state.points.length === 1) ||
    (state.geomKind === "LineString" && state.points.length >= 2) ||
    (state.geomKind === "Polygon" && state.points.length >= 3);

  function changeType(t: WaterSourceType) {
    setState({ ...state, type: t, geomKind: geomKindFor(t), points: [], kmlInput: "" });
  }

  function clearPoints() {
    setState({ ...state, points: [] });
  }

  function undoLast() {
    if (state.points.length === 0) return;
    setState({ ...state, points: state.points.slice(0, -1) });
  }

  function cancel() {
    setState(null);
  }

  function applyKml() {
    const result = parseKml(state.kmlInput);
    if ("error" in result) {
      setHint(result.error);
      return;
    }
    if (result.kind !== state.geomKind) {
      setHint(t("addWS.kmlKindMismatch", { expected: result.kind, type: state.type }));
      return;
    }
    setHint(null);
    setState({ ...state, points: result.points, error: null });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setState((s) => (s ? { ...s, kmlInput: text } : s));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function save() {
    if (!canFinish) { setHint(t("addWS.needGeometry")); return; }
    if (!state.form.name.trim()) { setHint(t("addWS.needName")); return; }
    setHint(null);
    setState({ ...state, saving: true, error: null });

    let geometry: object;
    if (state.geomKind === "Point") {
      const [lat, lng] = state.points[0];
      geometry = { type: "Point", coordinates: [lng, lat] };
    } else if (state.geomKind === "LineString") {
      geometry = { type: "LineString", coordinates: state.points.map(([lat, lng]) => [lng, lat]) };
    } else {
      const ring = state.points.map(([lat, lng]) => [lng, lat]);
      const first = ring[0]; const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
      geometry = { type: "Polygon", coordinates: [ring] };
    }

    const pts2: Array<[number, number]> = state.points.map((p) => [p[0], p[1]]);
    const kmlToSend = state.kmlInput.trim() || buildKml(state.geomKind, pts2, state.form.name.trim());

    try {
      await api("/api/water-sources", {
        method: "POST",
        body: JSON.stringify({
          name: state.form.name.trim(),
          type: state.type,
          capacityM3: state.form.capacityM3 ? Number(state.form.capacityM3) : undefined,
          depthM: state.form.depthM ? Number(state.form.depthM) : undefined,
          condition: state.form.condition || undefined,
          notes: state.form.notes || undefined,
          geometry,
          kml: kmlToSend,
        }),
      });
      onSaved();
      setState(null);
    } catch (e) {
      setState((s) => (s ? { ...s, saving: false, error: String(e) } : s));
    }
  }

  if (state.collapsed) {
    return (
      <div className="pdg-add-panel pdg-add-collapsed">
        <div style={styles.collapsedBar}>
          <span style={styles.collapsedDot} />
          <div style={styles.collapsedLabel}>
            <strong style={{ fontSize: 13 }}>{t("addWS.title")}</strong>
            <span style={styles.collapsedMeta}>
              {t(`waterSource.type_${state.type}`)} · {state.points.length} {t("addWS.verticesShort")}
            </span>
          </div>
          <button
            onClick={() => setState({ ...state, collapsed: false })}
            style={styles.collapsedExpand}
            aria-label={t("addWS.openForm")}
            title={t("addWS.openForm")}
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
            </svg>
            {t("addWS.openForm")}
          </button>
          <button onClick={cancel} style={styles.collapsedClose} aria-label="Close" title="Cancel" type="button">×</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pdg-add-panel" style={styles.panel}>
      <div style={styles.header}>
        <strong>{t("addWS.title")}</strong>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setState({ ...state, collapsed: true })}
            style={styles.headerIconBtn}
            aria-label={t("addWS.collapse")}
            title={t("addWS.collapse")}
            type="button"
          >
            ⤡
          </button>
          <button onClick={cancel} style={styles.close} aria-label="Close" type="button">×</button>
        </div>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>{t("addWS.type")}</label>
        <select value={state.type} onChange={(e) => changeType(e.target.value as WaterSourceType)} style={styles.select}>
          <optgroup label={t("addWS.groupPoint")}>
            {POINT_TYPES.map((t2) => <option key={t2} value={t2}>{t(`waterSource.type_${t2}`)}</option>)}
          </optgroup>
          <optgroup label={t("addWS.groupLine")}>
            {LINE_TYPES.map((t2) => <option key={t2} value={t2}>{t(`waterSource.type_${t2}`)}</option>)}
          </optgroup>
          <optgroup label={t("addWS.groupPolygon")}>
            {POLYGON_TYPES.map((t2) => <option key={t2} value={t2}>{t(`waterSource.type_${t2}`)}</option>)}
          </optgroup>
        </select>
      </div>

      <div style={styles.section}>
        <div style={styles.tabs}>
          <button
            onClick={() => setState({ ...state, inputMode: "draw" })}
            style={{ ...styles.tab, ...(state.inputMode === "draw" ? styles.tabActive : {}) }}
            type="button"
          >
            {t("addWS.tabDraw")}
          </button>
          <button
            onClick={() => setState({ ...state, inputMode: "kml" })}
            style={{ ...styles.tab, ...(state.inputMode === "kml" ? styles.tabActive : {}) }}
            type="button"
          >
            {t("addWS.tabKml")}
          </button>
        </div>

        {state.inputMode === "draw" ? (
          <>
            <div style={styles.hint}>
              {state.geomKind === "Point"
                ? t("addWS.clickPoint")
                : state.geomKind === "LineString"
                ? t("addWS.clickLine", { count: state.points.length })
                : t("addWS.clickPolygon", { count: state.points.length })}
            </div>
            <div style={styles.metricsRow}>
              <span style={styles.metricsItem}>
                <span style={styles.metricsLabel}>{t("addWS.vertices")}</span>
                <strong>{state.points.length}</strong>
              </span>
              <span style={styles.metricsItem}>
                <span style={styles.metricsLabel}>
                  {state.geomKind === "Point" ? t("addWS.coord") : state.geomKind === "LineString" ? t("addWS.length") : t("addWS.area")}
                </span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{metric(state)}</strong>
              </span>
            </div>
            <div style={styles.geomActions}>
              <button onClick={undoLast} disabled={state.points.length === 0} style={styles.smallBtn} type="button">
                ↶ {t("addWS.undo")}
              </button>
              <button onClick={clearPoints} disabled={state.points.length === 0} style={styles.smallBtn} type="button">
                ✕ {t("addWS.clearPoints")}
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              value={state.kmlInput}
              onChange={(e) => setState({ ...state, kmlInput: e.target.value })}
              rows={5}
              style={{ ...styles.textarea, fontFamily: "ui-monospace, SF Mono, monospace", fontSize: 11 }}
              placeholder={t("addWS.kmlPlaceholder")}
              spellCheck={false}
            />
            <div style={styles.geomActions}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".kml,application/vnd.google-earth.kml+xml,text/xml"
                onChange={onPickFile}
                style={{ display: "none" }}
              />
              <button onClick={() => fileInputRef.current?.click()} style={styles.smallBtn} type="button">
                📁 {t("addWS.uploadKml")}
              </button>
              <button onClick={applyKml} disabled={!state.kmlInput.trim()} style={styles.smallBtnPrimary} type="button">
                {t("addWS.applyKml")}
              </button>
            </div>
            {state.points.length > 0 && (
              <div style={styles.kmlPreview}>
                ✓ {t("addWS.kmlParsed", { count: state.points.length })}
              </div>
            )}
          </>
        )}
      </div>

      <div style={styles.section}>
        <label style={styles.label}>{t("addWS.name")} *</label>
        <input
          value={state.form.name}
          onChange={(e) => setState({ ...state, form: { ...state.form, name: e.target.value } })}
          style={styles.input}
          placeholder={t("addWS.namePh")}
        />

        <div style={styles.twoCol}>
          <div>
            <label style={styles.label}>{t("waterSource.capacity")} ({t("waterSource.capacityUnit")})</label>
            <input
              type="number" min="0"
              value={state.form.capacityM3}
              onChange={(e) => setState({ ...state, form: { ...state.form, capacityM3: e.target.value } })}
              style={styles.input}
            />
          </div>
          <div>
            <label style={styles.label}>{t("waterSource.depth")} ({t("waterSource.depthUnit")})</label>
            <input
              type="number" min="0"
              value={state.form.depthM}
              onChange={(e) => setState({ ...state, form: { ...state.form, depthM: e.target.value } })}
              style={styles.input}
            />
          </div>
        </div>

        <label style={styles.label}>{t("waterSource.condition")}</label>
        <select
          value={state.form.condition}
          onChange={(e) => setState({ ...state, form: { ...state.form, condition: e.target.value } })}
          style={styles.select}
        >
          <option value="operational">operational</option>
          <option value="needs_repair">needs_repair</option>
          <option value="non_functional">non_functional</option>
          <option value="perennial">perennial</option>
          <option value="seasonal">seasonal</option>
        </select>

        <label style={styles.label}>{t("addWS.notes")}</label>
        <textarea
          value={state.form.notes}
          onChange={(e) => setState({ ...state, form: { ...state.form, notes: e.target.value } })}
          rows={2}
          style={styles.textarea}
        />
      </div>

      {hint && <p style={styles.warn}>{hint}</p>}
      {state.error && <p style={styles.warn}>{state.error}</p>}

      <div style={styles.actions}>
        <button onClick={cancel} style={styles.btnCancel} type="button">{t("addWS.cancel")}</button>
        <button onClick={save} disabled={state.saving || !canFinish} style={styles.btnSave} type="button">
          {state.saving ? t("addWS.saving") : t("addWS.save")}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: 12, left: 12,
    width: 360,
    maxHeight: "calc(100% - 24px)",
    overflowY: "auto",
    background: "#fff",
    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
    borderRadius: 8,
    padding: 0,
    zIndex: 1100,
    fontSize: 13,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid #eee", position: "sticky", top: 0, background: "#fff", zIndex: 1 },
  headerIconBtn: { background: "none", border: 0, fontSize: 16, color: "#888", cursor: "pointer", lineHeight: 1, padding: "2px 6px" },
  close: { background: "none", border: 0, fontSize: 22, color: "#888", cursor: "pointer", lineHeight: 1 },
  collapsedBar: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" },
  collapsedDot: { width: 8, height: 8, borderRadius: 4, background: "#d81b60", flexShrink: 0, animation: "pdg-pulse 1.6s ease-in-out infinite" },
  collapsedLabel: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" },
  collapsedMeta: { fontSize: 11, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  collapsedExpand: {
    background: "#1976d2", color: "#fff", border: 0, borderRadius: 4,
    padding: "6px 12px", fontSize: 13, cursor: "pointer", lineHeight: 1,
    display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600,
    boxShadow: "0 2px 6px rgba(25,118,210,0.4)",
    flexShrink: 0,
  },
  collapsedClose: { background: "#fff", color: "#888", border: "1px solid #e0e0e0", borderRadius: 4, width: 28, height: 28, cursor: "pointer", fontSize: 18, lineHeight: 1, flexShrink: 0 },
  section: { padding: "10px 14px", borderBottom: "1px solid #f4f4f4" },
  label: { display: "block", fontSize: 11, color: "#666", marginTop: 8, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  select: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, background: "#fff" },
  input: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box" },
  textarea: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  hint: { background: "#fff3e0", color: "#bf6000", padding: "6px 8px", borderRadius: 4, fontSize: 12, marginTop: 6 },
  metricsRow: { display: "flex", gap: 12, marginTop: 8, background: "#fafafa", padding: 8, borderRadius: 4 },
  metricsItem: { display: "flex", flexDirection: "column", gap: 2, fontSize: 12 },
  metricsLabel: { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.4 },
  geomActions: { display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" },
  smallBtn: { padding: "4px 10px", fontSize: 12, background: "#fff", border: "1px solid #ddd", borderRadius: 4, cursor: "pointer", color: "#555" },
  smallBtnPrimary: { padding: "4px 10px", fontSize: 12, background: "#1976d2", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer" },
  kmlPreview: { marginTop: 6, padding: "4px 8px", background: "#e8f5e9", color: "#2e7d32", fontSize: 12, borderRadius: 4 },
  tabs: { display: "flex", borderBottom: "1px solid #eee", marginBottom: 8 },
  tab: { flex: 1, padding: "6px 8px", border: 0, background: "transparent", borderBottom: "2px solid transparent", cursor: "pointer", fontSize: 13, color: "#666" },
  tabActive: { color: "#1976d2", borderBottomColor: "#1976d2", fontWeight: 500 },
  warn: { background: "#ffebee", color: "#c62828", padding: "6px 14px", margin: "8px 14px", borderRadius: 4, fontSize: 12 },
  actions: { display: "flex", gap: 8, justifyContent: "flex-end", padding: "10px 14px", borderTop: "1px solid #eee", position: "sticky", bottom: 0, background: "#fff" },
  btnCancel: { padding: "6px 14px", background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", fontSize: 13 },
  btnSave: { padding: "6px 14px", background: "#1976d2", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 13 },
};
