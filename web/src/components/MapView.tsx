import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import type { Feature, FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { AddWaterSourceLayer, AddWaterSourcePanel, type AddState } from "./AddWaterSource";
import { LocationSearch, type LocationFocus } from "./LocationSearch";
import { WaterSourceDetail } from "./WaterSourceDetail";
import type { MapLayers, WaterSourceType } from "../types";

interface Props {
  focusWatershedId: string | null;
  layers: MapLayers;
  addState: AddState | null;
  setAddState: Dispatch<SetStateAction<AddState | null>>;
}

interface WaterSourceProps {
  id: string;
  code: string;
  name: string;
  type: WaterSourceType;
  source: "manual" | "osm" | "imported";
  capacityM3?: number | null;
  depthM?: number | null;
  condition?: string | null;
  centroidLat?: number;
  centroidLng?: number;
}

const WATER_SOURCE_COLOR: Record<WaterSourceType, string> = {
  river: "#1565c0", stream: "#42a5f5", canal: "#26c6da",
  pond: "#26a69a", lake: "#00897b", percolation_tank: "#4db6ac", farm_pond: "#80cbc4",
  well: "#283593", borewell: "#1a237e", spring: "#43a047",
  check_dam: "#ef6c00", bandhara: "#e65100", kt_weir: "#f57c00",
  other: "#757575",
};

export function MapView({ focusWatershedId, layers, addState, setAddState }: Props) {
  const { t } = useTranslation();
  const [villages, setVillages] = useState<FeatureCollection | null>(null);
  const [talukas, setTalukas] = useState<FeatureCollection | null>(null);
  const [watersheds, setWatersheds] = useState<FeatureCollection | null>(null);
  const [waterSources, setWaterSources] = useState<FeatureCollection | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [pointFocus, setPointFocus] = useState<LocationFocus | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [devicePending, setDevicePending] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  function centerOnDevice() {
    if (!navigator.geolocation) {
      alert(t("search.geoUnavailable"));
      return;
    }
    setDevicePending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);
        setPointFocus({ lat, lng, zoom: 17 });
        setDevicePending(false);
      },
      (err) => {
        setDevicePending(false);
        alert(t("search.geoFailed") + ": " + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

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

  const adding = addState !== null;

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <LocationSearch
        onLocate={setPointFocus}
        onCenterDevice={centerOnDevice}
        devicePending={devicePending}
      />
      {addState && (
        <AddWaterSourcePanel
          state={addState}
          setState={setAddState}
          onSaved={() => setRefreshTick((n) => n + 1)}
        />
      )}
      {openDetailId && !addState && (
        <WaterSourceDetail
          waterSourceId={openDetailId}
          onClose={() => setOpenDetailId(null)}
          onUpdated={() => setRefreshTick((n) => n + 1)}
        />
      )}
      <MapContainer center={[19.0, 74.1]} zoom={10} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Bhuvan layers publish in EPSG:4326 only; force that CRS otherwise
            GeoServer reprojects on the fly and tiles land at wrong scale. */}
        {layers.waterSourcesBhuvan && (
          <WMSTileLayer
            url="https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms"
            layers="mmi:MH_HYDROLOGY_R_Q4_2022"
            format="image/png" transparent={true} version="1.1.1"
            crs={L.CRS.EPSG4326} opacity={0.85}
            attribution='Hydrology &copy; <a href="https://bhuvan.nrsc.gov.in">ISRO Bhuvan / NRSC</a>'
          />
        )}
        {layers.bhuvanWaterbodies && (
          <WMSTileLayer
            url="https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms"
            layers="basemap:waterbody_DEM"
            format="image/png" transparent={true} version="1.1.1"
            crs={L.CRS.EPSG4326} opacity={0.7}
            attribution='Waterbodies &copy; <a href="https://bhuvan.nrsc.gov.in">Bhuvan</a>'
          />
        )}
        {layers.bhuvanWatersheds && (
          <WMSTileLayer
            url="https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms"
            layers="hydrology:WSHED"
            format="image/png" transparent={true} version="1.1.1"
            crs={L.CRS.EPSG4326} opacity={0.7}
            attribution='Watersheds &copy; <a href="https://bhuvan.nrsc.gov.in">Bhuvan</a>'
          />
        )}
        {layers.bhuvanSubbasins && (
          <WMSTileLayer
            url="https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms"
            layers="hydrology:SUBBASIN"
            format="image/png" transparent={true} version="1.1.1"
            crs={L.CRS.EPSG4326} opacity={0.75}
            attribution='Sub-basins &copy; <a href="https://bhuvan.nrsc.gov.in">Bhuvan</a>'
          />
        )}

        {layers.watersheds && (
          <GeoJSON
            key={`ws-${focusWatershedId ?? "all"}-${adding ? "draw" : "view"}`}
            data={watersheds}
            interactive={!adding}
            style={(feature) => {
              const isFocused = focusWatershedId && (feature?.properties as { id: string }).id === focusWatershedId;
              const lvl = (feature?.properties as { level: number }).level;
              // Outline-only when not focused so village green + taluka blue
              // remain readable underneath. Heavier weight for higher-order
              // basins so the hierarchy is still visible.
              return {
                color: isFocused ? "#d81b60" : "#9c27b0",
                weight: isFocused
                  ? 3
                  : lvl === 1 ? 1.5
                  : lvl === 2 ? 0.8
                  : 0.4,
                opacity: isFocused ? 1 : lvl <= 2 ? 0.55 : 0.3,
                fillColor: "#9c27b0",
                fillOpacity: isFocused ? 0.18 : 0,
                dashArray: lvl === 1 ? "8 4" : lvl === 2 ? "4 3" : undefined,
              };
            }}
            onEachFeature={(feature, layer) => {
              if (adding) return;
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
            interactive={false}
            style={{ color: "#1976d2", weight: 2, fillOpacity: 0, dashArray: "4 4" }}
          />
        )}

        {/* Village polygons are intentionally not rendered — Voronoi cells
            were visually noisy and obscured the watershed + Bhuvan layers.
            The Village table is still queried for taluka/watershed lookups
            and is shown in popups; we just don't draw its boundary. */}

        {layers.waterSourcesManual && (
          <WaterSourcesLayer
            data={onlyManual(waterSources)}
            interactive={!adding}
          />
        )}

        {/* Centroid markers for manually-mapped sources — click opens master/detail panel. */}
        {layers.waterSourcesManual && !adding && waterSources.features
          .filter((f) => (f.properties as WaterSourceProps).source === "manual")
          .map((f) => {
            const p = f.properties as WaterSourceProps;
            if (p.centroidLat == null || p.centroidLng == null) return null;
            return (
              <CircleMarker
                key={`centroid-${p.id}`}
                center={[p.centroidLat, p.centroidLng]}
                radius={9}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  fillColor: "#ff9800",
                  fillOpacity: 1,
                  className: "pdg-manual-centroid",
                }}
                eventHandlers={{ click: () => setOpenDetailId(p.id) }}
              />
            );
          })}

        {addState && <AddWaterSourceLayer state={addState} setState={setAddState} onSaved={() => setRefreshTick((n) => n + 1)} />}

        {userLocation && (
          <>
            <CircleMarker
              center={userLocation}
              radius={9}
              interactive={false}
              pathOptions={{ color: "#fff", weight: 3, fillColor: "#1976d2", fillOpacity: 0.95 }}
            />
            <CircleMarker
              center={userLocation}
              radius={22}
              interactive={false}
              pathOptions={{ color: "#1976d2", weight: 1, fillColor: "#1976d2", fillOpacity: 0.12 }}
            />
          </>
        )}

        <FlyTo feature={focused} />
        <FlyToPoint focus={pointFocus} />
      </MapContainer>
    </div>
  );
}

