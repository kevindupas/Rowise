import { useRef, useState, useEffect } from "react";
import { useTabStore, type CellPrimitive, type ColumnInfo, type TableStats } from "../store/tabs";
import { CellValue, QueryColumn } from "./DataGrid";
import { ScrollArea } from "./ui/scroll-area";
import { Search, SlidersHorizontal, ChevronDown, Send, Bot } from "lucide-react";
import { GeoPreview } from "./GeoPreview";

// ─── Type helpers ────────────────────────────────────────────────────────────

function getTypeCategory(typeName: string): "bool" | "int" | "float" | "text" | "json" | "geo" | "timestamp" | "other" {
  const t = typeName.toLowerCase();
  if (t === "bool" || t === "boolean") return "bool";
  if (t.includes("int") || t === "bigserial" || t === "smallserial" || t === "serial") return "int";
  if (t.includes("float") || t.includes("double") || t.includes("numeric") || t.includes("decimal") || t.includes("real") || t === "money") return "float";
  if (t.includes("timestamp") || t.includes("date") || t === "time" || t.includes("timetz") || t.includes("timestamptz")) return "timestamp";
  if (t === "json" || t === "jsonb") return "json";
  if (t.includes("geometry") || t.includes("geography") || t.includes("geo")) return "geo";
  if (t.includes("char") || t === "text" || t === "varchar" || t.includes("string") || t === "citext") return "text";
  return "other";
}

function getDropdownOptions(
  category: ReturnType<typeof getTypeCategory>,
  _nullable: boolean,
  hasDefault: boolean,
  defaultVal: string | null,
  isActuallyJson: boolean,
  isGeo: boolean,
): { label: string; value: CellPrimitive; special?: "pretty" | "empty" | "now" }[] {
  const opts: { label: string; value: CellPrimitive; special?: "pretty" | "empty" | "now" }[] = [];

  if (category === "bool") {
    opts.push({ label: "TRUE", value: true });
    opts.push({ label: "FALSE", value: false });
  }
  opts.push({ label: "NULL", value: null });
  if (hasDefault) opts.push({ label: "DEFAULT", value: defaultVal });
  if (category === "timestamp") opts.push({ label: "NOW()", value: "NOW()", special: "now" });
  if (category === "text" || isActuallyJson || isGeo) {
    opts.push({ label: "EMPTY", value: "", special: "empty" });
  }
  if (isActuallyJson || isGeo) {
    opts.push({ label: "PRETTY", value: null, special: "pretty" });
  }

  return opts;
}

// ─── JSON syntax highlighter ─────────────────────────────────────────────────

function JsonDisplay({ value }: { value: string }) {
  const tokens: { text: string; className: string }[] = [];
  const re = /("(?:[^"\\]|\\.)*")\s*(:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) tokens.push({ text: value.slice(last, m.index), className: "" });
    if (m[1] !== undefined) {
      tokens.push({ text: m[1], className: m[2] !== undefined ? "text-[#9cdcfe]" : "text-[#e05c8a]" });
      if (m[2] !== undefined) tokens.push({ text: m[2], className: "text-muted-foreground" });
    } else if (m[3] !== undefined) {
      tokens.push({ text: m[3], className: m[3] === "null" ? "text-muted-foreground/60 italic" : "text-[#569cd6]" });
    } else if (m[4] !== undefined) {
      tokens.push({ text: m[4], className: "text-[#b5cea8]" });
    } else if (m[5] !== undefined) {
      tokens.push({ text: m[5], className: "text-muted-foreground/70" });
    }
    last = m.index + m[0].length;
  }
  if (last < value.length) tokens.push({ text: value.slice(last), className: "" });

  return (
    <pre className="px-2 py-1.5 text-xs font-mono whitespace-pre break-all overflow-x-auto">
      {tokens.map((t, i) => <span key={i} className={t.className}>{t.text}</span>)}
    </pre>
  );
}

// ─── Pending value helper ────────────────────────────────────────────────────

