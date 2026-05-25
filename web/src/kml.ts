/**
 * Minimal KML <-> GeoJSON geometry conversion. Browser DOMParser is used
 * for KML parsing — we only handle the three shapes the app supports
 * (Point / LineString / Polygon).
 */

export type GeometryKind = "Point" | "LineString" | "Polygon";

export interface ParsedKml {
  kind: GeometryKind;
  /** [lat, lng] pairs in the order they appear in the KML. */
  points: Array<[number, number]>;
  name?: string;
}

function parseCoordinates(text: string): Array<[number, number]> {
  // KML coordinate string: "lng,lat[,alt] lng,lat[,alt] ..."
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const [lng, lat] = tuple.split(",").map(Number);
      return [lat, lng] as [number, number]; // we use [lat, lng] internally to match Leaflet
    });
}

export function parseKml(text: string): ParsedKml | { error: string } {
  let dom: Document;
  try {
    dom = new DOMParser().parseFromString(text, "text/xml");
  } catch {
    return { error: "Could not parse KML" };
  }
  const parserError = dom.getElementsByTagName("parsererror")[0];
  if (parserError) return { error: parserError.textContent ?? "Invalid XML" };

  const nameEl = dom.getElementsByTagName("name")[0];
  const name = nameEl?.textContent?.trim() ?? undefined;

  // Try Polygon first (most specific), then LineString, then Point.
  const polygon = dom.getElementsByTagName("Polygon")[0];
  if (polygon) {
    const ring = polygon.getElementsByTagName("LinearRing")[0];
    const coords = ring?.getElementsByTagName("coordinates")[0]?.textContent;
    if (!coords) return { error: "Polygon has no coordinates" };
    const points = parseCoordinates(coords);
    // KML polygons are usually closed (first == last); drop the trailing point.
    if (points.length >= 2) {
      const [a, b] = [points[0], points[points.length - 1]];
      if (a[0] === b[0] && a[1] === b[1]) points.pop();
    }
    if (points.length < 3) return { error: "Polygon needs at least 3 vertices" };
    return { kind: "Polygon", points, name };
  }

  const line = dom.getElementsByTagName("LineString")[0];
  if (line) {
    const coords = line.getElementsByTagName("coordinates")[0]?.textContent;
    if (!coords) return { error: "LineString has no coordinates" };
    const points = parseCoordinates(coords);
    if (points.length < 2) return { error: "Line needs at least 2 points" };
    return { kind: "LineString", points, name };
  }

  const point = dom.getElementsByTagName("Point")[0];
  if (point) {
    const coords = point.getElementsByTagName("coordinates")[0]?.textContent;
    if (!coords) return { error: "Point has no coordinates" };
    const points = parseCoordinates(coords);
    if (points.length < 1) return { error: "No point coordinate" };
    return { kind: "Point", points: [points[0]], name };
  }

  return { error: "No Point / LineString / Polygon found in KML" };
}

export function buildKml(
  kind: GeometryKind,
  points: Array<[number, number]>, // [lat, lng]
  name: string
): string {
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const tuple = (lat: number, lng: number) => `${lng},${lat},0`;
  const coordList = (pts: Array<[number, number]>) => pts.map(([lat, lng]) => tuple(lat, lng)).join(" ");

  let inner: string;
  if (kind === "Point") {
    const [lat, lng] = points[0];
    inner = `<Point><coordinates>${tuple(lat, lng)}</coordinates></Point>`;
  } else if (kind === "LineString") {
    inner = `<LineString><coordinates>${coordList(points)}</coordinates></LineString>`;
  } else {
    // close polygon by appending first point
    const closed = [...points, points[0]];
    inner = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordList(closed)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark><name>${esc(name)}</name>${inner}</Placemark>
</kml>`;
}
