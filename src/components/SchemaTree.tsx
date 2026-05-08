import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Table2, Search, SlidersHorizontal } from "lucide-react";

interface TableInfo {
  schema: string;
  name: string;
}

interface Props {
  connectionId: string;
  onTableSelect: (schema: string, table: string) => void;
  activeTable: { schema: string; name: string } | null;
}

type SidebarTab = "items" | "queries" | "history";

export function SchemaTree({ connectionId, onTableSelect, activeTable }: Props) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>("items");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<TableInfo[]>("get_tables", { connectionId })
      .then((result) => {
        setTables(result);
        if (result.length > 0) {
          setExpanded(new Set([result[0].schema]));
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

  const filteredGrouped: Record<string, string[]> = search.trim()
    ? Object.fromEntries(
        Object.entries(grouped)
          .map(([schema, names]) => [schema, names.filter((n) => n.toLowerCase().includes(search.toLowerCase()))])
          .filter(([, names]) => (names as string[]).length > 0)
      )
    : grouped;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center shrink-0 border-b" style={{ padding: "0 8px" }}>
        {(["items", "queries", "history"] as SidebarTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid hsl(var(--foreground))" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
              textTransform: "capitalize",
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
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
                <button
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(schema) ? next.delete(schema) : next.add(schema);
                      return next;
                    })
                  }
                  className="flex items-center gap-1 w-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
                >
                  {expanded.has(schema) ? (
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">{schema}</span>
                  <span className="ml-auto opacity-50">{tableNames.length}</span>
                </button>

                {expanded.has(schema) &&
                  tableNames.map((name) => {
                    const isActive =
                      activeTable?.schema === schema && activeTable?.name === name;
                    return (
                      <button
                        key={name}
                        onClick={() => onTableSelect(schema, name)}
                        className={`flex items-center gap-2 w-full px-6 py-1 text-sm text-left transition-colors ${
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Table2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{name}</span>
                      </button>
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
    </div>
  );
}