function getPendingValue(
  changes: ReturnType<typeof useTabStore.getState>["tabs"][0]["pendingChanges"],
  rowIndex: number,
  col: string
): CellPrimitive | undefined {
  const update = [...changes].reverse().find(
    (c) => c.kind === "update" && c.rowIndex === rowIndex && c.col === col
  );
  if (update && update.kind === "update") return update.newValue;
  return undefined;
}

function cellToDisplay(cell: CellValue): string {
  if (!cell || cell.type === "Null") return "";
  if (cell.type === "Geo") return cell.value.wkt ?? "geometry";
  if (cell.type === "Bool") return cell.value ? "true" : "false";
  return String(cell.value ?? "");
}

function cellToEditValue(cell: CellValue): CellPrimitive {
  if (!cell || cell.type === "Null") return null;
  if (cell.type === "Bool") return cell.value;
  if (cell.type === "Number") return cell.value;
  if (cell.type === "Geo") return cell.value.wkt ?? null;
  return cell.value;
}

// ─── Settings popover ────────────────────────────────────────────────────────

interface PanelSettings {
  matchStrategy: "fuzzy" | "contains";
  assistantEnabled: boolean;
}

function SettingsPopover({
  settings,
  onChange,
  onClose,
}: {
  settings: PanelSettings;
  onChange: (s: PanelSettings) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded shadow-lg py-1 min-w-48 text-xs"
    >
      {/* Matching strategy */}
      <div className="px-3 py-1 text-muted-foreground/60 text-[10px] uppercase tracking-wide">Matching strategy</div>
      {(["fuzzy", "contains"] as const).map((s) => (
        <button
          key={s}
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
          onClick={() => onChange({ ...settings, matchStrategy: s })}
        >
          <span className="w-3 text-primary">{settings.matchStrategy === s ? "✓" : ""}</span>
          {s === "fuzzy" ? "Fuzzy - default" : "Contains"}
        </button>
      ))}
      <div className="my-1 border-t" />

      {/* Assistant toggle */}
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground"
        onClick={() => onChange({ ...settings, assistantEnabled: !settings.assistantEnabled })}
      >
        <span className="w-3">{settings.assistantEnabled ? "✓" : ""}</span>
        Enable LLM Chat
      </button>
    </div>
  );
}

// ─── Assistant tab ────────────────────────────────────────────────────────────

const PROVIDERS = ["OpenAI", "Anthropic", "Google AI", "OpenRouter", "DeepSeek", "GitHub Copilot", "Ollama"] as const;
type Provider = typeof PROVIDERS[number];

