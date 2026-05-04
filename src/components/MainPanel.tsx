import { useCallback, useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { DataGrid, CellValue } from "./DataGrid";
import { MapDrawer } from "./MapDrawer";
import { TabBar } from "./TabBar";
import { FilterBar } from "./FilterBar";
import { BottomBar } from "./BottomBar";
import { SqlEditor } from "./SqlEditor";
import { RowContextMenu } from "./RowContextMenu";
import { StructureView } from "./StructureView";
import { useTabStore, type CellPrimitive } from "../store/tabs";

interface ContextMenuState {
  x: number;
  y: number;
  rowIndex: number;
  row: CellValue[];
}

export function MainPanel() {
  const {
    tabs,
    activeTabId,
    updateTab,
    runTabQuery,
    addFilter,
    updateFilter,
    openTab,
    setPendingUpdate,
    setPendingDelete,
    addPendingInsert,
    clearPendingChanges,
    commitChanges,
    setSelectedRows,
  } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const [mapOpen, setMapOpen] = useState(false);
  const [mapGeoJson, setMapGeoJson] = useState<FeatureCollection | null>(null);
  const [activeView, setActiveView] = useState<"data" | "structure">("data");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  const handleRun = useCallback(() => {
    if (!activeTabId) return;
    runTabQuery(activeTabId);
  }, [activeTabId, runTabQuery]);

  const handleRefresh = useCallback(() => {
    if (!activeTabId) return;
    const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId);
    if (tab && tab.pendingChanges.length > 0) {
      setShowDiscardModal(true);
    } else {
      runTabQuery(activeTabId);
    }
  }, [activeTabId, runTabQuery]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (activeTabId) commitChanges(activeTabId);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        handleRefresh();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRun, activeTabId, commitChanges, handleRefresh]);

  useEffect(() => {
    setMapOpen(false);
    setMapGeoJson(null);
    setActiveView("data");
    setContextMenu(null);
    setShowDiscardModal(false);
  }, [activeTabId]);

  function handleShowMap(geoColIndex: number, singleRowIndex?: number) {
    if (!activeTab?.result) return;
    const rows = singleRowIndex !== undefined
      ? [activeTab.result.rows[singleRowIndex]]
      : activeTab.result.rows;

    const features = rows
      .map((row) => {
        const cell = row[geoColIndex];
        if (!cell || cell.type !== "Geo") return null;
        return {
          type: "Feature" as const,
          geometry: cell.value.geojson as unknown as GeoJSON.Geometry,
          properties: {},
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    setMapGeoJson({ type: "FeatureCollection", features });
    setMapOpen(true);
  }

  function handleRowSelect(rowIndex: number, e: React.MouseEvent) {
    if (!activeTabId || !activeTab) return;
    const current = activeTab.selectedRowIndices;

    if (e.shiftKey && current.length > 0) {
      const last = current[current.length - 1];
      const min = Math.min(last, rowIndex);
      const max = Math.max(last, rowIndex);
      const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      setSelectedRows(activeTabId, range);
    } else if (e.metaKey || e.ctrlKey) {
      if (current.includes(rowIndex)) {
        setSelectedRows(activeTabId, current.filter((i) => i !== rowIndex));
      } else {
        setSelectedRows(activeTabId, [...current, rowIndex]);
      }
    } else {
      setSelectedRows(activeTabId, [rowIndex]);
      updateTab(activeTabId, { selectedRowIndex: rowIndex });
    }
  }

  function handleContextMenu(e: React.MouseEvent, rowIndex: number) {
    e.preventDefault();
    if (!activeTab?.result) return;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      rowIndex,
      row: activeTab.result.rows[rowIndex],
    });
    updateTab(activeTab.id, { selectedRowIndex: rowIndex });
  }

  function handleNavigateFK(fkSchema: string, fkTable: string, fkColumn: string, value: string) {
    if (!activeTab) return;
    openTab(activeTab.connectionId, fkSchema, fkTable, { column: fkColumn, value });
  }

  function handleFilterBy(column: string, value: string) {
    if (!activeTabId || !activeTab) return;
    if (!activeTab.showFilterBar) {
      updateTab(activeTabId, { showFilterBar: true });
    }
    addFilter(activeTabId);
    setTimeout(() => {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab) return;
      const lastFilter = tab.filters[tab.filters.length - 1];
      if (lastFilter) {
        updateFilter(activeTabId, lastFilter.id, { column, operator: "=", value });
        runTabQuery(activeTabId);
      }
    }, 0);
  }

  function handleCellEdit(rowIndex: number, col: string, newValue: CellPrimitive) {
    if (!activeTabId || !activeTab) return;
    const resultRowCount = activeTab.result?.rows.length ?? 0;
    if (rowIndex >= resultRowCount) {
      // Insert row edit — update the insert change values
      const insertIdx = rowIndex - resultRowCount;
      const insChanges = activeTab.pendingChanges.filter((c): c is Extract<typeof c, { kind: "insert" }> => c.kind === "insert");
      const ins = insChanges[insertIdx];
      if (!ins) return;
      useTabStore.setState((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id !== activeTabId) return t;
          return {
            ...t,
            pendingChanges: t.pendingChanges.map((c) => {
              if (c.kind === "insert" && c.tempId === ins.tempId) {
                return { ...c, values: { ...c.values, [col]: newValue } };
              }
              return c;
            }),
          };
        }),
      }));
    } else {
      setPendingUpdate(activeTabId, rowIndex, col, newValue);
    }
  }

  function handleDeleteRows(rowIndices: number[]) {
    if (!activeTabId) return;
    // Only delete real rows (not insert rows)
    const resultRowCount = activeTab?.result?.rows.length ?? 0;
    const realIndices = rowIndices.filter((i) => i < resultRowCount);
    if (realIndices.length > 0) setPendingDelete(activeTabId, realIndices);
  }

  function handleAddRow() {
    if (!activeTabId) return;
    addPendingInsert(activeTabId);
  }

  function handleDiscard() {
    if (!activeTabId) return;
    clearPendingChanges(activeTabId);
    setShowDiscardModal(false);
    runTabQuery(activeTabId);
  }

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Select a table from the sidebar</p>
        </div>
      </div>
    );
  }

  if (!activeTab) return null;

  const geoColIndex = activeTab.result?.columns.findIndex((c) => c.is_geo) ?? -1;
  const hasGeo = geoColIndex >= 0;
  const pkColName = activeTab.tableSchema?.columns.find((c) => c.is_primary_key)?.name ?? null;
  const canEdit = pkColName !== null;

  const dataGrid = (
    <DataGrid
      result={activeTab.result}
      tableSchema={activeTab.tableSchema}
      pendingChanges={activeTab.pendingChanges}
      selectedRowIndices={activeTab.selectedRowIndices}
      onNavigateFK={handleNavigateFK}
      selectedRowIndex={activeTab.selectedRowIndex}
      onRowSelect={handleRowSelect}
      onContextMenu={handleContextMenu}
      onCellEdit={handleCellEdit}
      onDeleteRows={handleDeleteRows}
    />
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TabBar />

      {activeTab.showFilterBar && !activeTab.sqlMode && (
        <FilterBar tabId={activeTab.id} />
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        {activeTab.sqlMode ? (
          <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3">
            <SqlEditor
              value={activeTab.sql}
              onChange={(sql) => updateTab(activeTab.id, { sql })}
              onRun={handleRun}
              loading={activeTab.loading}
            />
            {activeTab.error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded border border-destructive/20 shrink-0">
                {activeTab.error}
              </div>
            )}
            {activeTab.loading && !activeTab.result ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Running query...
              </div>
            ) : dataGrid}
          </div>
        ) : activeView === "structure" ? (
          <StructureView
            connectionId={activeTab.connectionId}
            schema={activeTab.schema}
            table={activeTab.table}
          />
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {activeTab.error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded border border-destructive/20 mx-3 mt-3 shrink-0">
                {activeTab.error}
              </div>
            )}
            {activeTab.loading && !activeTab.result ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Running query...
              </div>
            ) : dataGrid}
          </div>
        )}
      </div>

      <BottomBar
        tabId={activeTab.id}
        activeView={activeView}
        onViewChange={setActiveView}
        onAddRow={canEdit ? handleAddRow : undefined}
        onShowMap={hasGeo ? () => handleShowMap(geoColIndex) : undefined}
        hasGeo={hasGeo}
        selectedCount={activeTab.selectedRowIndices.length}
        totalRowCount={activeTab.result?.total_count}
        canEdit={canEdit}
      />

      <MapDrawer
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        geojson={mapGeoJson}
        title={`${activeTab.schema}.${activeTab.table}`}
      />

      {contextMenu && activeTab.result && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          row={contextMenu.row}
          columns={activeTab.result.columns}
          rowIndex={contextMenu.rowIndex}
          onClose={() => setContextMenu(null)}
          onShowMap={(geoColIndex) => {
            handleShowMap(geoColIndex, contextMenu.rowIndex);
            setContextMenu(null);
          }}
          onFilterBy={handleFilterBy}
        />
      )}

      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-base mb-2">Discard all changes?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Tips: You can commit the changes by
              <br />1. Command + S (Mac) / Ctrl + S (Windows)
              <br />2. Click the save button in the toolbar.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDiscardModal(false)}
                className="px-4 py-2 text-sm rounded border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-2 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
