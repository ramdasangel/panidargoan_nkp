#!/usr/bin/env python3
"""
DataMeet (CC-BY) Census 2011 district shapefile → District.boundary in PostGIS.

Inputs: api/.cache/datameet/2011_Dist.shp (+ .dbf/.shx/.prj)
        download once from:
        https://raw.githubusercontent.com/datameet/maps/master/Districts/Census_2011/2011_Dist.shp
        (and the matching .dbf, .shx, .prj files)

Outputs: SQL to stdout. Pipe into psql.

For each District row already in our DB we look up the matching record in the
DataMeet shapefile by name (case-insensitive prefix) and write an UPDATE that
sets the boundary. Other District rows are untouched. State name is checked
so we don't accidentally pick "Pune" in a different state.

Note: DataMeet does NOT have taluka or village level boundaries in the maps
repo. Those stay derived from OSM/Nominatim until we find another source.
"""
import sys
from pathlib import Path

import shapefile

SCRIPT_DIR = Path(__file__).resolve().parent
SHP = (SCRIPT_DIR / ".." / ".cache" / "datameet" / "2011_Dist.shp").resolve()

# Map our internal District.code -> (DataMeet DISTRICT, DataMeet ST_NM)
# Add rows here if you ever ingest more districts.
DISTRICT_MAPPINGS = [
    ("MH-PUN", "Pune", "Maharashtra"),
]

def ring_to_wkt(rings):
    parts = []
    for ring in rings:
        if len(ring) < 4:
            continue
        coords = ", ".join(f"{x:.6f} {y:.6f}" for x, y in ring)
        parts.append(f"(({coords}))")
    if not parts:
        return None
    return "MULTIPOLYGON(" + ", ".join(parts) + ")"

def find_record(reader, district_name, state_name):
    field_names = [f[0] for f in reader.fields[1:]]
    idx_district = field_names.index("DISTRICT")
    idx_state    = field_names.index("ST_NM")
    for sr in reader.iterShapeRecords():
        rec = sr.record
        if (str(rec[idx_district]).strip().lower() == district_name.lower()
            and str(rec[idx_state]).strip().lower() == state_name.lower()):
            parts = list(sr.shape.parts) + [len(sr.shape.points)]
            rings = []
            for i in range(len(parts) - 1):
                ring = sr.shape.points[parts[i]:parts[i + 1]]
                rings.append([(float(x), float(y)) for x, y in ring])
            return ring_to_wkt(rings)
    return None

def sql_escape(s):
    return s.replace("'", "''")

def main():
    if not SHP.exists():
        sys.exit(f"missing {SHP}")
    reader = shapefile.Reader(str(SHP))

    print("BEGIN;")
    for code, dist_nm, st_nm in DISTRICT_MAPPINGS:
        # Re-open per lookup because iterShapeRecords is a generator
        reader.close()
        reader = shapefile.Reader(str(SHP))
        wkt = find_record(reader, dist_nm, st_nm)
        if not wkt:
            print(f"-- WARN: no DataMeet record for {dist_nm}, {st_nm}", file=sys.stderr)
            continue
        wkt_esc = sql_escape(wkt)
        print(f"""UPDATE "District"
   SET boundary = ST_Multi(ST_GeomFromText('{wkt_esc}', 4326))::geography
 WHERE code = '{sql_escape(code)}';""")
        print(f"-- updated {code} ({dist_nm}, {st_nm})", file=sys.stderr)
    print("COMMIT;")
    reader.close()

if __name__ == "__main__":
    main()
