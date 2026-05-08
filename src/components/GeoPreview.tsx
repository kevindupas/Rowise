import { useCallback, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import { OSM_STYLE, loadGeoJson } from "../lib/mapUtils";

interface Props {
  geojson: FeatureCollection;
  height?: number;
}

export function GeoPreview({ geojson, height = 160 }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;

  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      mapRef.current?.remove();
      mapRef.current = null;
      return;
    }

    const map = new maplibregl.Map({
      container: node,
      style: OSM_STYLE,
      center: [0, 20],
      zoom: 1,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    map.once("load", () => {
      map.resize();
      if (geojsonRef.current.features.length > 0) {
        loadGeoJson(map, geojsonRef.current);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={initMap}
      style={{ height, borderRadius: 6, overflow: "hidden" }}
      className="w-full border border-border/50 mt-1"
    />
  );
}
