import { useState } from "react";
import { X, Plus, Download, ChevronDown } from "lucide-react";
import { useTabStore, FilterRule, FilterOperator } from "../store/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";

const OPERATORS: FilterOperator[] = [
  "=", "<>", "<", ">", "<=", ">=",
  "IN", "NOT IN",
  "IS NULL", "IS NOT NULL",
  "BETWEEN", "NOT BETWEEN",
  "LIKE", "ILIKE",
  "Contains", "Not contains",
  "Contains CI", "Not contains CI",
  "Has prefix", "Has suffix",
  "Has prefix CI", "Has suffix CI",
];

const NO_VALUE_OPS: FilterOperator[] = ["IS NULL", "IS NOT NULL"];
const TWO_VALUE_OPS: FilterOperator[] = ["BETWEEN", "NOT BETWEEN"];

interface Props {
  tabId: string;
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
      case "BETWEEN": return `${col} BETWEEN '${f.value}' AND '${f.value2}'`;
      case "NOT BETWEEN": return `${col} NOT BETWEEN '${f.value}' AND '${f.value2}'`;
      case "Contains": return `${col} LIKE '%${f.value}%'`;
      case "Not contains": return `${col} NOT LIKE '%${f.value}%'`;
      case "Contains CI": return `${col} ILIKE '%${f.value}%'`;
      case "Not contains CI": return `${col} NOT ILIKE '%${f.value}%'`;
      case "Has prefix": return `${col} LIKE '${f.value}%'`;
      case "Has suffix": return `${col} LIKE '%${f.value}'`;
      case "Has prefix CI": return `${col} ILIKE '${f.value}%'`;
      case "Has suffix CI": return `${col} ILIKE '%${f.value}'`;
      default: return `${col} ${f.operator} '${f.value}'`;
    }
  });
  return "WHERE " + clauses.join(" AND ");
}

export function FilterBar({ tabId }: Props) {
  const { tabs, addFilter, removeFilter, updateFilter, runTabQuery, toggleFilterBar } = useTabStore();
  const [sqlOpen, setSqlOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  const columns = tab.result?.columns ?? [];

  const currentSql = tab.sqlMode
    ? tab.sql
    : `SELECT * FROM "${tab.schema}"."${tab.table}" ${buildWhereClause(tab.filters)}`.trim();

  const allCheckedSql = `SELECT * FROM "${tab.schema}"."${tab.table}" ${buildWhereClause(tab.filters)}`.trim();

  function handleApplyAll() {
    runTabQuery(tabId);
  }

  function handleClear() {
    const ids = tab?.filters.map((f) => f.id) ?? [];
    if (ids.length === 0) return;
    ids.forEach((id, i) => {
      if (i < ids.length - 1) {
        useTabStore.setState((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId
              ? { ...t, filters: t.filters.filter((f) => f.id !== id) }
              : t
          ),
        }));
      } else {
        removeFilter(tabId, id);
      }
    });
  }

  return (
    <div className="border-b bg-muted/5 shrink-0">
      {/* Filter rows */}
      <div className="flex flex-col">
        {tab.filters.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <span>No filters.</span>
            <button className="text-primary hover:underline" onClick={() => addFilter(tabId)}>
              Add one
            </button>
          </div>
        )}
        {tab.filters.map((rule) => (
          <FilterRow
            key={rule.id}
            rule={rule}
            columns={columns.map((c) => c.name)}
            onChange={(partial) => updateFilter(tabId, rule.id, partial)}
            onRemove={() => removeFilter(tabId, rule.id)}
            onApply={handleApplyAll}
            onAdd={() => addFilter(tabId)}
          />
        ))}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-muted/10 text-xs text-muted-foreground">
        <button
          onClick={() => setExportOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-foreground"
        >
          <Download className="h-3 w-3" />
          Export
        </button>
        <button
          onClick={() => setSqlOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-foreground font-medium"
        >
          SQL
        </button>

        <div className="h-4 w-px bg-border mx-1" />

        <span className="hidden lg:flex items-center gap-3 text-muted-foreground/60">
          <span>Show: <kbd className="font-mono">⌘F</kbd></span>
          <span>Insert: <kbd className="font-mono">⌘I</kbd></span>
          <span>Remove: <kbd className="font-mono">⌘⌥I</kbd></span>
          <span>Apply All: <kbd className="font-mono">↵</kbd></span>
          <span>Exit: <kbd className="font-mono">Esc</kbd></span>
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleClear}
            className="px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-foreground"
          >
            Clear
          </button>
          <div className="flex items-center rounded border border-border overflow-hidden">
            <button
              onClick={handleApplyAll}
              className="px-2 py-1 hover:bg-muted/40 transition-colors text-foreground"
            >
              Apply All
            </button>
            <div className="w-px h-5 bg-border" />
            <button
              onClick={() => toggleFilterBar(tabId)}
              className="px-1.5 py-1 hover:bg-muted/40 transition-colors text-foreground"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* SQL Modal */}
      <Dialog open={sqlOpen} onOpenChange={setSqlOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>SQL Preview</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">-- Current filter --</p>
              <pre className="text-xs font-mono bg-muted/30 border border-border rounded p-3 whitespace-pre-wrap break-all text-foreground">
                {currentSql + ";"}
              </pre>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">-- All checked filters --</p>
              <pre className="text-xs font-mono bg-muted/30 border border-border rounded p-3 whitespace-pre-wrap break-all text-foreground">
                {allCheckedSql + ";"}
              </pre>
            </div>
          </div>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* Export Modal */}
      {exportOpen && (
        <ExportModal
          tab={tab}
          onClose={() => setExportOpen(false)}
          currentSql={allCheckedSql}
        />
      )}
    </div>
  );
}

