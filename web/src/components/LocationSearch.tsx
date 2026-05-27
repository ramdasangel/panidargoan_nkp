import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

export interface LocationFocus {
  lat: number;
  lng: number;
  zoom: number;
  // Optional bbox: if present, FlyToPoint can fit it instead of using zoom.
  bbox?: [number, number, number, number];
}

// Two sources merged into one suggestion list:
// 1. /api/search (Village/Taluka/Watershed from PostGIS) — instant
// 2. Google Places Autocomplete + Geocoding — global fallback
// Local results appear first; Google results are bias-restricted to Maharashtra
// (countrycodes='in') for relevance.
interface SearchHit {
  source: "local" | "google";
  type: string;           // "village" | "taluka" | "watershed" | google place type
  id: string;
  name: string;
  context?: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number];
}

interface Props {
  onLocate: (focus: LocationFocus) => void;
  onCenterDevice: () => void;
  devicePending: boolean;
}

export function LocationSearch({ onLocate, onCenterDevice, devicePending }: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Local DB lookup (instant)
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        // 1. Local entities first
        const local = await api<Array<{ type: string; id: string; name: string; context?: string; lat: number; lng: number; bbox?: [number, number, number, number] }>>(
          `/api/search?q=${encodeURIComponent(q.trim())}&limit=8`,
          { signal: ac.signal }
        );
        const localHits: SearchHit[] = local.map((r) => ({
          source: "local", type: r.type, id: r.id, name: r.name, context: r.context,
          lat: r.lat, lng: r.lng, bbox: r.bbox,
        }));

        // 2. Google Places Autocomplete (only if google.maps is loaded)
        const googleHits = await googleAutocomplete(q.trim(), ac.signal).catch(() => [] as SearchHit[]);

        // Dedupe by name+lat,lng so we don't show "Manchar" twice
        const merged: SearchHit[] = [...localHits];
        for (const g of googleHits) {
          const dup = merged.some((m) =>
            m.name.toLowerCase() === g.name.toLowerCase() &&
            Math.abs(m.lat - g.lat) < 0.01 && Math.abs(m.lng - g.lng) < 0.01
          );
          if (!dup) merged.push(g);
        }
        setResults(merged.slice(0, 12));
        setHighlight(0);
        setOpen(true);
      } catch (e) {
        if ((e as DOMException).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  // Close on outside click
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

  async function pick(r: SearchHit) {
    let lat = r.lat;
    let lng = r.lng;
    let bbox = r.bbox;
    if (r.source === "google") {
      // Resolve place_id → coords + viewport. Spend one Geocoding API call.
      const resolved = await resolveGooglePlace(r.id);
      if (!resolved) return;
      lat = resolved.lat; lng = resolved.lng; bbox = resolved.bbox;
    }
    const focus: LocationFocus = { lat, lng, zoom: 14 };
    if (bbox) focus.bbox = bbox;
    onLocate(focus);
    setOpen(false);
    setQ(r.context ? `${r.name}, ${r.context}` : r.name);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !results) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter")   { e.preventDefault(); if (results[highlight]) pick(results[highlight]); }
    else if (e.key === "Escape")  { setOpen(false); }
  }

  return (
    <div className="pdg-search" ref={wrapRef}>
      <div className="pdg-search-row">
        <div className="pdg-search-input-wrap">
          <svg className="pdg-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zM9.5 14a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />
          </svg>
          <input
            type="search"
            placeholder={t("search.placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results && setOpen(true)}
            onKeyDown={onKey}
            className="pdg-search-input"
            aria-label={t("search.placeholder")}
          />
          {loading && <span className="pdg-search-spinner" aria-hidden="true" />}
        </div>
        <button
          type="button"
          className="pdg-search-center"
          onClick={onCenterDevice}
          disabled={devicePending}
          title={t("search.centerTitle")}
          aria-label={t("search.center")}
        >
          {devicePending ? (
            <span className="pdg-search-spinner pdg-search-spinner-dark" aria-hidden="true" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9.94 3A10 10 0 0 0 13 2.06V0h-2v2.06A10 10 0 0 0 2.06 11H0v2h2.06A10 10 0 0 0 11 21.94V24h2v-2.06A10 10 0 0 0 21.94 13H24v-2h-2.06zM12 20a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
            </svg>
          )}
        </button>
      </div>

      {open && results && (
        <ul className="pdg-search-results">
          {results.length === 0 && <li className="pdg-search-empty">{t("search.noResults")}</li>}
          {results.map((r, i) => (
            <li
              key={`${r.source}-${r.id}`}
              className={`pdg-search-item ${i === highlight ? "highlight" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setHighlight(i)}
            >
              <div className="pdg-search-item-main">
                {r.name}
                {r.source === "google" && <span style={{ marginLeft: 6, fontSize: 10, color: "#888" }}>Google</span>}
              </div>
              <div className="pdg-search-item-sub">
                {r.type}{r.context ? ` · ${r.context}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Google Places + Geocoding helper
// -----------------------------------------------------------------------------
//
// Two-step flow: Autocomplete gives us place predictions (cheap session token
// pricing); Geocoder resolves the selected prediction's place_id to lat/lng +
// viewport bbox. We do step 1 here and defer geocoding to pick() so we only
// pay for what the user actually selects.

async function googleAutocomplete(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  if (typeof google === "undefined" || !google.maps?.places) return [];
  const service = new google.maps.places.AutocompleteService();
  const session = new google.maps.places.AutocompleteSessionToken();
  return new Promise<SearchHit[]>((resolve) => {
    if (signal.aborted) { resolve([]); return; }
    service.getPlacePredictions(
      {
        input: query,
        sessionToken: session,
        componentRestrictions: { country: "in" },
        // Bias toward Maharashtra (rough bbox)
        locationBias: new google.maps.LatLngBounds(
          { lat: 15.6, lng: 72.6 },
          { lat: 22.0, lng: 80.9 }
        ),
      },
      (preds) => {
        if (!preds) return resolve([]);
        resolve(preds.map((p): SearchHit => ({
          source: "google",
          type:    (p.types && p.types[0]) || "place",
          id:      p.place_id,
          name:    p.structured_formatting?.main_text || p.description,
          context: p.structured_formatting?.secondary_text || "",
          lat: 0, lng: 0,                  // resolved later by geocoder
        })));
      }
    );
  });
}

/** Resolve a Google place_id to coordinates + viewport bbox. */
async function resolveGooglePlace(placeId: string): Promise<{ lat: number; lng: number; bbox?: [number, number, number, number] } | null> {
  if (typeof google === "undefined" || !google.maps?.Geocoder) return null;
  const geo = new google.maps.Geocoder();
  return new Promise((resolve) => {
    geo.geocode({ placeId }, (results, status) => {
      if (status !== "OK" || !results || !results[0]) { resolve(null); return; }
      const r = results[0];
      const loc = r.geometry.location;
      const vp  = r.geometry.viewport;
      resolve({
        lat: loc.lat(),
        lng: loc.lng(),
        bbox: vp
          ? [vp.getSouthWest().lat(), vp.getSouthWest().lng(), vp.getNorthEast().lat(), vp.getNorthEast().lng()]
          : undefined,
      });
    });
  });
}
