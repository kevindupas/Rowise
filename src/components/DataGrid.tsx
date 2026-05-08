import { ReactNode, useState, useRef, useEffect, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnResizeMode,
} from "@tanstack/react-table";
import { Badge } from "./ui/badge";
import type { TableSchema, PendingChange, CellPrimitive } from "../store/tabs";

export interface QueryColumn {
  name: string;
  type_name: string;
  is_geo: boolean;
}

export interface GeoValue {
  geojson: object;
  wkt: string | null;
}

export type CellValue =
  | { type: "Text"; value: string }
  | { type: "Number"; value: number }
  | { type: "Bool"; value: boolean }
  | { type: "Geo"; value: GeoValue }
  | { type: "Null" };

export interface QueryResult {
  columns: QueryColumn[];
  rows: CellValue[][];
  total_count: number | null;
  execution_time_ms: number;
}

interface Props {
  result: QueryResult | null;
  tableSchema?: TableSchema | null;
  pendingChanges?: PendingChange[];
  selectedRowIndices?: number[];
  onNavigateFK?: (
    fkSchema: string,
    fkTable: string,
    fkColumn: string,
    value: string,
  ) => void;
  selectedRowIndex?: number | null;
  onRowSelect?: (rowIndex: number, e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent, rowIndex: number) => void;
  onCellEdit?: (rowIndex: number, col: string, newValue: CellPrimitive) => void;
  onDeleteRows?: (rowIndices: number[]) => void;
}

function getCellSortValue(cell: CellValue): string | number | null {
  if (!cell || cell.type === "Null") return null;
  if (cell.type === "Number") return cell.value;
  if (cell.type === "Bool") return cell.value ? 1 : 0;
  if (cell.type === "Text") return cell.value;
  return null;
}

function getCellRawValue(cell: CellValue): CellPrimitive {
  if (!cell || cell.type === "Null") return null;
  if (cell.type === "Geo") return null;
  return cell.value as CellPrimitive;
}

function renderCell(cell: CellValue): ReactNode {
  if (!cell || cell.type === "Null") {
    return (
      <span className="text-muted-foreground/50 italic text-xs">NULL</span>
    );
  }
  if (cell.type === "Geo") {
    const wkt = cell.value.wkt;
    const display = wkt
      ? wkt.length > 60
        ? wkt.slice(0, 60) + "…"
        : wkt
      : "geometry";
    return (
      <span
        className="text-blue-500 text-xs font-mono truncate block"
        title={wkt ?? "geometry"}
      >
        {display}
      </span>
    );
  }
  if (cell.type === "Bool") {
    return (
      <span className={cell.value ? "text-green-600" : "text-red-500"}>
        {cell.value ? "true" : "false"}
      </span>
    );
  }
  const str = String(cell.value ?? "");
  return (
    <span className="truncate block" title={str}>
      {str}
    </span>
  );
}