const MODELS: Record<Provider, string[]> = {
  "OpenAI": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  "Anthropic": ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5"],
  "Google AI": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  "OpenRouter": ["auto"],
  "DeepSeek": ["deepseek-chat", "deepseek-reasoner"],
  "GitHub Copilot": ["gpt-4o", "gpt-4o-mini"],
  "Ollama": ["llama3.2", "mistral", "codellama"],
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function AssistantPanel() {
  const [provider, setProvider] = useState<Provider>("OpenAI");
  const [model, setModel] = useState("gpt-4o");
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const providerRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (providerRef.current && !providerRef.current.contains(e.target as Node)) setProviderOpen(false);
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function changeProvider(p: Provider) {
    setProvider(p);
    setModel(MODELS[p][0]);
    setProviderOpen(false);
  }

  function send() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    // Placeholder — real API call would go here
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: "assistant", content: "LLM integration not yet connected. Configure your API key to enable responses." }]);
    }, 400);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Bot className="w-8 h-8 opacity-40" />
              <p className="text-xs text-center">Ask anything about this row or table</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-2 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5 bg-muted/40 rounded border border-border/50 px-2 py-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about this row..."
            rows={2}
            className="flex-1 bg-transparent text-xs outline-none resize-none placeholder:text-muted-foreground"
          />
          <button
            onClick={send}
            disabled={!input.trim()}
            className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Provider + model selectors */}
        <div className="flex items-center gap-1 text-xs">
          <div className="relative" ref={providerRef}>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded border border-border/50 bg-muted/30 hover:bg-muted text-xs"
              onClick={() => setProviderOpen((o) => !o)}
            >
              <span>{provider}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {providerOpen && (
              <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border rounded shadow-lg py-1 min-w-40">
                {PROVIDERS.map((p) => (
                  <button
                    key={p}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-xs"
                    onClick={() => changeProvider(p)}
                  >
                    {p}
                  </button>
                ))}
                <div className="border-t my-1" />
                <button className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-xs text-muted-foreground">
                  Add Vendor...
                </button>
              </div>
            )}
          </div>

          <div className="relative" ref={modelRef}>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded border border-border/50 bg-muted/30 hover:bg-muted text-xs"
              onClick={() => setModelOpen((o) => !o)}
            >
              <span>{model}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {modelOpen && (
              <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border rounded shadow-lg py-1 min-w-40">
                {MODELS[provider].map((m) => (
                  <button
                    key={m}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-xs font-mono"
                    onClick={() => { setModel(m); setModelOpen(false); }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground">
            <SlidersHorizontal className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  column: QueryColumn;
  cell: CellValue;
  schemaCol: ColumnInfo | null;
  canEdit: boolean;
  onEdit: (val: CellPrimitive) => void;
  onPretty: () => void;
  pendingValue: CellPrimitive | undefined;
}

function FieldRow({ column, cell, schemaCol, canEdit, onEdit, onPretty, pendingValue }: FieldRowProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasPending = pendingValue !== undefined;
  const displayValue = hasPending
    ? (pendingValue === null ? "" : String(pendingValue))
    : cellToDisplay(cell);
  const isNull = hasPending ? pendingValue === null : (!cell || cell.type === "Null");
  const isGeo = cell?.type === "Geo";
  const isActuallyJson = cell?.type === "Text" && (cell.value.startsWith("{") || cell.value.startsWith("["));

  const typeName = schemaCol?.type_name ?? column.type_name;
  const category = getTypeCategory(typeName);
  const isBool = category === "bool";
  const isJsonType = category === "json" || isActuallyJson;

  const nullable = schemaCol?.is_nullable ?? true;
  const hasDefault = !!schemaCol?.column_default;
  const defaultVal = schemaCol?.column_default ?? null;

  const dropdownOptions = getDropdownOptions(category, nullable, hasDefault, defaultVal, isActuallyJson, isGeo);
  const showDropdown = canEdit && dropdownOptions.length > 0;

  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  function startEdit() {
    if (!canEdit || isGeo) return;
    setLocalValue(displayValue);
    setEditing(true);
    setTimeout(() => {
      (isJsonType ? textareaRef.current : inputRef.current)?.focus();
    }, 0);
  }

  function commitEdit() {
    setEditing(false);
    const original = cellToEditValue(cell);
    let parsed: CellPrimitive = localValue;
    if (category === "int" || category === "float") {
      const n = Number(localValue);
      parsed = isNaN(n) ? localValue : n;
    } else if (isBool) {
      parsed = localValue.toLowerCase() === "true";
    } else if (isJsonType) {
      try { parsed = JSON.stringify(JSON.parse(localValue)); } catch { parsed = localValue; }
    }
    if (parsed !== original) onEdit(parsed);
  }

  function handleDropdownAction(opt: ReturnType<typeof getDropdownOptions>[0]) {
    if (opt.special === "pretty") {
      onPretty();
    } else if (opt.special === "empty") {
      onEdit("");
    } else {
      onEdit(opt.value);
    }
    setDropdownOpen(false);
  }

  return (
    <div className="py-1">
      <div className="flex items-center justify-between mb-0.5 px-0.5">
        <span className="text-xs font-medium text-foreground/80 truncate">{column.name}</span>
        <span className="text-xs text-muted-foreground shrink-0 ml-2">{typeName}</span>
      </div>

      <div className={`relative flex items-center rounded border bg-muted/20 ${hasPending ? "border-yellow-500/60" : "border-border/50"} ${canEdit && !isGeo ? "hover:border-border cursor-text" : ""}`}>
        {editing && isJsonType ? (
          <div className="relative flex-1 overflow-x-auto">
            <JsonDisplay value={localValue} />
            <textarea
              ref={textareaRef}
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitEdit(); }}
              rows={Math.max(1, localValue.split("\n").length)}
              className="absolute inset-0 w-full h-full bg-transparent px-2 py-1.5 text-xs outline-none font-mono resize-none text-transparent caret-foreground"
              spellCheck={false}
            />
          </div>
        ) : editing ? (
          <input
            ref={inputRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none font-mono"
          />
        ) : isGeo ? (
          <div className="flex-1 px-2 py-1.5">
            {cell?.type === "Geo" && cell.value.geojson ? (
              <GeoPreview
                geojson={{ type: "FeatureCollection", features: [{ type: "Feature", geometry: cell.value.geojson as never, properties: {} }] }}
                height={140}
              />
            ) : (
              <span className="text-xs font-mono text-muted-foreground/50 italic">NULL</span>
            )}
          </div>
        ) : isJsonType && !hasPending ? (
          <div className="flex-1 cursor-text overflow-x-auto" onClick={startEdit}>
            <JsonDisplay value={(cell as { type: "Text"; value: string }).value} />
          </div>
        ) : (
          <div
            className="flex-1 px-2 py-1.5 text-xs font-mono truncate cursor-text min-h-[28px]"
            onClick={startEdit}
          >
            {isNull ? (
              <span className="text-muted-foreground/50 italic">NULL</span>
            ) : (
              <span className={isBool ? (displayValue === "true" ? "text-green-500" : "text-red-400") : ""}>
                {displayValue}
              </span>
            )}
          </div>
        )}

        {showDropdown && (
          <div className="relative shrink-0 self-stretch" ref={dropdownRef}>
            <button
              className="px-1.5 h-full flex items-center text-muted-foreground hover:text-foreground border-l border-border/40"
              onClick={(e) => { e.stopPropagation(); setDropdownOpen((o) => !o); }}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-0.5 z-50 bg-popover border rounded shadow-lg py-1 min-w-28 text-xs">
                {dropdownOptions.map((opt) => (
                  <button
                    key={opt.label}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground font-mono"
                    onClick={() => handleDropdownAction(opt)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

function TableStatsView({ stats }: { stats: TableStats }) {
  const rows: { label: string; value: string | null; type: string }[] = [
    { label: "total_size", value: stats.total_size, type: "text" },
    { label: "data_size", value: stats.data_size, type: "text" },
    { label: "index_size", value: stats.index_size, type: "text" },
    { label: "comment", value: stats.comment, type: "text" },
  ].filter((r) => r.label !== "total_size" || stats.total_size !== null);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="px-2 py-1 space-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="py-1">
            <div className="flex items-center justify-between mb-0.5 px-0.5">
              <span className="text-xs font-medium text-foreground/80">{label}</span>
              <span className="text-xs text-muted-foreground">text</span>
            </div>
            <div className="flex items-center rounded border border-border/50 bg-muted/20 px-2 py-1.5 min-h-[28px]">
              {value ? (
                <span className="text-xs font-mono">{value}</span>
              ) : (
                <span className="text-xs font-mono text-muted-foreground/50 italic">NULL</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailPanel() {
  const { tabs, activeTabId, setPendingUpdate } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<"details" | "assistant">("details");
  const [settings, setSettings] = useState<PanelSettings>({ matchStrategy: "fuzzy", assistantEnabled: true });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  function matchesSearch(colName: string): boolean {
    if (!search) return true;
    if (settings.matchStrategy === "contains") return colName.toLowerCase().includes(search.toLowerCase());
    // Fuzzy: every char of search appears in order in colName
    const s = search.toLowerCase();
    const c = colName.toLowerCase();
    let si = 0;
    for (let ci = 0; ci < c.length && si < s.length; ci++) {
      if (c[ci] === s[si]) si++;
    }
    return si === s.length;
  }

  if (!activeTab?.result || activeTab.selectedRowIndex === null) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader
          activeView={activeView}
          setActiveView={setActiveView}
          settings={settings}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          settingsRef={settingsRef}
          setSettings={setSettings}
          search={search}
          setSearch={setSearch}
          showSearch={false}
        />
        {activeView === "assistant" && settings.assistantEnabled ? (
          <AssistantPanel />
        ) : activeTab?.tableStats ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-3 py-2 text-xs text-muted-foreground italic border-b">No Row Selected</div>
            <TableStatsView stats={activeTab.tableStats} />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs p-4 text-center">
            <p>No Row Selected</p>
          </div>
        )}
      </div>
    );
  }

  const { result, selectedRowIndex, tableSchema } = activeTab;
  const row = result.rows[selectedRowIndex];
  if (!row) return null;

  const canEdit = tableSchema?.columns.some((c) => c.is_primary_key) ?? false;

  const filtered = result.columns
    .map((col, i) => ({ col, cell: row[i], schemaCol: tableSchema?.columns.find((c) => c.name === col.name) ?? null, i }))
    .filter(({ col }) => matchesSearch(col.name));

  function handleEdit(colName: string, newValue: CellPrimitive) {
    if (!activeTabId || selectedRowIndex === null || !canEdit) return;
    setPendingUpdate(activeTabId, selectedRowIndex, colName, newValue);
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader
        activeView={activeView}
        setActiveView={setActiveView}
        settings={settings}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        settingsRef={settingsRef}
        setSettings={setSettings}
        search={search}
        setSearch={setSearch}
        showSearch={activeView === "details"}
      />

      {activeView === "assistant" && settings.assistantEnabled ? (
        <AssistantPanel />
      ) : activeView === "assistant" ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs p-4 text-center">
          <p>Enable LLM Chat in settings to use the assistant</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-2 py-1 space-y-1">
            {filtered.map(({ col, cell, schemaCol }) => (
              <FieldRow
                key={col.name}
                column={col}
                cell={cell}
                schemaCol={schemaCol}
                canEdit={canEdit}
                onEdit={(val) => handleEdit(col.name, val)}
                onPretty={() => {
                  if (cell?.type === "Text") {
                    try {
                      handleEdit(col.name, JSON.stringify(JSON.parse(cell.value), null, 2));
                    } catch { /* not valid JSON */ }
                  }
                }}
                pendingValue={getPendingValue(activeTab.pendingChanges, selectedRowIndex, col.name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel header (tabs + search + settings) ─────────────────────────────────

function PanelHeader({
  activeView, setActiveView, settings, settingsOpen, setSettingsOpen, settingsRef, setSettings, search, setSearch, showSearch,
}: {
  activeView: "details" | "assistant";
  setActiveView: (v: "details" | "assistant") => void;
  settings: PanelSettings;
  settingsOpen: boolean;
  setSettingsOpen: (o: boolean) => void;
  settingsRef: React.RefObject<HTMLDivElement | null>;
  setSettings: (s: PanelSettings) => void;
  search: string;
  setSearch: (s: string) => void;
  showSearch: boolean;
}) {
  return (
    <div className="shrink-0 border-b">
      {/* Pill tabs */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <div className="flex items-center bg-muted rounded-md p-0.5 flex-1">
          <button
            className={`flex-1 px-3 py-1 text-xs font-medium rounded transition-colors ${activeView === "details" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActiveView("details")}
          >
            Details
          </button>
          {settings.assistantEnabled && (
            <button
              className={`flex-1 px-3 py-1 text-xs font-medium rounded transition-colors ${activeView === "assistant" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiveView("assistant")}
            >
              Assistant
            </button>
          )}
        </div>
        {!showSearch && activeView === "details" && (
          <div className="relative" ref={settingsRef}>
            <button
              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            {settingsOpen && (
              <SettingsPopover
                settings={settings}
                onChange={(s) => {
                  setSettings(s);
                  if (!s.assistantEnabled) setActiveView("details");
                }}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Search + settings */}
      {showSearch && (
        <div className="flex items-center gap-1 px-2 pb-2">
          <div className="flex items-center gap-1.5 flex-1 bg-muted/40 rounded border border-transparent focus-within:border-blue-500 px-2 py-1">
            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for field..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="relative" ref={settingsRef}>
            <button
              className="p-1.5 rounded hover:bg-muted text-muted-foreground"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            {settingsOpen && (
              <SettingsPopover
                settings={settings}
                onChange={(s) => {
                  setSettings(s);
                  if (!s.assistantEnabled) setActiveView("details");
                }}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
