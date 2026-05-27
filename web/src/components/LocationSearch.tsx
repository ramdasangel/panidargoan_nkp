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

// Local-DB search result shape returned by /api/search.
// (Replaces public Nominatim, which was unreliable: 503 from rate limits
// and irrelevant matches outside the project area.)
interface SearchHit {
  type: "village" | "taluka" | "watershed";
  id: string;
  name: string;
  context?: string;
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // [south, west, north, east]
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

  // Debounced search hitting our own /api/search backed by Village/Taluka/
  // Watershed tables in PostGIS. Instant, reliable, and limited to project
  // geo data (no irrelevant matches from worldwide OSM).
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const data = await api<SearchHit[]>(
          `/api/search?q=${encodeURIComponent(q.trim())}&limit=10`,
          { signal: ac.signal }
        );
        setResults(data);
        setHighlight(0);
        setOpen(true);
      } catch (e) {
        if ((e as DOMException).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
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

  function pick(r: SearchHit) {
    const focus: LocationFocus = { lat: r.lat, lng: r.lng, zoom: 14 };
    if (r.bbox) focus.bbox = r.bbox;
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
              key={r.id}
              className={`pdg-search-item ${i === highlight ? "highlight" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setHighlight(i)}
            >
              <div className="pdg-search-item-main">{r.name}</div>
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
