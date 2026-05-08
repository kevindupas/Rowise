import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface ColumnInfo {
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

interface IndexInfo {
  name: string;
  is_unique: boolean;
  is_primary: boolean;
  columns: string[];
  index_type: string;
}

interface TableSchema {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

interface Props {
  connectionId: string;
  schema: string;
  table: string;
  cachedSchema?: TableSchema | null;
}

export function StructureView({ connectionId, schema, table, cachedSchema }: Props) {
  const [tableSchema, setTableSchema] = useState<TableSchema | null>(cachedSchema ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedSchema) {
      setTableSchema(cachedSchema);
      return;
    }
    setLoading(true);
    setError(null);
    invoke<TableSchema>("get_table_schema", { connectionId, schema, table })
      .then(setTableSchema)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [connectionId, schema, table, cachedSchema]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading structure…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!tableSchema) return null;

  return (
    <TooltipProvider>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Columns table */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              Columns
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-8 border-r border-border">#</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Name</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Type</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Nullable</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Default</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Foreign Key</th>
                  </tr>
                </thead>
                <tbody>
                  {tableSchema.columns.map((col, i) => (
                    <tr
                      key={col.name}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums border-r border-border">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs border-r border-border">
                        <div className="flex items-center gap-1.5">
                          {col.name}
                          {col.is_primary_key && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/60 text-amber-600 dark:text-amber-400">
                              PK
                            </Badge>
                          )}
                          {col.is_foreign_key && (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-blue-500/60 text-blue-600 dark:text-blue-400 cursor-default">
                                  FK
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                {col.fk_schema}.{col.fk_table}({col.fk_column})
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {col.is_geo && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-green-500/60 text-green-600 dark:text-green-400">
                              GEO
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground border-r border-border">{col.type_name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground border-r border-border">{col.is_nullable ? "YES" : "NO"}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground border-r border-border">
                        {col.column_default ?? <span className="italic">NULL</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                        {col.is_foreign_key
                          ? `${col.fk_schema}.${col.fk_table}(${col.fk_column})`
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Indexes table */}
          {tableSchema.indexes.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Indexes
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Name</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Algorithm</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">Unique</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Columns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableSchema.indexes.map((idx) => (
                      <tr
                        key={idx.name}
                        className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-3 py-2 font-mono text-xs border-r border-border">
                          <div className="flex items-center gap-1.5">
                            {idx.name}
                            {idx.is_primary && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/60 text-amber-600 dark:text-amber-400">
                                PK
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground border-r border-border">{idx.index_type}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground border-r border-border">{idx.is_unique ? "YES" : "NO"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {idx.columns.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </TooltipProvider>
  );
}
