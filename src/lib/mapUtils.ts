import maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";

export const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm-tiles", type: "raster", source: "osm-tiles" }],
};

type Coord = [number, number];

function extractCoordinates(geometry: Geometry): Coord[] {
  switch (geometry.type) {
    case "Point": return [[geometry.coordinates[0], geometry.coordinates[1]]];
    case "MultiPoint":
    case "LineString": return geometry.coordinates.map((c) => [c[0], c[1]]);
    case "MultiLineString":
    case "Polygon": return geometry.coordinates.flat().map((c) => [c[0], c[1]]);
    case "MultiPolygon": return geometry.coordinates.flat(2).map((c) => [c[0], c[1]]);
    case "GeometryCollection": return geometry.geometries.flatMap(extractCoordinates);
    default: return [];
  }
}

export function fitBounds(map: maplibregl.Map, geojson: FeatureCollection, padding = 50) {
  const bounds = new maplibregl.LngLatBounds();
  let valid = false;
  geojson.features.forEach((f) => {
    if (!f.geometry) return;
    extractCoordinates(f.geometry).forEach(([lng, lat]) => {
      if (isFinite(lng) && isFinite(lat)) { bounds.extend([lng, lat]); valid = true; }
    });
  });
  if (valid) map.fitBounds(bounds, { padding, maxZoom: 16, animate: false });
}

export function loadGeoJson(map: maplibregl.Map, geojson: FeatureCollection | null) {
  if (!geojson || geojson.features.length === 0) return;

  if (map.getSource("geo-data")) {
    (map.getSource("geo-data") as maplibregl.GeoJSONSource).setData(geojson);
  } else {
    map.addSource("geo-data", { type: "geojson", data: geojson });
    map.addLayer({ id: "geo-points", type: "circle", source: "geo-data", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#3b82f6", "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" } });
    map.addLayer({ id: "geo-lines", type: "line", source: "geo-data", filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]], paint: { "line-color": "#3b82f6", "line-width": 2 } });
    map.addLayer({ id: "geo-fill", type: "fill", source: "geo-data", filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], paint: { "fill-color": "#3b82f6", "fill-opacity": 0.2 } });
    map.addLayer({ id: "geo-outline", type: "line", source: "geo-data", filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], paint: { "line-color": "#3b82f6", "line-width": 1.5 } });
  }

  fitBounds(map, geojson);
}

export function updateGeoJson(map: maplibregl.Map, geojson: FeatureCollection | null) {
  const src = map.getSource("geo-data") as maplibregl.GeoJSONSource | undefined;
  if (src && geojson) {
    src.setData(geojson);
    fitBounds(map, geojson);
  } else if (geojson) {
    loadGeoJson(map, geojson);
  }
}
