import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { LayerToggle } from "./LayerToggle";
import { AddWaterSourceLayer, AddWaterSourcePanel, emptyState, type AddState } from "./AddWaterSource";
import type { MapLayers, WaterSourceType } from "../types";

interface Props {
  focusWatershedId: string | null;
}

interface VillageProps {
  id: string;
  code: string;
  name: string;
  population?: number | null;
  cattleCount?: number | null;
  sheepGoatCount?: number | null;
  avgSlopePercent?: number | null;
}

interface WaterSourceProps {
  id: string;
  code: string;
  name: string;
  type: WaterSourceType;
  capacityM3?: number | null;
  depthM?: number | null;
  condition?: string | null;
}

const WATER_SOURCE_COLOR: Record<WaterSourceType, string> = {
  river: "#1565c0", stream: "#42a5f5", canal: "#26c6da",
  pond: "#26a69a", lake: "#00897b", percolation_tank: "#4db6ac", farm_pond: "#80cbc4",
  well: "#283593", borewell: "#1a237e", spring: "#43a047",
  check_dam: "#ef6c00", bandhara: "#e65100", kt_weir: "#f57c00",
  other: "#757575",
};

export function MapView({ focusWatershedId }: Props) {
  const { t } = useTranslation();
  const [villages, setVillages] = useState<FeatureCollection | null>(null);
  const [talukas, setTalukas] = useState<FeatureCollection | null>(null);
  const [watersheds, setWatersheds] = useState<FeatureCollection | null>(null);
  const [waterSources, setWaterSources] = useState<FeatureCollection | null>(null);
  const [layers, setLayers] = useState<MapLayers>({
    villages: true, talukas: true, watersheds: true, waterSources: true, terrain: false,
  });
  const [addState, setAddState] = useState<AddState | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    api<FeatureCollection>("/api/boundaries/villages").then(setVillages).catch(console.error);
    api<FeatureCollection>("/api/boundaries/talukas").then(setTalukas).catch(console.error);
    api<FeatureCollection>("/api/boundaries/watersheds").then(setWatersheds).catch(console.error);
  }, []);

  useEffect(() => {
    api<FeatureCollection>("/api/boundaries/water-sources").then(setWaterSources).catch(console.error);
  }, [refreshTick]);

  const focused = useMemo(() => {
    if (!focusWatershedId || !watersheds) return null;
    return watersheds.features.find((f) => (f.properties as { id: string }).id === focusWatershedId) ?? null;
  }, [focusWatershedId, watersheds]);

  if (!villages || !talukas || !watersheds || !waterSources) {
    return <p style={{ padding: 16 }}>{t("map.loading")}</p>;
  }

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <LayerToggle
        layers={layers}
        onChange={setLayers}
        onAddWaterSource={() => setAddState(emptyState())}
      />
      {addState && (
        <AddWaterSourcePanel
          state={addState}
          setState={setAddState}
          onSaved={() => setRefreshTick((n) => n + 1)}
        />
      )}
      <MapContainer center={[19.0, 74.1]} zoom={10} style={{ height: "100%", width: "100%" }}>
        {layers.terrain ? (
          <TileLayer
            attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxZoom={17}
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}

        {layers.watersheds && (
          <GeoJSON
            key={`ws-${focusWatershedId ?? "all"}`}
            data={watersheds}
            style={(feature) => {
              const isFocused = focusWatershedId && (feature?.properties as { id: string }).id === focusWatershedId;
              const lvl = (feature?.properties as { level: number }).level;
              return {
                color: isFocused ? "#d81b60" : "#6a1b9a",
                weight: isFocused ? 3 : 1 + Math.max(0, 3 - lvl) * 0.5,
                fillColor: "#9c27b0",
                fillOpacity: isFocused ? 0.15 : 0.05,
                dashArray: lvl === 1 ? "8 4" : lvl === 2 ? "4 3" : undefined,
              };
            }}
            onEachFeature={(feature, layer) => {
              const p = feature.properties as { name: string; kind: string; areaKm2: number | null };
              const kind = t(`watershed.kind_${p.kind}`, { defaultValue: p.kind });
              layer.bindPopup(
                `<strong>${p.name}</strong><br/>` +
                  `<small>${kind}</small><br/>` +
                  (p.areaKm2 ? `${t("watershed.areaKm2")}: ${p.areaKm2} km²` : "")
              );
            }}
          />
        )}

        {layers.talukas && (
          <GeoJSON
            data={talukas}
            style={{ color: "#1976d2", weight: 2, fillOpacity: 0, dashArray: "4 4" }}
          />
        )}

        {layers.villages && (
          <GeoJSON
            data={villages}
            style={{ color: "#2e7d32", weight: 1, fillColor: "#66bb6a", fillOpacity: 0.2 }}
            onEachFeature={(feature, layer) => {
              const p = feature.properties as VillageProps;
              layer.bindPopup(
                `<strong>${p.name}</strong><br/>` +
                  `<small>${p.code}</small><br/>` +
                  `${t("map.population")}: ${p.population ?? "—"}<br/>` +
                  `${t("map.cattle")}: ${p.cattleCount ?? "—"}<br/>` +
                  `${t("map.sheepGoat")}: ${p.sheepGoatCount ?? "—"}<br/>` +
                  `${t("map.slope")}: ${p.avgSlopePercent ?? "—"}${t("map.slopeUnit")}`
              );
            }}
          />
        )}

        {layers.waterSources && <WaterSourcesLayer data={waterSources} />}

        {addState && <AddWaterSourceLayer state={addState} setState={setAddState} onSaved={() => setRefreshTick((n) => n + 1)} />}

        <FlyTo feature={focused} />
      </MapContainer>
    </div>
  );
}