function FlyToPoint({ focus }: { focus: LocationFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    if (focus.bbox) {
      const [s, w, n, e] = focus.bbox;
      map.flyToBounds([[s, w], [n, e]], { padding: [40, 40], duration: 0.6, maxZoom: 16 });
    } else {
      map.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 0.6 });
    }
  }, [focus, map]);
  return null;
}

function onlyManual(data: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.features.filter(
      (f) => (f.properties as { source?: string } | null)?.source === "manual"
    ),
  };
}

function WaterSourcesLayer({ data, interactive }: { data: FeatureCollection; interactive: boolean }) {
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
          key={`ws-lines-${lines.length}-${interactive ? "i" : "n"}`}
          data={{ type: "FeatureCollection", features: lines } as FeatureCollection}
          interactive={interactive}
          style={(f) => ({ color: WATER_SOURCE_COLOR[(f?.properties as WaterSourceProps).type], weight: 2 })}
          onEachFeature={(f, layer) => {
            if (!interactive) return;
            layer.bindPopup(popup(f.properties as WaterSourceProps));
          }}
        />
      )}
      {polys.length > 0 && (
        <GeoJSON
          key={`ws-polys-${polys.length}-${interactive ? "i" : "n"}`}
          data={{ type: "FeatureCollection", features: polys } as FeatureCollection}
          interactive={interactive}
          style={(f) => {
            const c = WATER_SOURCE_COLOR[(f?.properties as WaterSourceProps).type];
            return { color: c, weight: 1, fillColor: c, fillOpacity: 0.45 };
          }}
          onEachFeature={(f, layer) => {
            if (!interactive) return;
            layer.bindPopup(popup(f.properties as WaterSourceProps));
          }}
        />
      )}
      {points.map((f) => {
        const p = f.properties as WaterSourceProps;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
        const color = WATER_SOURCE_COLOR[p.type];
        return (
          <CircleMarker
            key={`${p.id}-${interactive ? "i" : "n"}`}
            center={[lat, lng]}
            radius={7}
            interactive={interactive}
            pathOptions={{ color: "#fff", weight: 2, fillColor: color, fillOpacity: 0.9 }}
            eventHandlers={interactive ? { add: (e) => e.target.bindPopup(popup(p)) } : undefined}
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