function BoolCell({
  cell,
  pendingValue,
  hasPendingEdit,
  canEdit,
  onCommit,
}: {
  cell: CellValue;
  pendingValue?: CellPrimitive;
  hasPendingEdit: boolean;
  canEdit: boolean;
  onCommit: (value: CellPrimitive) => void;
}) {
  const current = hasPendingEdit
    ? pendingValue
    : cell.type === "Bool"
      ? cell.value
      : null;
  const currentStr =
    current === null || current === undefined ? "" : String(current);

  if (!canEdit) return renderCell(cell);

  return (
    <select
      value={currentStr}
      onChange={(e) => {
        const v = e.target.value;
        onCommit(
          v === ""
            ? null
            : v === "default"
              ? "DEFAULT"
              : v === "true"
                ? true
                : false,
        );
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`w-full bg-transparent border-0 outline-none text-sm cursor-pointer ${
        hasPendingEdit
          ? "text-amber-300"
          : current === true
            ? "text-green-600"
            : current === false
              ? "text-red-500"
              : "text-muted-foreground/50 italic"
      }`}
    >
      <option value="default">DEFAULT</option>
      <option value="true">TRUE</option>
      <option value="false">FALSE</option>
      <option value="">NULL</option>
    </select>
  );
}

function FKCell({
  cell,
  fkSchema,
  fkTable,
  fkColumn,
  onNavigateFK,
}: {
  cell: CellValue;
  fkSchema: string;
  fkTable: string;
  fkColumn: string;
  onNavigateFK: (
    fkSchema: string,
    fkTable: string,
    fkColumn: string,
    value: string,
  ) => void;
}) {
  const value =
    cell.type !== "Null"
      ? String((cell as { type: string; value: unknown }).value ?? "")
      : null;

  return (
    <span className="flex items-center gap-1.5">
      {renderCell(cell)}
      {value !== null && (
        <button
          className="text-blue-500 hover:text-blue-300 shrink-0 leading-none text-base font-medium"
          title={`Go to ${fkSchema}.${fkTable} where ${fkColumn} = ${value}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onNavigateFK(fkSchema, fkTable, fkColumn, value);
          }}
        >
          →
        </button>
      )}
    </span>
  );
}

interface EditableCellProps {
  cell: CellValue;
  isEditing: boolean;
  isPendingEdit: boolean;
  onCommit: (value: CellPrimitive) => void;
  onCancel: () => void;
  onTabNext: () => void;
}

function EditableCell({
  cell,
  isEditing,
  isPendingEdit,
  onCommit,
  onCancel,
  onTabNext,
}: EditableCellProps) {
  const initialValue = getCellRawValue(cell);
  const [draft, setDraft] = useState(
    initialValue === null ? "" : String(initialValue),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<string>(
    initialValue === null ? "" : String(initialValue),
  );

  // Sync draft when cell value changes from outside (e.g. pending edit applied)
  useEffect(() => {
    if (!isEditing) {
      const v = getCellRawValue(cell);
      const s = v === null ? "" : String(v);
      setDraft(s);
      originalRef.current = s;
    }
  }, [cell, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function commitIfChanged(value: string) {
    const normalized = value === "" ? null : value;
    const originalNormalized =
      originalRef.current === "" ? null : originalRef.current;
    if (normalized !== originalNormalized) {
      onCommit(normalized);
    } else {
      onCancel();
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitIfChanged(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Tab") {
            e.preventDefault();
            commitIfChanged(draft);
            onTabNext();
          }
        }}
        onBlur={() => commitIfChanged(draft)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full h-full px-0 py-0 bg-transparent border-0 outline-none text-sm font-mono"
      />
    );
  }

  if (isPendingEdit) {
    return (
      <span className="truncate block text-amber-300" title={draft}>
        {draft === "" || draft === "null" ? (
          <span className="italic text-xs text-amber-400/60">NULL</span>
        ) : (
          draft
        )}
      </span>
    );
  }

  return (
    <span className="truncate block w-full h-full">{renderCell(cell)}</span>
  );
}

const columnResizeMode: ColumnResizeMode = "onChange";

export function DataGrid({
  result,
  tableSchema,
  pendingChanges = [],
  selectedRowIndices = [],
  onNavigateFK,
  selectedRowIndex,
  onRowSelect,
  onContextMenu,
  onCellEdit,
  onDeleteRows,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    colName: string;
  } | null>(null);

  const pkColName =
    tableSchema?.columns.find((c) => c.is_primary_key)?.name ?? null;
  const canEdit = pkColName !== null;

  const fkMap = new Map<
    string,
    { fkSchema: string; fkTable: string; fkColumn: string }
  >();
  if (tableSchema) {
    for (const col of tableSchema.columns) {
      if (
        col.is_foreign_key &&
        col.fk_schema &&
        col.fk_table &&
        col.fk_column
      ) {
        fkMap.set(col.name, {
          fkSchema: col.fk_schema,
          fkTable: col.fk_table,
          fkColumn: col.fk_column,
        });
      }
    }
  }

  // Build sets for quick lookup
  const deleteChange = pendingChanges.find((c) => c.kind === "delete");
  const deletedRowIndices = new Set<number>(
    deleteChange?.kind === "delete" ? deleteChange.rowIndices : [],
  );

  const updatedCells = new Map<string, CellPrimitive>(); // "rowIndex:colName" → newValue
  const updatedRows = new Set<number>();
  for (const c of pendingChanges) {
    if (c.kind === "update") {
      updatedCells.set(`${c.rowIndex}:${c.col}`, c.newValue);
      updatedRows.add(c.rowIndex);
    }
  }

  const insertChanges = pendingChanges.filter(
    (c): c is Extract<PendingChange, { kind: "insert" }> => c.kind === "insert",
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editingCell) return;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedRowIndices.length > 0
      ) {
        e.preventDefault();
        onDeleteRows?.(selectedRowIndices);
      }
    },
    [editingCell, selectedRowIndices, onDeleteRows],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function getTabNextCell(
    rowIndex: number,
    colName: string,
  ): { rowIndex: number; colName: string } | null {
    if (!result) return null;
    const cols = result.columns.filter(
      (c) => !c.is_geo && c.name !== pkColName,
    );
    const idx = cols.findIndex((c) => c.name === colName);
    if (idx < cols.length - 1) return { rowIndex, colName: cols[idx + 1].name };
    if (rowIndex < result.rows.length - 1)
      return { rowIndex: rowIndex + 1, colName: cols[0]?.name ?? colName };
    return null;
  }

  const columns: ColumnDef<CellValue[], unknown>[] = (
    result?.columns ?? []
  ).map((col, i) => ({
    id: `col-${i}`,
    accessorFn: (row: CellValue[]) => getCellSortValue(row[i]),
    header: col.name,
    size: 160,
    minSize: 60,
    cell: ({ row }: { row: { original: CellValue[]; index: number } }) => {
      const rowIndex = row.index;
      const isDeleted = deletedRowIndices.has(rowIndex);
      const isPK = col.name === pkColName;
      const isGeo = col.is_geo;
      const cellKey = `${rowIndex}:${col.name}`;
      const hasPendingEdit = updatedCells.has(cellKey);
      const isEditing =
        editingCell?.rowIndex === rowIndex && editingCell?.colName === col.name;
      const fk = fkMap.get(col.name);

      if (isDeleted) {
        return (
          <span className="line-through text-muted-foreground/50 truncate block">
            {renderCell(row.original[i])}
          </span>
        );
      }

      if (fk && onNavigateFK && !isEditing) {
        return (
          <FKCell
            cell={row.original[i]}
            fkSchema={fk.fkSchema}
            fkTable={fk.fkTable}
            fkColumn={fk.fkColumn}
            onNavigateFK={onNavigateFK}
          />
        );
      }

      if (isPK || isGeo || !canEdit || !onCellEdit) {
        return renderCell(row.original[i]);
      }

      const pendingVal = hasPendingEdit
        ? updatedCells.get(cellKey)!
        : getCellRawValue(row.original[i]);
      const isBool =
        row.original[i]?.type === "Bool" ||
        (hasPendingEdit && (pendingVal === true || pendingVal === false));

      if (isBool) {
        return (
          <BoolCell
            cell={row.original[i]}
            pendingValue={hasPendingEdit ? pendingVal : undefined}
            hasPendingEdit={hasPendingEdit}
            canEdit={!!onCellEdit}
            onCommit={(val) => onCellEdit(rowIndex, col.name, val)}
          />
        );
      }

      return (
        <EditableCell
          cell={
            hasPendingEdit
              ? pendingVal === null
                ? { type: "Null" }
                : { type: "Text", value: String(pendingVal) }
              : row.original[i]
          }
          isEditing={isEditing}
          isPendingEdit={hasPendingEdit}
          onCommit={(val) => {
            setEditingCell(null);
            onCellEdit(rowIndex, col.name, val);
          }}
          onCancel={() => setEditingCell(null)}
          onTabNext={() => {
            const next = getTabNextCell(rowIndex, col.name);
            setEditingCell(next);
          }}
        />
      );
    },
  }));

  const table = useReactTable({
    data: result?.rows ?? [],
    columns,
    columnResizeMode,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Run a query to see results
      </div>
    );
  }

  if (result.columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No columns returned
      </div>
    );
  }

  const hasPendingChanges = pendingChanges.length > 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden border">
      {/* Pending changes banner */}
      {hasPendingChanges && (
        <div className="flex items-center gap-3 px-3 py-1 border-b bg-amber-500/10 text-xs text-amber-400 shrink-0">
          {!canEdit && tableSchema && (
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0 text-muted-foreground"
            >
              No PK — read only
            </Badge>
          )}
          {updatedRows.size > 0 && `${updatedRows.size} modified`}
          {deletedRowIndices.size > 0 && ` · ${deletedRowIndices.size} deleted`}
          {insertChanges.length > 0 && ` · ${insertChanges.length} new`}
          <span className="text-muted-foreground">
            · ⌘S to commit · ⌘R to discard
          </span>
        </div>
      )}
      {!canEdit && tableSchema && !hasPendingChanges && (
        <div className="flex items-center px-3 py-1 border-b bg-muted/10 text-xs shrink-0">
          <Badge
            variant="secondary"
            className="text-xs px-1.5 py-0 text-muted-foreground"
          >
            No PK — read only
          </Badge>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table
          className="text-sm border-collapse"
          style={{ width: table.getTotalSize() }}
        >
          <thead className="bg-muted sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th
                  className="w-8 px-2 py-1.5 text-left text-xs text-muted-foreground border-b border-r font-normal select-none"
                  style={{ width: 32, minWidth: 32 }}
                >
                  #
                </th>
                {hg.headers.map((h) => {
                  const colMeta =
                    result.columns[parseInt(h.column.id.replace("col-", ""))];
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className="text-left border-b border-r last:border-r-0 relative select-none"
                      style={{
                        width: h.getSize(),
                        minWidth: h.column.columnDef.minSize,
                      }}
                    >
                      <div
                        className="flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-muted/60 whitespace-nowrap overflow-hidden"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        <span className="font-medium truncate">
                          {h.column.columnDef.header as string}
                        </span>
                        {colMeta && (
                          <span className="text-xs text-muted-foreground font-normal shrink-0">
                            {colMeta.type_name}
                          </span>
                        )}
                        {colMeta?.is_geo && (
                          <Badge
                            variant="secondary"
                            className="text-xs px-1 py-0 shrink-0"
                          >
                            geo
                          </Badge>
                        )}
                        {sorted === "asc" && (
                          <span className="text-xs shrink-0">↑</span>
                        )}
                        {sorted === "desc" && (
                          <span className="text-xs shrink-0">↓</span>
                        )}
                        {!sorted && (
                          <span className="text-xs text-muted-foreground/30 shrink-0">
                            ↕
                          </span>
                        )}
                      </div>

                      <div
                        onMouseDown={h.getResizeHandler()}
                        onTouchStart={h.getResizeHandler()}
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none group ${
                          h.column.getIsResizing()
                            ? "bg-blue-500"
                            : "hover:bg-blue-400/60"
                        }`}
                        style={{ userSelect: "none" }}
                      />
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, displayIdx) => {
              const dataIdx = row.index; // index in original data array, stable across sorting
              const isDeleted = deletedRowIndices.has(dataIdx);
              const isModified = updatedRows.has(dataIdx);
              const isMultiSelected = selectedRowIndices.includes(dataIdx);
              const isSingleSelected = dataIdx === selectedRowIndex;

              const isSelected = isMultiSelected || isSingleSelected;

              let rowClass =
                "border-b last:border-b-0 cursor-pointer transition-colors ";
              if (isDeleted) {
                rowClass += "bg-red-500/15 text-muted-foreground";
              } else if (isSelected) {
                rowClass += "bg-blue-600/20";
              } else if (isModified) {
                rowClass += "bg-amber-500/10";
              } else {
                rowClass += "hover:bg-muted/20";
              }

              return (
                <tr
                  key={row.id}
                  onMouseDown={(e) => {
                    if (e.detail === 1) onRowSelect?.(dataIdx, e);
                  }}
                  onContextMenu={(e) => onContextMenu?.(e, dataIdx)}
                  className={rowClass}
                >
                  <td
                    className="px-2 py-1 text-xs text-muted-foreground/50 select-none border-r"
                    style={{ width: 32, minWidth: 32 }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onRowSelect?.(dataIdx, e);
                    }}
                  >
                    {displayIdx + 1}
                  </td>
                  {row.getVisibleCells().map((cell) => {
                    const colIdx = parseInt(cell.column.id.replace("col-", ""));
                    const colName = result.columns[colIdx]?.name ?? "";
                    const cellKey = `${dataIdx}:${colName}`;
                    const hasPendingEdit = updatedCells.has(cellKey);
                    const isEditing =
                      editingCell?.rowIndex === dataIdx &&
                      editingCell?.colName === colName;
                    const isPK2 = colName === pkColName;
                    const isGeo2 = result.columns[colIdx]?.is_geo ?? false;
                    const isFK = fkMap.has(colName);
                    const canEditCell =
                      canEdit && !isPK2 && !isGeo2 && !isFK && !!onCellEdit;
                    const isBoolCol =
                      cell.getContext().row.original[colIdx]?.type === "Bool" ||
                      (hasPendingEdit &&
                        (updatedCells.get(cellKey) === true ||
                          updatedCells.get(cellKey) === false));

                    let tdClass =
                      "px-3 py-1 border-r last:border-r-0 overflow-hidden ";
                    if (isEditing)
                      tdClass +=
                        "ring-1 ring-inset ring-blue-500 bg-blue-500/5 ";
                    else if (hasPendingEdit)
                      tdClass += "bg-amber-500/15 border-amber-500/40 ";

                    return (
                      <td
                        key={cell.id}
                        className={tdClass}
                        style={{
                          width: cell.column.getSize(),
                          maxWidth: cell.column.getSize(),
                        }}
                        onMouseDown={
                          canEditCell && !isDeleted && !isBoolCol
                            ? (e) => {
                                if (e.detail === 2) {
                                  e.preventDefault();
                                  setEditingCell({
                                    rowIndex: dataIdx,
                                    colName,
                                  });
                                } else if (e.detail === 1 && isSelected) {
                                  e.preventDefault();
                                  setEditingCell({
                                    rowIndex: dataIdx,
                                    colName,
                                  });
                                }
                              }
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Insert rows */}
            {insertChanges.map((ins, insIdx) => {
              const virtualRowIdx = (result?.rows.length ?? 0) + insIdx;
              const isMultiSelected =
                selectedRowIndices.includes(virtualRowIdx);
              return (
                <tr
                  key={ins.tempId}
                  onClick={(e) => onRowSelect?.(virtualRowIdx, e)}
                  className={`border-b last:border-b-0 cursor-pointer bg-green-500/15 ${isMultiSelected ? "ring-1 ring-inset ring-green-500" : ""}`}
                >
                  <td
                    className="px-2 py-1 text-xs text-green-500/70 select-none border-r"
                    style={{ width: 32, minWidth: 32 }}
                  >
                    +
                  </td>
                  {(result?.columns ?? []).map((col, colIdx) => {
                    const val = ins.values[col.name];
                    const isEditing =
                      editingCell?.rowIndex === virtualRowIdx &&
                      editingCell?.colName === col.name;
                    const isPK = col.name === pkColName;
                    const isGeo = col.is_geo;
                    let tdClass =
                      "px-3 py-1 border-r last:border-r-0 overflow-hidden ";
                    if (isEditing)
                      tdClass +=
                        "ring-1 ring-inset ring-green-500 bg-green-500/5 ";

                    return (
                      <td
                        key={colIdx}
                        className={tdClass}
                        style={{ width: 160, maxWidth: 160 }}
                      >
                        {isPK || isGeo ? (
                          <span className="text-muted-foreground/30 italic text-xs">
                            auto
                          </span>
                        ) : (
                          <EditableCell
                            cell={
                              val !== undefined && val !== null
                                ? { type: "Text", value: String(val) }
                                : { type: "Null" }
                            }
                            isEditing={isEditing}
                            isPendingEdit={val !== undefined}
                            onCommit={(newVal) => {
                              setEditingCell(null);
                              // Update insert values
                              onCellEdit?.(virtualRowIdx, col.name, newVal);
                            }}
                            onCancel={() => setEditingCell(null)}
                            onTabNext={() => {
                              const editableCols = result.columns.filter(
                                (c) => !c.is_geo && c.name !== pkColName,
                              );
                              const idx = editableCols.findIndex(
                                (c) => c.name === col.name,
                              );
                              if (idx < editableCols.length - 1) {
                                setEditingCell({
                                  rowIndex: virtualRowIdx,
                                  colName: editableCols[idx + 1].name,
                                });
                              } else {
                                setEditingCell(null);
                              }
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
