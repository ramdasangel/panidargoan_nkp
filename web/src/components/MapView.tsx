import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
  Polyline,
  Polygon as GMapPolygon,
} from "@react-google-maps/api";
import { useTranslation } from "react-i18next";
import type { Feature, FeatureCollection, Polygon as GeoPolygon, MultiPolygon } from "geojson";
import { api } from "../api/client";
import { LocationSearch, type LocationFocus } from "./LocationSearch";
import { WaterSourceDetail } from "./WaterSourceDetail";
import { AddWaterSourcePanel, AddWaterSourceLayer, type AddState } from "./AddWaterSource";
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

const CONTAINER_STYLE = { width: "100%", height: "100%" };
const DEFAULT_CENTER  = { lat: 19.0, lng: 74.1 };
const DEFAULT_ZOOM    = 10;

// `places` is needed for the search component's Autocomplete.
const LIBS: ("places")[] = ["places"];

export function MapView({ focusWatershedId, layers, addState, setAddState }: Props) {
  const { t } = useTranslation();

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "",
    libraries: LIBS,
    id: "pdg-google-maps",
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [talukas, setTalukas]           = useState<FeatureCollection | null>(null);
  const [watersheds, setWatersheds]     = useState<FeatureCollection | null>(null);
  const [waterSources, setWaterSources] = useState<FeatureCollection | null>(null);
  const [refreshTick, setRefreshTick]   = useState(0);
  const [pointFocus, setPointFocus]     = useState<LocationFocus | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [devicePending, setDevicePending] = useState(false);
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo]       = useState<{ pos: google.maps.LatLng; html: string } | null>(null);

  // Data layers (managed imperatively because Google's Data API beats rendering
  // 400+ <Polygon> / 2700+ <Polyline> components for large GeoJSON collections).
  const talukasDataRef    = useRef<google.maps.Data | null>(null);
  const watershedsDataRef = useRef<google.maps.Data | null>(null);
  const streamsDataRef    = useRef<google.maps.Data | null>(null);

  // Pull boundaries once map is ready
  useEffect(() => {
    const root = import.meta.env.VITE_PROJECT_WATERSHED_ROOT ?? "";
    const wsUrl = root ? `/api/boundaries/watersheds?root=${encodeURIComponent(root)}` : "/api/boundaries/watersheds";
    api<FeatureCollection>("/api/boundaries/talukas").then(setTalukas).catch(console.error);
    api<FeatureCollection>(wsUrl).then(setWatersheds).catch(console.error);
  }, []);
  useEffect(() => {
    api<FeatureCollection>("/api/boundaries/water-sources").then(setWaterSources).catch(console.error);
  }, [refreshTick]);

  // Mount Talukas as a Data layer
  useEffect(() => {
    if (!map || !talukas) return;
    if (!talukasDataRef.current) {
      talukasDataRef.current = new google.maps.Data({ map });
      talukasDataRef.current.setStyle({
        strokeColor: "#1976d2",
        strokeWeight: 2,
        strokeOpacity: 0.9,
        fillOpacity: 0,
        clickable: false,
      });
    }
    talukasDataRef.current.forEach((f) => talukasDataRef.current!.remove(f));
    talukasDataRef.current.addGeoJson(talukas);
    talukasDataRef.current.setMap(layers.talukas ? map : null);
    return () => { /* layer lifetime tracked via ref */ };
  }, [map, talukas, layers.talukas]);

  // Mount Watersheds as a Data layer with focus-aware styling
  useEffect(() => {
    if (!map || !watersheds) return;
    if (!watershedsDataRef.current) {
      watershedsDataRef.current = new google.maps.Data({ map });
      watershedsDataRef.current.addListener("click", (e: google.maps.Data.MouseEvent) => {
        const f = e.feature;
        const name    = f.getProperty("name") as string;
        const kind    = f.getProperty("kind") as string;
        const areaKm2 = f.getProperty("areaKm2") as number | null;
        const kindLabel = t(`watershed.kind_${kind}`, { defaultValue: kind });
        setHoverInfo({
          pos: e.latLng!,
          html: `<strong>${escapeHtml(name)}</strong><br/><small>${escapeHtml(kindLabel)}</small>` +
                (areaKm2 ? `<br/>${escapeHtml(t("watershed.areaKm2"))}: ${areaKm2} km²` : ""),
        });
      });
    }
    const d = watershedsDataRef.current;
    d.forEach((f) => d.remove(f));
    d.addGeoJson(watersheds);
    d.setStyle((feature) => {
      const lvl       = feature.getProperty("level") as number;
      const id        = feature.getProperty("id") as string;
      const isFocused = id === focusWatershedId;
      return {
        strokeColor: isFocused ? "#d81b60" : "#9c27b0",
        strokeWeight: isFocused ? 3 : lvl === 1 ? 1.5 : lvl === 2 ? 0.8 : 0.4,
        strokeOpacity: isFocused ? 1 : lvl <= 2 ? 0.55 : 0.3,
        fillColor: "#9c27b0",
        fillOpacity: isFocused ? 0.18 : 0,
        clickable: !addState,
      };
    });
    d.setMap(layers.watersheds ? map : null);
  }, [map, watersheds, focusWatershedId, layers.watersheds, addState, t]);

  // Mount imported water streams (HydroRIVERS LineStrings) as a Data layer
  useEffect(() => {
    if (!map || !waterSources) return;
    if (!streamsDataRef.current) {
      streamsDataRef.current = new google.maps.Data({ map });
      streamsDataRef.current.setStyle((feature) => {
        const type   = feature.getProperty("type") as string | undefined;
        const isRiver = type === "river";
        return {
          strokeColor: isRiver ? "#1565c0" : "#42a5f5",
          strokeWeight: isRiver ? 2 : 1,
          strokeOpacity: 0.85,
          clickable: false,
        };
      });
    }
    const d = streamsDataRef.current;
    d.forEach((f) => d.remove(f));
    // Only the imported/osm line-string sources — not manual points/polygons
    const lineFeatures = waterSources.features.filter((f: Feature) => {
      const src = (f.properties as { source?: string } | null)?.source;
      const isLine = f.geometry?.type === "LineString" || f.geometry?.type === "MultiLineString";
      return isLine && (src === "imported" || src === "osm");
    });
    d.addGeoJson({ type: "FeatureCollection", features: lineFeatures } as FeatureCollection);
    d.setMap(layers.waterStreams ? map : null);
  }, [map, waterSources, layers.waterStreams]);

  // Pan/zoom to focused watershed
  useEffect(() => {
    if (!map || !focusWatershedId || !watersheds) return;
    const f = watersheds.features.find((x: Feature) => (x.properties as { id: string }).id === focusWatershedId);
    if (!f) return;
    const bounds = geometryBounds(f.geometry as GeoPolygon | MultiPolygon);
    if (bounds) map.fitBounds(bounds, 40);
  }, [map, focusWatershedId, watersheds]);

  // Pan/zoom to search result
  useEffect(() => {
    if (!map || !pointFocus) return;
    if (pointFocus.bbox) {
      const [s, w, n, e] = pointFocus.bbox;
      map.fitBounds(new google.maps.LatLngBounds({ lat: s, lng: w }, { lat: n, lng: e }), 40);
    } else {
      map.panTo({ lat: pointFocus.lat, lng: pointFocus.lng });
      map.setZoom(pointFocus.zoom);
    }
  }, [map, pointFocus]);

  function centerOnDevice() {
    if (!navigator.geolocation) { alert(t("search.geoUnavailable")); return; }
    setDevicePending(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(here);
        setPointFocus({ lat: here.lat, lng: here.lng, zoom: 17 });
        setDevicePending(false);
      },
      (err) => { setDevicePending(false); alert(t("search.geoFailed") + ": " + err.message); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // Click → forward to drawing layer when adding, else clear info window
  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    if (addState && addState.inputMode === "draw") {
      // Drawing handles append in AddWaterSourceLayer via its own listener too,
      // but we keep this fallback for reliability.
      return;
    }
    setHoverInfo(null);
  }, [addState]);

  const manualSources = useMemo<Feature[]>(() => {
    if (!waterSources) return [];
    return waterSources.features.filter((f: Feature) => (f.properties as WaterSourceProps).source === "manual");
  }, [waterSources]);

  if (loadError) {
    return <div style={{ padding: 16, color: "#c62828" }}>Google Maps failed to load: {loadError.message}</div>;
  }
  if (!isLoaded || !talukas || !watersheds || !waterSources) {
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

      <GoogleMap
        mapContainerStyle={CONTAINER_STYLE}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        onLoad={(m) => setMap(m)}
        onClick={onMapClick}
        options={{
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: false,
          gestureHandling: "greedy",
          mapTypeId: "terrain",
        }}
      >
        {/* Centroid markers for manual water sources */}
        {layers.waterSourcesManual && !adding && manualSources.map((f) => {
          const p = f.properties as WaterSourceProps;
          if (p.centroidLat == null || p.centroidLng == null) return null;
          return (
            <Marker
              key={`centroid-${p.id}`}
              position={{ lat: p.centroidLat, lng: p.centroidLng }}
              onClick={() => setOpenDetailId(p.id)}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#ff9800",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2,
              }}
              title={p.name}
            />
          );
        })}

        {/* Drawing preview + click-to-add */}
        {addState && (
          <AddWaterSourceLayer
            state={addState}
            setState={setAddState}
            onSaved={() => setRefreshTick((n) => n + 1)}
          />
        )}

        {/* User location pulse */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#1976d2",
              fillOpacity: 0.95,
              strokeColor: "#fff",
              strokeWeight: 3,
            }}
          />
        )}

        {hoverInfo && (
          <InfoWindow position={hoverInfo.pos} onCloseClick={() => setHoverInfo(null)}>
            <div dangerouslySetInnerHTML={{ __html: hoverInfo.html }} />
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function geometryBounds(g: GeoPolygon | MultiPolygon): google.maps.LatLngBounds | null {
  const b = new google.maps.LatLngBounds();
  let any = false;
  const consume = (ring: number[][]) => {
    for (const [lng, lat] of ring) { b.extend({ lat, lng }); any = true; }
  };
  if (g.type === "Polygon") {
    for (const ring of g.coordinates) consume(ring);
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates) for (const ring of poly) consume(ring);
  }
  return any ? b : null;
}

// Re-export drawing helpers used outside this file
export { Polyline as GMapPolyline, GMapPolygon };
