import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapLayers } from "../types";

interface Props {
  layers: MapLayers;
  onChange: (next: MapLayers) => void;
}

export function LayersControl({ layers, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const overlays: Array<[keyof MapLayers, string]> = [
    ["villages", t("map.layerVillages")],
    ["talukas", t("map.layerTalukas")],
    ["watersheds", t("map.layerWatersheds")],
    ["waterSources", t("map.layerWaterSources")],
  ];

  return (
    <div className="pdg-layers-control" ref={wrapRef}>
      <button
        className="pdg-layers-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("map.layers")}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z" />
        </svg>
      </button>
      {open && (
        <div className="pdg-layers-panel">
          <div className="pdg-layers-section-label">{t("map.layers")}</div>
          {overlays.map(([key, label]) => (
            <label key={key} className="pdg-layers-row">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => onChange({ ...layers, [key]: e.target.checked })}
              />
              <span>{label}</span>
            </label>
          ))}
          <div className="pdg-layers-divider" />
          <div className="pdg-layers-section-label">{t("map.basemap")}</div>
          <label className="pdg-layers-row">
            <input
              type="checkbox"
              checked={layers.terrain}
              onChange={(e) => onChange({ ...layers, terrain: e.target.checked })}
            />
            <span>{t("map.layerTerrain")}</span>
          </label>
        </div>
      )}
    </div>
  );
}