// ── Export Modal ──────────────────────────────────────────────────────────────

type ExportFormat = "CSV" | "JSON" | "SQL";

function ExportModal({
  tab,
  onClose,
  currentSql,
}: {
  tab: ReturnType<typeof useTabStore.getState>["tabs"][number];
  onClose: () => void;
  currentSql: string;
}) {
  const [format, setFormat] = useState<ExportFormat>("CSV");
  const [nullToEmpty, setNullToEmpty] = useState(false);
  const [lineBreakToSpace, setLineBreakToSpace] = useState(false);
  const [headerRow, setHeaderRow] = useState(true);
  const [delimiter, setDelimiter] = useState(",");

  function doExport() {
    if (!tab.result) return;
    const cols = tab.result.columns;
    const rows = tab.result.rows;

    let content = "";
    let mime = "text/plain";
    let ext = "txt";

    if (format === "CSV") {
      mime = "text/csv";
      ext = "csv";
      const lines: string[] = [];
      if (headerRow) lines.push(cols.map((c) => c.name).join(delimiter));
      for (const row of rows) {
        lines.push(
          row.map((cell) => {
            if (!cell || cell.type === "Null") return nullToEmpty ? "" : "NULL";
            if (cell.type === "Geo") return "[geometry]";
            let v = String(cell.value ?? "");
            if (lineBreakToSpace) v = v.replace(/\r?\n/g, " ");
            return v.includes(delimiter) || v.includes('"') || v.includes("\n")
              ? `"${v.replace(/"/g, '""')}"`
              : v;
          }).join(delimiter)
        );
      }
      content = lines.join("\n");
    } else if (format === "JSON") {
      mime = "application/json";
      ext = "json";
      const objects = rows.map((row) => {
        const obj: Record<string, unknown> = {};
        cols.forEach((col, i) => {
          const cell = row[i];
          if (!cell || cell.type === "Null") obj[col.name] = nullToEmpty ? "" : null;
          else if (cell.type === "Geo") obj[col.name] = cell.value.geojson;
          else obj[col.name] = cell.value;
        });
        return obj;
      });
      content = JSON.stringify(objects, null, 2);
    } else {
      mime = "text/sql";
      ext = "sql";
      const lines: string[] = [`-- ${currentSql};`, ""];
      for (const row of rows) {
        const colNames = cols.map((c) => `"${c.name}"`).join(", ");
        const values = row.map((cell) => {
          if (!cell || cell.type === "Null") return "NULL";
          if (cell.type === "Bool") return cell.value ? "TRUE" : "FALSE";
          if (cell.type === "Number") return String(cell.value);
          if (cell.type === "Geo") return "NULL";
          return `'${String(cell.value).replace(/'/g, "''")}'`;
        }).join(", ");
        lines.push(`INSERT INTO "${tab.schema}"."${tab.table}" (${colNames}) VALUES (${values});`);
      }
      content = lines.join("\n");
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab.table}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export filter result</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* File name */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24">File name:</span>
            <span className="text-foreground font-medium">{tab.table}</span>
          </div>

          {/* Fields */}
          <div>
            <p className="text-sm font-medium mb-1">Select fields to export</p>
            <input
              className="w-full h-9 rounded border border-border bg-muted/30 px-3 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="All fields…"
              readOnly
            />
          </div>

          {/* Export query */}
          <div>
            <p className="text-sm font-medium mb-1">Export query</p>
            <p className="text-xs text-muted-foreground font-mono bg-muted/20 rounded p-2 border border-border">
              {currentSql};
            </p>
          </div>

          {/* Format tabs */}
          <div className="flex rounded border border-border overflow-hidden w-fit">
            {(["CSV", "JSON", "SQL"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`px-4 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 ${
                  format === f
                    ? "bg-foreground text-background"
                    : "hover:bg-muted/40 text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* CSV options */}
          {format === "CSV" && (
            <div className="space-y-2 border border-border rounded p-3 bg-muted/10">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={nullToEmpty} onChange={(e) => setNullToEmpty(e.target.checked)} className="accent-primary" />
                <span>Convert NULL to EMPTY</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={lineBreakToSpace} onChange={(e) => setLineBreakToSpace(e.target.checked)} className="accent-primary" />
                <span>Convert line break to space</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={headerRow} onChange={(e) => setHeaderRow(e.target.checked)} className="accent-primary" />
                <span>Put field names in the first row</span>
              </label>
              <div className="flex items-center gap-2 pt-1">
                <span className="w-24 text-muted-foreground">Delimiter</span>
                <select
                  className="h-7 text-xs bg-muted/30 border border-border rounded px-2 text-foreground"
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                >
                  <option value=",">,</option>
                  <option value=";">;</option>
                  <option value="\t">Tab</option>
                  <option value="|">|</option>
                </select>
              </div>
            </div>
          )}

          {format === "JSON" && (
            <div className="space-y-2 border border-border rounded p-3 bg-muted/10">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={nullToEmpty} onChange={(e) => setNullToEmpty(e.target.checked)} className="accent-primary" />
                <span>Convert NULL to empty string</span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-border hover:bg-muted/40 text-sm text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={doExport}
            className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
          >
            Export…
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Filter Row ─────────────────────────────────────────────────────────────────

interface FilterRowProps {
  rule: FilterRule;
  columns: string[];
  onChange: (partial: Partial<FilterRule>) => void;
  onRemove: () => void;
  onApply: () => void;
  onAdd: () => void;
}

function FilterRow({ rule, columns, onChange, onRemove, onApply, onAdd }: FilterRowProps) {
  const noValue = NO_VALUE_OPS.includes(rule.operator);
  const twoValues = TWO_VALUE_OPS.includes(rule.operator);
  const isApplied = !!(rule.column && rule.operator && (noValue || rule.value));

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") onApply();
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-border last:border-b-0 px-2 h-9">
      {/* Checkbox */}
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 accent-primary"
        defaultChecked
        title="Enable/disable filter"
      />

      {/* Column */}
      <select
        aria-label="Filter column"
        className="h-7 text-xs bg-muted/30 border border-border rounded px-2 min-w-28 max-w-40 text-foreground"
        value={rule.column}
        onChange={(e) => onChange({ column: e.target.value })}
      >
        <option value="">Column…</option>
        {columns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>

      {/* Operator */}
      <select
        aria-label="Filter operator"
        className="h-7 text-xs bg-muted/30 border border-border rounded px-2 min-w-20 text-foreground"
        value={rule.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator })}
      >
        {OPERATORS.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>

      {/* Value */}
      {!noValue && (
        <input
          className="flex-1 h-7 text-xs bg-muted/30 border border-border rounded px-2 font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder={twoValues ? "From…" : "Value…"}
          value={rule.value}
          onChange={(e) => onChange({ value: e.target.value })}
          onKeyDown={handleKeyDown}
        />
      )}
      {twoValues && (
        <input
          className="w-28 h-7 text-xs bg-muted/30 border border-border rounded px-2 font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="To…"
          value={rule.value2}
          onChange={(e) => onChange({ value2: e.target.value })}
          onKeyDown={handleKeyDown}
        />
      )}
      {noValue && <div className="flex-1" />}

      {/* Applied — button that triggers apply */}
      <button
        onClick={onApply}
        className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 transition-colors ${
          isApplied
            ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/25"
            : "bg-muted/20 text-muted-foreground border-border hover:bg-muted/40"
        }`}
      >
        Applied
      </button>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive shrink-0"
        aria-label="Remove filter"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Add */}
      <button
        onClick={onAdd}
        className="text-muted-foreground hover:text-primary shrink-0"
        aria-label="Add filter"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
