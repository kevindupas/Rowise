import { create } from "zustand";

export interface QueryLogEntry {
  id: string;
  timestamp: string;
  sql: string;
  connectionId: string;
  durationMs: number | null;
  error: string | null;
}

interface QueryLogStore {
  entries: QueryLogEntry[];
  push: (entry: Omit<QueryLogEntry, "id">) => void;
  clear: () => void;
}

export const useQueryLogStore = create<QueryLogStore>((set) => ({
  entries: [],
  push: (entry) =>
    set((state) => ({
      entries: [...state.entries, { ...entry, id: crypto.randomUUID() }],
    })),
  clear: () => set({ entries: [] }),
}));
