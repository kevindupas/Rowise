import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { QueryResult } from "../components/DataGrid";
import { useQueryLogStore } from "./queryLog";

export interface ColumnInfo {
  name: string;
  type_name: string;
  is_geo: boolean;
  is_primary_key: boolean;
  is_nullable: boolean;
  column_default: string | null;
  is_foreign_key: boolean;
  fk_table: string | null;
  fk_column: string | null;
  fk_schema: string | null;
}

export interface IndexInfo {
  name: string;
  is_unique: boolean;
  is_primary: boolean;
  columns: string[];
  index_type: string;
}

export interface TableSchema {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

export type FilterOperator =
  | "=" | "<>" | "<" | ">" | "<=" | ">="
  | "IN" | "NOT IN"
  | "IS NULL" | "IS NOT NULL"
  | "BETWEEN" | "NOT BETWEEN"
  | "LIKE" | "ILIKE"
  | "Contains" | "Not contains"
  | "Contains CI" | "Not contains CI"
  | "Has prefix" | "Has suffix"
  | "Has prefix CI" | "Has suffix CI";

export interface FilterRule {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
  value2: string;
}

export type CellPrimitive = string | number | boolean | null;

export type PendingChange =
  | { kind: "update"; rowIndex: number; col: string; newValue: CellPrimitive }
  | { kind: "delete"; rowIndices: number[] }
  | { kind: "insert"; tempId: string; values: Record<string, CellPrimitive> };

export interface TableStats {
  row_count: number | null;
  total_size: string | null;
  data_size: string | null;
  index_size: string | null;
  comment: string | null;
}

export interface SqlLogEntry {
  timestamp: string;
  sql: string;
}

export interface Tab {
  id: string;
  connectionId: string;
  schema: string;
  table: string;
  label: string;
  sql: string;
  result: QueryResult | null;
  tableSchema: TableSchema | null;
  tableStats: TableStats | null;
  selectedRowIndex: number | null;
  selectedRowIndices: number[];
  pendingChanges: PendingChange[];
  loading: boolean;
  error: string | null;
  filters: FilterRule[];
  showFilterBar: boolean;
  sqlMode: boolean;
  limit: number;
  offset: number;
  sqlLogs: SqlLogEntry[];
  lastQueryMs: number | null;
  lastQueryMessage: string | null;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  showDetailPanel: boolean;
  openTab: (connectionId: string, schema: string, table: string, initialFilter?: { column: string; value: string }) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, partial: Partial<Tab>) => void;
  runTabQuery: (id: string) => Promise<void>;
  toggleDetailPanel: () => void;
  addFilter: (tabId: string) => void;
  removeFilter: (tabId: string, filterId: string) => void;
  updateFilter: (tabId: string, filterId: string, partial: Partial<FilterRule>) => void;
  toggleFilterBar: (tabId: string) => void;
  toggleSqlMode: (tabId: string) => void;
  setLimit: (tabId: string, limit: number) => void;
  nextPage: (tabId: string) => void;
  prevPage: (tabId: string) => void;
  loadTableSchema: (tabId: string) => Promise<void>;
  setPendingUpdate: (tabId: string, rowIndex: number, col: string, newValue: CellPrimitive) => void;
  setPendingDelete: (tabId: string, rowIndices: number[]) => void;
  addPendingInsert: (tabId: string) => void;
  clearPendingChanges: (tabId: string) => void;
  commitChanges: (tabId: string) => Promise<void>;
  setSelectedRows: (tabId: string, indices: number[]) => void;
  openSqlTab: (connectionId: string) => void;
}

