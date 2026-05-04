import { useState } from "react";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { useTabStore } from "../store/tabs";
import { Button } from "./ui/button";

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

export function BottomBar({ tabId, activeView, onViewChange, onAddRow, onShowMap, hasGeo, selectedCount, totalRowCount, canEdit }: Props) {
  const { tabs, toggleFilterBar, nextPage, prevPage, setLimit } = useTabStore();
  const [limitOpen, setLimitOpen] = useState(false);
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  const rowCount = tab.result?.rows.length ?? 0;
  const totalCount = tab.result?.total_count ?? null;
  const hasPrev = tab.offset > 0;
  const hasNext = tab.limit > 0 && (totalCount !== null
    ? tab.offset + tab.limit < totalCount
    : tab.result !== null && tab.result.rows.length === tab.limit);

  return (
    <div className="h-8 border-t flex items-center justify-between px-0 shrink-0 bg-muted/10 text-xs relative">
      {/* Left: Data / Structure + Add row + Show map */}
      <div className="flex items-center">
        <button
          className={`px-3 h-8 border-r transition-colors ${
            activeView === "data"
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onViewChange("data")}
        >
          Data
        </button>
        <button
          className={`px-3 h-8 border-r transition-colors ${
            activeView === "structure"
              ? "text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => onViewChange("structure")}
        >
          Structure
        </button>

        {activeView === "data" && canEdit && onAddRow && (
          <button
            onClick={onAddRow}
            className="px-3 h-8 border-r text-green-500 hover:text-green-400 transition-colors"
            title="Add row"
          >
            + Add row
          </button>
        )}

        {activeView === "data" && hasGeo && onShowMap && (
          <button
            onClick={onShowMap}
            className="px-3 h-8 border-r text-blue-500 hover:text-blue-400 transition-colors"
          >
            🌍 Show on Map
          </button>
        )}

        {/* Selected rows info */}
      </div>

      {/* Center: range or selection info */}
      {activeView === "data" && (
        <span className="absolute left-1/2 -translate-x-1/2 text-muted-foreground pointer-events-none">
          {selectedCount && selectedCount > 0
            ? `${selectedCount} of ${totalRowCount ?? rowCount} selected`
            : totalRowCount != null
              ? `${tab.offset + 1}–${tab.offset + rowCount} of ${totalRowCount.toLocaleString()} rows`
              : `${rowCount} rows`
          }
        </span>
      )}

      {/* Right: Filters + pagination */}
      <div className="flex items-center gap-1 px-2">
        <button
          className={`px-2 h-6 rounded transition-colors text-xs ${
            tab.showFilterBar
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => toggleFilterBar(tabId)}
        >
          Filters
        </button>

        <div className="w-px h-4 bg-border mx-1" />

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
            className="h-6 px-1.5 rounded text-muted-foreground hover:text-foreground flex items-center gap-0.5"
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
                    opt === tab.limit ? "font-medium" : ""
                  }`}
                  onClick={() => { setLimit(tabId, opt); setLimitOpen(false); }}
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