function WaterSourcesLayer({ data }: { data: FeatureCollection }) {
  const { t } = useTranslation();

  const points = data.features.filter((f) => f.geometry?.type === "Point");
  const lines = data.features.filter((f) => f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString");
  const polys = data.features.filter((f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");

  function popup(p: WaterSourceProps): string {
    const type = t(`waterSource.type_${p.type}`, { defaultValue: p.type });
    return (
      `<strong>${p.name}</strong><br/>` +
      `<small>${type}${p.condition ? ` · ${p.condition}` : ""}</small><br/>` +
      (p.capacityM3 ? `${t("waterSource.capacity")}: ${p.capacityM3} ${t("waterSource.capacityUnit")}<br/>` : "") +
      (p.depthM ? `${t("waterSource.depth")}: ${p.depthM} ${t("waterSource.depthUnit")}` : "")
    );
  }

  return (
    <>
      {lines.length > 0 && (
        <GeoJSON
          key={`ws-lines-${lines.length}`}
          data={{ type: "FeatureCollection", features: lines } as FeatureCollection}
          style={(f) => ({ color: WATER_SOURCE_COLOR[(f?.properties as WaterSourceProps).type], weight: 2 })}
          onEachFeature={(f, layer) => layer.bindPopup(popup(f.properties as WaterSourceProps))}
        />
      )}
      {polys.length > 0 && (
        <GeoJSON
          key={`ws-polys-${polys.length}`}
          data={{ type: "FeatureCollection", features: polys } as FeatureCollection}
          style={(f) => {
            const c = WATER_SOURCE_COLOR[(f?.properties as WaterSourceProps).type];
            return { color: c, weight: 1, fillColor: c, fillOpacity: 0.45 };
          }}
          onEachFeature={(f, layer) => layer.bindPopup(popup(f.properties as WaterSourceProps))}
        />
      )}
      {points.map((f) => {
        const p = f.properties as WaterSourceProps;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        const color = WATER_SOURCE_COLOR[p.type];
        return (
          <CircleMarker
            key={p.id}
            center={[lat, lng]}
            radius={7}
            pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.9 }}
            eventHandlers={{ add: (e) => e.target.bindPopup(popup(p)) }}
          />
        );
      })}
    </>
  );
}

function FlyTo({ feature }: { feature: Feature | null }) {
  const map = useMap();
  useEffect(() => {
    if (!feature?.geometry) return;
    try {
      const layer = L.geoJSON(feature);
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
    } catch (e) {
      console.error(e);
    }
  }, [feature, map]);
  return null;
}
