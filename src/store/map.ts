import { create } from "zustand";
import type { FeatureCollection } from "geojson";

interface MapStore {
  open: boolean;
  geojson: FeatureCollection | null;
  title: string;
  openMap: (geojson: FeatureCollection, title?: string) => void;
  closeMap: () => void;
}

export const useMapStore = create<MapStore>()((set) => ({
  open: false,
  geojson: null,
  title: "",
  openMap: (geojson, title = "Map View") => set({ open: true, geojson, title }),
  closeMap: () => set({ open: false }),
}));
