#!/usr/bin/env python3
"""
HydroBASINS (WWF, CC-BY) → PostgreSQL/PostGIS Watershed table.

Loads sub-basin (lev08) and watershed (lev10) polygons whose bbox intersects
the Ambegaon/Shirur ROI, then prints SQL statements you can pipe into psql
(or just runs them via psql if available).

HydroBASINS records have these attributes (DBF columns) of interest to us:
    HYBAS_ID    : 10-digit Pfafstetter ID
    NEXT_DOWN   : downstream HYBAS_ID (0 = drains to ocean)
    NEXT_SINK   : terminal sink ID
    MAIN_BAS    : major basin this belongs to
    DIST_MAIN   : km from basin outlet
    SUB_AREA    : sub-area in km²

We map them into our Watershed model:
    code   = "HB-{HYBAS_ID}"
    name   = "Watershed {short_id}" (HydroBASINS has no names; we synth one)
    kind   = "watershed" (lev10) or "sub_basin" (lev08)
    level  = our internal level: 1 for sub-basin parent, 2 for watershed child
    parentId = looked up via HYBAS_ID hierarchy (lev10 -> lev08 by HYBAS_ID prefix match,
               since lev08 IDs are prefixes of lev10 IDs)
    areaKm2 = SUB_AREA
    boundary = WKT MultiPolygon (4326)

Usage:
    python3 import-hydrobasins.py [--bbox S W N E]
    Outputs SQL to stdout. Pipe to psql or save to a file.
"""
import argparse
import json
import sys
from pathlib import Path

import shapefile  # pyshp

SCRIPT_DIR = Path(__file__).resolve().parent
CACHE = (SCRIPT_DIR / ".." / ".cache" / "hydrobasins").resolve()

# Default ROI = Pune district + buffer (covers Ambegaon, Shirur, Junnar,
# Khed, Maval, plus the Ghod/Bhima river path downstream).
DEFAULT_BBOX = (18.0, 73.5, 19.6, 75.5)  # S, W, N, E

def bbox_intersects(rec_bbox, roi):
    """rec_bbox = (xmin, ymin, xmax, ymax); roi = (S, W, N, E)."""
    s, w, n, e = roi
    xmin, ymin, xmax, ymax = rec_bbox
    return not (xmax < w or xmin > e or ymax < s or ymin > n)

def ring_to_wkt(rings):
    """Convert pyshp polygon rings to OGC WKT MultiPolygon."""
    if not rings:
        return None
    parts = []
    for ring in rings:
        if len(ring) < 4:
            continue
        coords = ", ".join(f"{x:.6f} {y:.6f}" for x, y in ring)
        parts.append(f"(({coords}))")
    if not parts:
        return None
    return "MULTIPOLYGON(" + ", ".join(parts) + ")"

def sql_escape(s):
    return s.replace("'", "''")

def load_level(level, roi):
    """Return list of dict per intersecting record."""
    shp = CACHE / f"hybas_as_lev{level:02d}_v1c.shp"
    if not shp.exists():
        sys.exit(f"missing {shp} — download HydroBASINS first")
    reader = shapefile.Reader(str(shp))
    field_names = [f[0] for f in reader.fields[1:]]
    out = []
    for sr in reader.iterShapeRecords():
        rec_bbox = sr.shape.bbox  # (xmin, ymin, xmax, ymax)
        if not bbox_intersects(rec_bbox, roi):
            continue
        # iter rings from pyshp parts
        parts = list(sr.shape.parts) + [len(sr.shape.points)]
        rings = []
        for i in range(len(parts) - 1):
            ring = sr.shape.points[parts[i]:parts[i + 1]]
            rings.append([(float(x), float(y)) for x, y in ring])
        wkt = ring_to_wkt(rings)
        if not wkt:
            continue
        rec = dict(zip(field_names, sr.record))
        rec["_wkt"] = wkt
        out.append(rec)
    reader.close()
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", nargs=4, type=float, metavar=("S", "W", "N", "E"),
                    default=list(DEFAULT_BBOX))
    args = ap.parse_args()
    roi = tuple(args.bbox)
    print(f"-- HydroBASINS import. ROI (S W N E): {roi}", file=sys.stderr)

    lev08 = load_level(8, roi)
    lev10 = load_level(10, roi)
    print(f"-- lev08 (sub-basins) intersecting ROI: {len(lev08)}", file=sys.stderr)
    print(f"-- lev10 (watersheds)  intersecting ROI: {len(lev10)}", file=sys.stderr)

    # Hierarchy: HydroBASINS lev10 IDs aren't strict prefixes of lev08, but each
    # lev10 has a NEXT_DOWN that eventually rolls up via PFAF coding. The cleanest
    # mapping is by HYBAS_ID prefix match (first 9 digits of lev10 == lev08).
    # In practice lev10 records carry a parent reference via the implicit
    # Pfafstetter structure: trim last digit to get the lev08 parent.
    # This is an approximation that works for HydroBASINS standard schema.
    lev08_by_id = {int(r["HYBAS_ID"]): r for r in lev08}

    print("BEGIN;")
    print("-- Insert sub-basins (lev08) — kind=sub_basin, level=2, parent=Bhima Basin")
    for r in lev08:
        code   = f"HB-{int(r['HYBAS_ID'])}"
        nm     = f"Sub-basin {int(r['HYBAS_ID']) % 100000}"
        area   = float(r["SUB_AREA"])
        wkt    = sql_escape(r["_wkt"])
        print(f"""INSERT INTO "Watershed" (id, code, name, kind, level, "parentId", "areaKm2", boundary)
  SELECT gen_random_uuid(), '{code}', '{sql_escape(nm)}', 'sub_basin', 2,
         (SELECT id FROM "Watershed" WHERE code = 'WS-BHIMA'),
         {area},
         ST_Multi(ST_GeomFromText('{wkt}', 4326))::geography
  WHERE NOT EXISTS (SELECT 1 FROM "Watershed" WHERE code = '{code}');""")

    print()
    print("-- Insert watersheds (lev10) — kind=watershed, level=3, parent=nearest lev08")
    for r in lev10:
        code = f"HB-{int(r['HYBAS_ID'])}"
        nm   = f"Watershed {int(r['HYBAS_ID']) % 100000}"
        area = float(r["SUB_AREA"])
        wkt  = sql_escape(r["_wkt"])
        # Find the lev08 parent: HydroBASINS lev08 HYBAS_ID is the prefix of lev10 ID
        # (trim last digit). Validate by checking if that lev08 exists.
        lev10_id = int(r["HYBAS_ID"])
        parent_lev08_id = lev10_id // 10
        parent_code = f"HB-{parent_lev08_id}" if parent_lev08_id in lev08_by_id else None
        if parent_code:
            parent_lookup = f"(SELECT id FROM \"Watershed\" WHERE code = '{parent_code}')"
        else:
            parent_lookup = "(SELECT id FROM \"Watershed\" WHERE code = 'WS-BHIMA-GHOD')"
        print(f"""INSERT INTO "Watershed" (id, code, name, kind, level, "parentId", "areaKm2", boundary)
  SELECT gen_random_uuid(), '{code}', '{sql_escape(nm)}', 'watershed', 3,
         {parent_lookup},
         {area},
         ST_Multi(ST_GeomFromText('{wkt}', 4326))::geography
  WHERE NOT EXISTS (SELECT 1 FROM "Watershed" WHERE code = '{code}');""")
    print("COMMIT;")

if __name__ == "__main__":
    main()
