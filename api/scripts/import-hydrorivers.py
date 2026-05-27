#!/usr/bin/env python3
"""
HydroRIVERS v1.0 (WWF/HydroSHEDS, CC-BY) → PostGIS WaterSource table.

The Asia shapefile carries 1.43M reaches; we clip to a project bbox so we
ingest ~500-1000 reaches around Ambegaon + Shirur + downstream Bhima.

Attribute fields used (per HydroRIVERS_TechDoc_v10):
    HYRIV_ID     unique identifier for the river reach
    MAIN_RIV     ID of the river network this reach belongs to
    LENGTH_KM    length of this reach
    UPLAND_SKM   upstream contributing drainage area in km^2
    DIS_AV_CMS   long-term average discharge in m^3/s
    ORD_STRA     Strahler stream order
    ORD_FLOW     flow-based order (1 = highest discharge, 10 = lowest)

Classification rule:
    ORD_FLOW <= 4  -> WaterSourceType.river  (DIS >= ~100 m^3/s)
    ORD_FLOW >= 5  -> WaterSourceType.stream

We tag every imported reach with code = "HR-<HYRIV_ID>" and
source = 'imported' so it shows up alongside (or replaces) the older OSM
auto-source rows. ON CONFLICT (code) DO UPDATE keeps the script idempotent.
"""
import argparse
import sys
import time
from pathlib import Path

import shapefile  # pyshp

SCRIPT_DIR = Path(__file__).resolve().parent
CACHE  = (SCRIPT_DIR / ".." / ".cache" / "hydrorivers").resolve()
SHP    = CACHE / "HydroRIVERS_v10_as_shp" / "HydroRIVERS_v10_as.shp"

DEFAULT_BBOX = (18.0, 73.5, 19.6, 75.5)  # S, W, N, E — Pune district + buffer
MIN_LENGTH_KM = 0.5                       # skip very short reaches

def bbox_intersects(rec_bbox, roi):
    s, w, n, e = roi
    xmin, ymin, xmax, ymax = rec_bbox
    return not (xmax < w or xmin > e or ymax < s or ymin > n)

def classify(ord_flow):
    # ORD_FLOW 1 = largest, 10 = smallest
    return "river" if ord_flow <= 4 else "stream"

def sql_escape(s):
    return s.replace("'", "''")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("S", "W", "N", "E"),
                    default=list(DEFAULT_BBOX))
    args = ap.parse_args()
    roi = tuple(args.bbox)
    if not SHP.exists():
        sys.exit(f"missing {SHP}\n  download + unzip from https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip first")

    print(f"-- HydroRIVERS ROI (S W N E): {roi}", file=sys.stderr)
    t0 = time.time()
    reader = shapefile.Reader(str(SHP))
    field_names = [f[0] for f in reader.fields[1:]]
    idx = {n: i for i, n in enumerate(field_names)}

    print("BEGIN;")
    n_total = 0
    n_kept  = 0
    for sr in reader.iterShapeRecords():
        n_total += 1
        if not bbox_intersects(sr.shape.bbox, roi):
            continue
        rec = sr.record
        length_km = float(rec[idx["LENGTH_KM"]])
        if length_km < MIN_LENGTH_KM:
            continue

        hyriv_id   = int(rec[idx["HYRIV_ID"]])
        main_riv   = int(rec[idx["MAIN_RIV"]])
        upland_km2 = float(rec[idx["UPLAND_SKM"]])
        dis_cms    = float(rec[idx["DIS_AV_CMS"]])
        ord_stra   = int(rec[idx["ORD_STRA"]])
        ord_flow   = int(rec[idx["ORD_FLOW"]])

        # Build a LINESTRING WKT from the shape's points
        pts = sr.shape.points
        if len(pts) < 2:
            continue
        coord_str = ", ".join(f"{x:.6f} {y:.6f}" for x, y in pts)
        wkt = f"LINESTRING({coord_str})"

        code = f"HR-{hyriv_id}"
        wstype = classify(ord_flow)
        name   = f"Reach {hyriv_id} ({length_km:.1f} km, S{ord_stra})"
        # Attach to Ghod sub-basin so it groups under our project area when shown
        # in the watershed-grouped report.
        notes_parts = [
            f"HydroRIVERS v1.0 reach #{hyriv_id}",
            f"MAIN_RIV={main_riv}",
            f"length_km={length_km}",
            f"upland_km2={upland_km2}",
            f"discharge_avg_m3s={dis_cms}",
            f"strahler={ord_stra}",
            f"ord_flow={ord_flow}",
        ]
        notes = sql_escape("; ".join(notes_parts))
        wkt_e = sql_escape(wkt)

        print(f"""INSERT INTO "WaterSource"
  (code, name, type, source, "watershedId", condition, notes, geom)
VALUES (
  '{code}', '{sql_escape(name)}', '{wstype}'::"WaterSourceType",
  'imported'::"WaterSourceOrigin",
  (SELECT id FROM "Watershed" WHERE code = 'WS-BHIMA-GHOD'),
  'hr_strahler_{ord_stra}',
  '{notes}',
  ST_GeogFromText('SRID=4326;{wkt_e}')
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  source = EXCLUDED.source,
  "watershedId" = EXCLUDED."watershedId",
  condition = EXCLUDED.condition,
  notes = EXCLUDED.notes,
  geom = EXCLUDED.geom;""")
        n_kept += 1

    print("COMMIT;")
    reader.close()
    print(f"-- scanned {n_total} reaches, kept {n_kept} (within bbox, >={MIN_LENGTH_KM} km). {time.time()-t0:.1f}s",
          file=sys.stderr)

if __name__ == "__main__":
    main()
