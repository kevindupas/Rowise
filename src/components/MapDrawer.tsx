import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import { X } from "lucide-react";
import { OSM_STYLE, loadGeoJson, updateGeoJson } from "../lib/mapUtils";

interface Props {
  open: boolean;
  onClose: () => void;
  geojson: FeatureCollection | null;
  title?: string;
}

export function MapDrawer({ open, onClose, geojson, title }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;

  const initMap = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    const map = new maplibregl.Map({
      container: node,
      style: OSM_STYLE,
      center: [0, 20],
      zoom: 1,
    });

    mapRef.current = map;

    map.once("load", () => {
      map.resize();
      if (geojsonRef.current && geojsonRef.current.features.length > 0) {
        loadGeoJson(map, geojsonRef.current);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When geojson changes after map is already loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      updateGeoJson(map, geojson);
    }
  }, [geojson]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col" style={{ height: "60vh" }}>
      {/* Backdrop */}
      <div className="absolute inset-x-0 -top-screen bottom-0 bg-black/20" onClick={onClose} style={{ top: "-100vh" }} />

      {/* Panel */}
      <div className="relative flex flex-col bg-background border-t rounded-t-xl shadow-xl overflow-hidden h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div>
            <p className="text-sm font-medium">{title ?? "Map View"}</p>
            {geojson && (
              <p className="text-xs text-muted-foreground">
                {geojson.features.length} feature{geojson.features.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close map"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Map container — always mounted when panel is open */}
        <div ref={initMap} className="flex-1 w-full" />
      </div>
    </div>
  );
}

