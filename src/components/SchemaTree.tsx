import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Table2, Search, SlidersHorizontal, Plus, ChevronsUpDown } from "lucide-react";
import type { ColumnInfo } from "../store/tabs";

interface TableInfo {
  schema: string;
  name: string;
}

interface Props {
  connectionId: string;
  onTableSelect: (schema: string, table: string) => void;
  onSchemaSelect?: (schema: string) => void;
  activeTable: { schema: string; name: string } | null;
}

type SidebarTab = "items" | "queries" | "history";

export function SchemaTree({ connectionId, onTableSelect, onSchemaSelect, activeTable }: Props) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [tableColumns, setTableColumns] = useState<Record<string, ColumnInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("items");
  const [search, setSearch] = useState("");
  const [activeSchema, setActiveSchema] = useState<string | null>(null);
  const [schemaPickerOpen, setSchemaPickerOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<TableInfo[]>("get_tables", { connectionId })
      .then((result) => {
        setTables(result);
        if (result.length > 0) {
          const firstSchema = result[0].schema;
          setExpanded(new Set([firstSchema]));
          setActiveSchema((prev) => prev ?? firstSchema);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [connectionId]);

  const grouped = tables.reduce(
    (acc, t) => {
      if (!acc[t.schema]) acc[t.schema] = [];
      acc[t.schema].push(t.name);
      return acc;
    },
    {} as Record<string, string[]>
  );

  const schemas = Object.keys(grouped);
  const currentSchema = activeSchema ?? schemas[0] ?? null;
  const schemaFiltered: Record<string, string[]> = currentSchema && grouped[currentSchema]
    ? { [currentSchema]: grouped[currentSchema] }
    : grouped;

  const filteredGrouped: Record<string, string[]> = search.trim()
    ? Object.fromEntries(
        Object.entries(schemaFiltered)
          .map(([schema, names]) => [schema, names.filter((n) => n.toLowerCase().includes(search.toLowerCase()))])
          .filter(([, names]) => (names as string[]).length > 0)
      )
    : schemaFiltered;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tabs */}
      <div className="shrink-0 border-b px-2 pt-2 pb-1">
        <div className="flex items-center bg-muted rounded-md p-0.5">
          {(["items", "queries", "history"] as SidebarTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-3 py-1 text-xs font-medium rounded transition-colors ${activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "items" && (
        <>
          {/* Search bar */}
          <div className="shrink-0 flex items-center gap-2 border-b" style={{ padding: "6px 10px" }}>
            <Search style={{ width: 13, height: 13, color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search for item..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 12,
                color: "hsl(var(--foreground))",
              }}
            />
            <SlidersHorizontal style={{ width: 13, height: 13, color: "hsl(var(--muted-foreground))", flexShrink: 0, cursor: "pointer" }} />
          </div>

          {/* Table list */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Loading tables...</div>}
            {error && <div className="px-3 py-2 text-xs text-destructive">Error: {error}</div>}
            {!loading && !error && Object.entries(filteredGrouped).map(([schema, tableNames]) => (
              <div key={schema}>
                <div className="flex items-center w-full px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <button
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.has(schema) ? next.delete(schema) : next.add(schema);
                        return next;
                      })
                    }
                    className="flex items-center gap-1 flex-1 min-w-0 hover:text-foreground text-left"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                  >
                    {expanded.has(schema) ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{schema}</span>
                  </button>
                  <button
                    onClick={() => onSchemaSelect?.(schema)}
                    className="hover:text-foreground ml-1 opacity-50 hover:opacity-100"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                    title={`Open Tables.${schema}`}
                  >
                    {tableNames.length}
                  </button>
                </div>

                {expanded.has(schema) &&
                  tableNames.map((name) => {
                    const isActive = activeTable?.schema === schema && activeTable?.name === name;
                    const tableKey = `${schema}.${name}`;
                    const isTableExpanded = expandedTables.has(tableKey);
                    const cols = tableColumns[tableKey];
                    return (
                      <div key={name}>
                        <div className={`flex items-center w-full px-2 py-0.5 text-sm transition-colors ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}>
                          <button
                            onClick={() => {
                              setExpandedTables((prev) => {
                                const next = new Set(prev);
                                if (next.has(tableKey)) {
                                  next.delete(tableKey);
                                } else {
                                  next.add(tableKey);
                                  if (!cols) {
                                    invoke<{ columns: ColumnInfo[] }>("get_table_schema", { connectionId, schema, table: name })
                                      .then((s) => setTableColumns((prev) => ({ ...prev, [tableKey]: s.columns })))
                                      .catch(() => {});
                                  }
                                }
                                return next;
                              });
                            }}
                            className="shrink-0 p-0.5"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                          >
                            {isTableExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </button>
                          <button
                            onClick={() => onTableSelect(schema, name)}
                            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}
                          >
                            <Table2 className="h-3 w-3 shrink-0" />
                            <span className="truncate text-xs">{name}</span>
                          </button>
                        </div>
                        {isTableExpanded && (
                          <div className="pb-1">
                            {!cols && <div className="px-10 py-0.5 text-xs text-muted-foreground">Loading…</div>}
                            {cols?.map((col) => (
                              <div key={col.name} className="flex items-center justify-between px-10 py-0.5 text-xs text-muted-foreground hover:bg-muted/50">
                                <div className="flex items-center gap-1 min-w-0">
                                  {col.is_primary_key && <span style={{ color: "#f59e0b", fontSize: 9 }}>🔑</span>}
                                  <span className="truncate">{col.name}</span>
                                </div>
                                <span className="shrink-0 ml-2 opacity-60 font-mono text-xs">{col.type_name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}

            {!loading && !error && tables.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No tables found</p>
            )}
          </div>
        </>
      )}

      {activeTab === "queries" && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          Saved queries coming soon
        </div>
      )}

      {activeTab === "history" && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          Query history coming soon
        </div>
      )}

      {/* Bottom bar — schema picker */}
      <div className="shrink-0 border-t flex items-center" style={{ height: 36, padding: "0 8px", gap: 4 }}>
        <button
          style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "hsl(var(--muted-foreground))", borderRadius: 4 }}
          className="hover:bg-muted hover:text-foreground"
          title="New table"
        >
          <Plus style={{ width: 14, height: 14 }} />
        </button>
        <button
          style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "hsl(var(--muted-foreground))", borderRadius: 4 }}
          className="hover:bg-muted hover:text-foreground"
          title="More options"
        >
          <ChevronDown style={{ width: 14, height: 14 }} />
        </button>

        <div style={{ flex: 1 }} />

        {/* Schema selector */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setSchemaPickerOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "1px solid hsl(var(--border))", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12, color: "hsl(var(--foreground))" }}
          >
            <span>{currentSchema ?? "public"}</span>
            <ChevronsUpDown style={{ width: 11, height: 11, opacity: 0.6 }} />
          </button>
          {schemaPickerOpen && schemas.length > 1 && (
            <div
              style={{ position: "absolute", bottom: "calc(100% + 4px)", right: 0, background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, minWidth: 120, zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
            >
              {schemas.map((s) => (
                <button
                  key={s}
                  onClick={() => { setActiveSchema(s); setSchemaPickerOpen(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", fontSize: 12, background: s === currentSchema ? "hsl(var(--accent))" : "none", border: "none", cursor: "pointer", color: "hsl(var(--foreground))" }}
                  className="hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
