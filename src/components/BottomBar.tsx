import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  Plus,
  Map,
  Filter,
  Download,
  ChevronDown,
} from "lucide-react";
import { useTabStore } from "../store/tabs";
import { Button } from "./ui/button";
import { exportCsv, exportGeoJson } from "../lib/export";

const LIMIT_OPTIONS = [50, 100, 300, 500, 1000];

interface Props {
  tabId: string;
  activeView: "data" | "structure";
  onViewChange: (v: "data" | "structure") => void;
  onAddRow?: () => void;
  onShowMap?: () => void;
  hasGeo?: boolean;
  selectedCount?: number;
  totalRowCount?: number | null;
  canEdit?: boolean;
}

export function BottomBar({
  tabId,
  activeView,
  onViewChange,
  onAddRow,
  onShowMap,
  hasGeo,
  selectedCount,
  totalRowCount,
  canEdit,
}: Props) {
  const { tabs, toggleFilterBar, nextPage, prevPage, setLimit } = useTabStore();
  const [limitOpen, setLimitOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  const geoColIndex = tab.result?.columns.findIndex((c) => c.is_geo) ?? -1;
  const exportName = tab.table || "export";

  const rowCount = tab.result?.rows.length ?? 0;
  const totalCount = tab.result?.total_count ?? null;
  const hasPrev = tab.offset > 0;
  const hasNext =
    tab.limit > 0 &&
    (totalCount !== null
      ? tab.offset + tab.limit < totalCount
      : tab.result !== null && tab.result.rows.length === tab.limit);

  return (
    <div className="h-9 border-t flex items-center justify-between px-0 shrink-0 bg-muted/10 text-xs relative">
      {/* Left: view tabs + action buttons */}
      <div className="flex items-center h-full">
        {/* View tabs */}
        <div className="flex items-center gap-0.5 px-2 border-r h-full">
          {(["data", "structure"] as const).map((view) => (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              className={`px-2.5 h-5 rounded text-xs font-medium transition-colors
                ${
                  activeView === view
                    ? "bg-foreground text-background"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
            >
              {view === "data" ? "Data" : "Structure"}
            </button>
          ))}
        </div>

        {/* Action buttons — only in data view */}
        {activeView === "data" && (
          <div className="flex items-center gap-1 px-2 border-r h-full">
            {canEdit && onAddRow && (
              <button
                onClick={onAddRow}
                className="flex items-center gap-1 px-2 h-5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                title="Add row"
              >
                <Plus className="h-3 w-3" />
                Add row
              </button>
            )}

            {hasGeo && onShowMap && (
              <button
                onClick={onShowMap}
                className="flex items-center gap-1 px-2 h-5 rounded text-xs font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                <Map className="h-3 w-3" />
                Map
              </button>
            )}

            {tab.result && (
              <div className="relative">
                <button
                  onClick={() => setExportOpen((o) => !o)}
                  onBlur={(e) => {
                    if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) setExportOpen(false);
                  }}
                  className="flex items-center gap-1 px-2 h-5 rounded text-xs font-medium bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Export
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
                {exportOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-popover border rounded shadow-md py-1 z-50 min-w-36">
                    <button
                      className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                      onClick={() => { exportCsv(tab.result!, exportName); setExportOpen(false); }}
                    >
                      Export as CSV
                    </button>
                    {geoColIndex >= 0 && (
                      <button
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-accent"
                        onClick={() => { exportGeoJson(tab.result!, geoColIndex, exportName); setExportOpen(false); }}
                      >
                        Export as GeoJSON
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: range or selection info */}
      {activeView === "data" && (
        <span className="absolute left-1/2 -translate-x-1/2 text-muted-foreground pointer-events-none tabular-nums">
          {selectedCount && selectedCount > 0
            ? `${selectedCount} of ${totalRowCount ?? rowCount} selected`
            : totalRowCount != null
              ? `${tab.offset + 1}–${tab.offset + rowCount} of ${totalRowCount.toLocaleString()} rows`
              : `${rowCount} rows`}
        </span>
      )}

      {/* Right: filter + pagination */}
      <div className="flex items-center gap-0.5 px-2">
        {activeView === "data" && (
          <button
            onClick={() => toggleFilterBar(tabId)}
            className={`flex items-center gap-1 px-2 h-5 rounded text-xs font-medium transition-colors mr-1 ${
              tab.showFilterBar
                ? "bg-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/30"
                : "bg-violet-500/10 text-violet-600/60 dark:text-violet-400/60 hover:bg-violet-500/20 hover:text-violet-600 dark:hover:text-violet-400"
            }`}
          >
            <Filter className="h-3 w-3" />
            Filter
          </button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!hasPrev}
          onClick={() => prevPage(tabId)}
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <div className="relative">
          <button
            className="h-6 px-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1 transition-colors"
            title="Rows per page"
            onClick={() => setLimitOpen((o) => !o)}
            onBlur={(e) => {
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                setLimitOpen(false);
              }
            }}
          >
            <Settings2 className="h-3 w-3" />
            <span>{tab.limit}</span>
          </button>
          {limitOpen && (
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-popover border rounded shadow-md py-1 z-50 min-w-20">
              {LIMIT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`block w-full text-left px-3 py-1 text-xs hover:bg-accent ${
                    opt === tab.limit ? "font-medium text-foreground" : ""
                  }`}
                  onClick={() => {
                    setLimit(tabId, opt);
                    setLimitOpen(false);
                  }}
                >
                  {opt} rows
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!hasNext}
          onClick={() => nextPage(tabId)}
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
