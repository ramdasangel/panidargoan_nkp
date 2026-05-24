import { useState, type Dispatch, type SetStateAction } from "react";
import { useMapEvents, CircleMarker, Polyline, Polygon } from "react-leaflet";
import type { LatLngTuple } from "leaflet";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import type { WaterSourceType } from "../types";

export type GeometryKind = "Point" | "LineString" | "Polygon";

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
  saving: boolean;
  error: string | null;
}

const POINT_TYPES: WaterSourceType[]   = ["well", "borewell", "check_dam", "bandhara", "kt_weir", "spring", "other"];
const LINE_TYPES: WaterSourceType[]    = ["river", "stream", "canal"];
const POLYGON_TYPES: WaterSourceType[] = ["pond", "lake", "percolation_tank", "farm_pond"];

const ALL_TYPES: WaterSourceType[] = [...POINT_TYPES, ...LINE_TYPES, ...POLYGON_TYPES];

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
    saving: false,
    error: null,
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

/** Form panel: lives OUTSIDE <MapContainer>, absolute-positioned over the map. */
export function AddWaterSourcePanel({ state, setState, onSaved }: Props) {
  const { t } = useTranslation();
  const [hint, setHint] = useState<string | null>(null);

  const canFinish =
    (state.geomKind === "Point" && state.points.length === 1) ||
    (state.geomKind === "LineString" && state.points.length >= 2) ||
    (state.geomKind === "Polygon" && state.points.length >= 3);

  function changeType(t: WaterSourceType) {
    setState({ ...state, type: t, geomKind: geomKindFor(t), points: [] });
  }

  function clearPoints() {
    setState({ ...state, points: [] });
  }

  function cancel() {
    setState(null);
  }

  async function save() {
    if (!canFinish) {
      setHint(t("addWS.needGeometry"));
      return;
    }
    if (!state.form.name.trim()) {
      setHint(t("addWS.needName"));
      return;
    }
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
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
      geometry = { type: "Polygon", coordinates: [ring] };
    }

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
        }),
      });
      onSaved();
      setState(null);
    } catch (e) {
      setState((s) => (s ? { ...s, saving: false, error: String(e) } : s));
    }
  }

  return (
    <div className="pdg-add-panel" style={styles.panel}>
      <div style={styles.header}>
        <strong>{t("addWS.title")}</strong>
        <button onClick={cancel} style={styles.close} aria-label="Close">×</button>
      </div>

      <label style={styles.label}>{t("addWS.type")}</label>
      <select value={state.type} onChange={(e) => changeType(e.target.value as WaterSourceType)} style={styles.select}>
        {ALL_TYPES.map((t2) => (
          <option key={t2} value={t2}>{t(`waterSource.type_${t2}`)}</option>
        ))}
      </select>

      <div style={styles.hint}>
        {state.geomKind === "Point"
          ? t("addWS.clickPoint")
          : state.geomKind === "LineString"
          ? t("addWS.clickLine", { count: state.points.length })
          : t("addWS.clickPolygon", { count: state.points.length })}
      </div>

      <div style={styles.row}>
        <span style={styles.small}>
          {t("addWS.pointsCount", { count: state.points.length })}
        </span>
        <button onClick={clearPoints} disabled={state.points.length === 0} style={styles.linkBtn}>
          {t("addWS.clearPoints")}
        </button>
      </div>

      <hr style={styles.hr} />

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

      {hint && <p style={styles.warn}>{hint}</p>}
      {state.error && <p style={styles.warn}>{state.error}</p>}

      <div style={styles.actions}>
        <button onClick={cancel} style={styles.btnCancel}>{t("addWS.cancel")}</button>
        <button onClick={save} disabled={state.saving || !canFinish} style={styles.btnSave}>
          {state.saving ? t("addWS.saving") : t("addWS.save")}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "absolute",
    top: 12, left: 180, // sits to the right of the LayerToggle
    width: 320,
    maxHeight: "calc(100% - 24px)",
    overflowY: "auto",
    background: "#fff",
    boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
    borderRadius: 8,
    padding: 14,
    zIndex: 1001,
    fontSize: 13,
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  close: { background: "none", border: 0, fontSize: 20, color: "#888", cursor: "pointer", lineHeight: 1 },
  label: { display: "block", fontSize: 11, color: "#666", marginTop: 8, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  select: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, background: "#fff" },
  input: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box" },
  textarea: { width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  hint: { background: "#fff3e0", color: "#bf6000", padding: "6px 8px", borderRadius: 4, fontSize: 12, marginTop: 8 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  small: { fontSize: 12, color: "#666" },
  linkBtn: { background: "none", border: 0, color: "#1976d2", cursor: "pointer", fontSize: 12, padding: 0 },
  hr: { border: 0, borderTop: "1px solid #eee", margin: "12px 0 6px" },
  warn: { background: "#ffebee", color: "#c62828", padding: "6px 8px", borderRadius: 4, fontSize: 12, marginTop: 8 },
  actions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  btnCancel: { padding: "6px 14px", background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", fontSize: 13 },
  btnSave: { padding: "6px 14px", background: "#1976d2", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer", fontSize: 13 },
};
