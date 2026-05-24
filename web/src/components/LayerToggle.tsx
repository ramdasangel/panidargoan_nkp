import { useTranslation } from "react-i18next";
import type { MapLayers } from "../types";

interface Props {
  layers: MapLayers;
  onChange: (next: MapLayers) => void;
  onAddWaterSource: () => void;
}

export function LayerToggle({ layers, onChange, onAddWaterSource }: Props) {
  const { t } = useTranslation();
  const overlays: Array<[keyof MapLayers, string]> = [
    ["villages", t("map.layerVillages")],
    ["talukas", t("map.layerTalukas")],
    ["watersheds", t("map.layerWatersheds")],
    ["waterSources", t("map.layerWaterSources")],
  ];

  return (
    <div className="pdg-layer-toggle" style={styles.box}>
      <strong style={styles.heading}>{t("map.layers")}</strong>
      {overlays.map(([key, label]) => (
        <label key={key} style={styles.row}>
          <input
            type="checkbox"
            checked={layers[key]}
            onChange={(e) => onChange({ ...layers, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <hr style={styles.hr} />
      <strong style={styles.heading}>{t("map.basemap")}</strong>
      <label style={styles.row}>
        <input
          type="checkbox"
          checked={layers.terrain}
          onChange={(e) => onChange({ ...layers, terrain: e.target.checked })}
        />
        {t("map.layerTerrain")}
      </label>
      <button onClick={onAddWaterSource} style={styles.addBtn}>
        + {t("addWS.openButton")}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 1000,
    background: "rgba(255,255,255,0.96)",
    padding: "10px 12px",
    borderRadius: 6,
    fontSize: 13,
    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 150,
  },
  heading: { fontSize: 11, color: "#555", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4 },
  row: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" },
  hr: { border: 0, borderTop: "1px solid #eee", margin: "8px 0 4px", width: "100%" },
  addBtn: {
    marginTop: 8,
    padding: "6px 10px",
    background: "#1976d2",
    color: "#fff",
    border: 0,
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  },
};