function buildWhereClause(filters: FilterRule[]): string {
  const active = filters.filter((f) => f.column && f.operator);
  if (active.length === 0) return "";

  const clauses = active.map((f) => {
    const col = `"${f.column}"`;
    switch (f.operator) {
      case "IS NULL": return `${col} IS NULL`;
      case "IS NOT NULL": return `${col} IS NOT NULL`;
      case "IN": return `${col} IN (${f.value})`;
      case "NOT IN": return `${col} NOT IN (${f.value})`;
      case "BETWEEN": return `${col} BETWEEN '${f.value.replace(/'/g, "''")}' AND '${f.value2.replace(/'/g, "''")}'`;
      case "NOT BETWEEN": return `${col} NOT BETWEEN '${f.value.replace(/'/g, "''")}' AND '${f.value2.replace(/'/g, "''")}'`;
      case "Contains": return `${col} LIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Not contains": return `${col} NOT LIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Contains CI": return `${col} ILIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Not contains CI": return `${col} NOT ILIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Has prefix": return `${col} LIKE '${f.value.replace(/'/g, "''")}%'`;
      case "Has suffix": return `${col} LIKE '%${f.value.replace(/'/g, "''")}'`;
      case "Has prefix CI": return `${col} ILIKE '${f.value.replace(/'/g, "''")}%'`;
      case "Has suffix CI": return `${col} ILIKE '%${f.value.replace(/'/g, "''")}'`;
      default: return `${col} ${f.operator} '${f.value.replace(/'/g, "''")}'`;
    }
  });

  return "WHERE " + clauses.join(" AND ");
}

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
  tabs: [],
  activeTabId: null,
  showDetailPanel: true,

  openTab: (connectionId, schema, table, initialFilter) => {
    const existing = get().tabs.find(
      (t) =>
        t.connectionId === connectionId &&
        t.schema === schema &&
        t.table === table
    );
    if (existing) {
      set({ activeTabId: existing.id });
      if (initialFilter) {
        const filter: FilterRule = {
          id: crypto.randomUUID(),
          column: initialFilter.column,
          operator: "=",
          value: initialFilter.value,
          value2: "",
        };
        get().updateTab(existing.id, { filters: [filter], offset: 0, showFilterBar: true });
        get().runTabQuery(existing.id);
      }
      return;
    }

    const id = crypto.randomUUID();
    const sql = `SELECT * FROM "${schema}"."${table}"`;
    const filters: FilterRule[] = initialFilter
      ? [{ id: crypto.randomUUID(), column: initialFilter.column, operator: "=", value: initialFilter.value, value2: "" }]
      : [];
    const tab: Tab = {
      id,
      connectionId,
      schema,
      table,
      label: `${schema}.${table}`,
      sql,
      result: null,
      tableSchema: null,
      tableStats: null,
      selectedRowIndex: null,
      selectedRowIndices: [],
      pendingChanges: [],
      loading: false,
      error: null,
      filters,
      showFilterBar: initialFilter != null,
      sqlMode: false,
      limit: 300,
      offset: 0,
      sqlLogs: [],
      lastQueryMs: null,
      lastQueryMessage: null,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));

    get().runTabQuery(id);
    get().loadTableSchema(id);
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);

    let nextActiveId: string | null = null;
    if (activeTabId === id) {
      if (remaining.length > 0) {
        nextActiveId = remaining[Math.max(0, idx - 1)].id;
      }
    } else {
      nextActiveId = activeTabId;
    }

    set({ tabs: remaining, activeTabId: nextActiveId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, partial) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    })),

  runTabQuery: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;

    let sql = tab.sql;
    if (!tab.sqlMode) {
      const where = buildWhereClause(tab.filters);
      sql = `SELECT * FROM "${tab.schema}"."${tab.table}" ${where}`;
    }
    if (!sql.trim()) return;

    const ts = new Date();
    const timestamp = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,"0")}-${String(ts.getDate()).padStart(2,"0")} ${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}:${String(ts.getSeconds()).padStart(2,"0")}`;
    const logEntry: SqlLogEntry = { timestamp, sql };

    get().updateTab(id, { loading: true, error: null });
    const t0 = performance.now();
    try {
      const result = await invoke<QueryResult>("execute_query", {
        connectionId: tab.connectionId,
        sql,
        limit: tab.limit,
        offset: tab.offset,
      });
      const ms = Math.round(performance.now() - t0);
      const rowCount = result.rows.length;
      const message = `Query OK: ${sql.trim().split(/\s+/)[0].toUpperCase()} ${rowCount} row${rowCount !== 1 ? "s" : ""}`;
      useQueryLogStore.getState().push({ timestamp, sql, connectionId: tab.connectionId, durationMs: ms, error: null });
      get().updateTab(id, {
        result,
        loading: false,
        selectedRowIndex: null,
        lastQueryMs: ms,
        lastQueryMessage: message,
        sqlLogs: tab.sqlMode ? [...(get().tabs.find(t=>t.id===id)?.sqlLogs ?? []), logEntry] : tab.sqlLogs,
      });
      if (tab.sqlMode) {
        const fromMatch = sql.match(/\bFROM\s+"?(\w+)"?\."?(\w+)"?/i);
        const fromCount = (sql.match(/\bFROM\b/gi) ?? []).length;
        if (fromMatch && fromCount === 1) {
          try {
            const tableSchema = await invoke<TableSchema>("get_table_schema", {
              connectionId: tab.connectionId,
              schema: fromMatch[1],
              table: fromMatch[2],
            });
            get().updateTab(id, { tableSchema });
          } catch { /* non-fatal */ }
        } else {
          get().updateTab(id, { tableSchema: null });
        }
      }
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      const errStr = String(e);
      useQueryLogStore.getState().push({ timestamp, sql, connectionId: tab.connectionId, durationMs: ms, error: errStr });
      get().updateTab(id, {
        error: errStr,
        result: null,
        loading: false,
        lastQueryMs: ms,
        lastQueryMessage: `ERROR: ${errStr}`,
        sqlLogs: tab.sqlMode ? [...(get().tabs.find(t=>t.id===id)?.sqlLogs ?? []), logEntry] : tab.sqlLogs,
      });
    }
  },

  toggleDetailPanel: () =>
    set((state) => ({ showDetailPanel: !state.showDetailPanel })),

  addFilter: (tabId) => {
    const rule: FilterRule = {
      id: crypto.randomUUID(),
      column: "",
      operator: "=",
      value: "",
      value2: "",
    };
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, filters: [...t.filters, rule] } : t
      ),
    }));
  },

  removeFilter: (tabId, filterId) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, filters: t.filters.filter((f) => f.id !== filterId) }
          : t
      ),
    }));
    get().runTabQuery(tabId);
  },

  updateFilter: (tabId, filterId, partial) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              filters: t.filters.map((f) =>
                f.id === filterId ? { ...f, ...partial } : f
              ),
            }
          : t
      ),
    })),

  toggleFilterBar: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, showFilterBar: !t.showFilterBar } : t
      ),
    })),

  toggleSqlMode: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, sqlMode: !t.sqlMode, offset: 0 } : t
      ),
    })),

  setLimit: (tabId, limit) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, limit, offset: 0 } : t
      ),
    }));
    get().runTabQuery(tabId);
  },

  nextPage: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // If current page returned fewer rows than limit, already on last page
    if (tab.result && tab.result.rows.length < tab.limit) return;
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, offset: t.offset + t.limit } : t
      ),
    }));
    get().runTabQuery(tabId);
  },

  prevPage: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.offset === 0) return;
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, offset: Math.max(0, t.offset - t.limit) }
          : t
      ),
    }));
    get().runTabQuery(tabId);
  },

  loadTableSchema: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.sqlMode) return;
    try {
      const [tableSchema, tableStats] = await Promise.all([
        invoke<TableSchema>("get_table_schema", {
          connectionId: tab.connectionId,
          schema: tab.schema,
          table: tab.table,
        }),
        invoke<TableStats>("get_table_stats", {
          connectionId: tab.connectionId,
          schema: tab.schema,
          table: tab.table,
        }).catch(() => null),
      ]);
      get().updateTab(tabId, { tableSchema, tableStats });
    } catch {
      // non-fatal
    }
  },

  setSelectedRows: (tabId, indices) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, selectedRowIndices: indices } : t
      ),
    })),

  openSqlTab: (connectionId) => {
    const id = crypto.randomUUID();
    const tab: Tab = {
      id,
      connectionId,
      schema: "",
      table: "",
      label: "SQL Query",
      sql: "",
      result: null,
      tableSchema: null,
      tableStats: null,
      selectedRowIndex: null,
      selectedRowIndices: [],
      pendingChanges: [],
      loading: false,
      error: null,
      filters: [],
      showFilterBar: false,
      sqlMode: true,
      limit: 300,
      offset: 0,
      sqlLogs: [],
      lastQueryMs: null,
      lastQueryMessage: null,
    };
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: id }));
  },

  setPendingUpdate: (tabId, rowIndex, col, newValue) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t;
        // Replace existing update for same row+col, or append
        const existing = t.pendingChanges.findIndex(
          (c) => c.kind === "update" && c.rowIndex === rowIndex && c.col === col
        );
        const change: PendingChange = { kind: "update", rowIndex, col, newValue };
        const pendingChanges = existing >= 0
          ? t.pendingChanges.map((c, i) => (i === existing ? change : c))
          : [...t.pendingChanges, change];
        return { ...t, pendingChanges };
      }),
    })),

  setPendingDelete: (tabId, rowIndices) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t;
        // Remove any existing delete, replace with new set
        const withoutDelete = t.pendingChanges.filter((c) => c.kind !== "delete");
        const change: PendingChange = { kind: "delete", rowIndices };
        return { ...t, pendingChanges: [...withoutDelete, change] };
      }),
    })),

  addPendingInsert: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) => {
        if (t.id !== tabId) return t;
        const change: PendingChange = {
          kind: "insert",
          tempId: crypto.randomUUID(),
          values: {},
        };
        return { ...t, pendingChanges: [...t.pendingChanges, change] };
      }),
    })),

  clearPendingChanges: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, pendingChanges: [], selectedRowIndices: [] } : t
      ),
    })),

  commitChanges: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || !tab.result || tab.pendingChanges.length === 0) return;

    const pkCol = tab.tableSchema?.columns.find((c) => c.is_primary_key);
    if (!pkCol) {
      get().updateTab(tabId, { error: "No primary key — cannot commit changes" });
      return;
    }

    const pkColIndex = tab.result.columns.findIndex((c) => c.name === pkCol.name);

    interface WireStatement { sql: string; params: unknown[] }
    const statements: WireStatement[] = [];

    // Group updates by rowIndex
    const updatesByRow = new Map<number, { col: string; newValue: CellPrimitive }[]>();
    for (const change of tab.pendingChanges) {
      if (change.kind === "update") {
        const list = updatesByRow.get(change.rowIndex) ?? [];
        list.push({ col: change.col, newValue: change.newValue });
        updatesByRow.set(change.rowIndex, list);
      }
    }

    // Use ? placeholders universally — Rust rewrites to $N for PostgreSQL.
    function placeholder(_n: number) {
      return "?";
    }

    for (const [rowIndex, cols] of updatesByRow) {
      const pkCellRaw = tab.result.rows[rowIndex]?.[pkColIndex];
      if (!pkCellRaw) continue;
      const pkValue = pkCellRaw.type !== "Null" ? (pkCellRaw as { type: string; value: CellPrimitive }).value : null;
      if (pkValue === null) continue;

      const setClauses = cols.map((c, i) => `"${c.col}" = ${placeholder(i + 1)}`).join(", ");
      const pkPlaceholder = placeholder(cols.length + 1);
      const sql = `UPDATE "${tab.schema}"."${tab.table}" SET ${setClauses} WHERE "${pkCol.name}" = ${pkPlaceholder}`;
      const params = [...cols.map((c) => c.newValue), pkValue];
      statements.push({ sql, params });
    }

    // Deletes
    for (const change of tab.pendingChanges) {
      if (change.kind === "delete") {
        const pkValues = change.rowIndices
          .map((ri) => {
            const cell = tab.result!.rows[ri]?.[pkColIndex];
            if (!cell || cell.type === "Null") return null;
            return (cell as { type: string; value: CellPrimitive }).value;
          })
          .filter((v): v is CellPrimitive => v !== null);
        if (pkValues.length === 0) continue;
        const placeholders = pkValues.map((_, i) => placeholder(i + 1)).join(", ");
        const sql = `DELETE FROM "${tab.schema}"."${tab.table}" WHERE "${pkCol.name}" IN (${placeholders})`;
        statements.push({ sql, params: pkValues });
      }
    }

    // Inserts
    for (const change of tab.pendingChanges) {
      if (change.kind === "insert") {
        const entries = Object.entries(change.values).filter(([, v]) => v !== undefined);
        if (entries.length === 0) continue;
        const cols = entries.map(([k]) => `"${k}"`).join(", ");
        const placeholders = entries.map((_, i) => placeholder(i + 1)).join(", ");
        const sql = `INSERT INTO "${tab.schema}"."${tab.table}" (${cols}) VALUES (${placeholders})`;
        statements.push({ sql, params: entries.map(([, v]) => v) });
      }
    }

    if (statements.length === 0) {
      get().clearPendingChanges(tabId);
      return;
    }

    get().updateTab(tabId, { loading: true, error: null });
    try {
      await invoke("execute_write", { connectionId: tab.connectionId, statements });
      get().clearPendingChanges(tabId);
      await get().runTabQuery(tabId);
    } catch (e) {
      get().updateTab(tabId, { error: String(e), loading: false });
    }
  },
}),
    {
      name: "tablelike-tabs",
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          ...t,
          result: null,
          tableSchema: null,
          loading: false,
          error: null,
          selectedRowIndex: null,
          selectedRowIndices: [],
          pendingChanges: [],
        })),
        activeTabId: state.activeTabId,
        showDetailPanel: state.showDetailPanel,
      }),
    }
  )
);
