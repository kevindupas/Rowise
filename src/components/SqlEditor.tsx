import CodeMirror, { oneDark } from "@uiw/react-codemirror";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { format } from "sql-formatter";
import { ChevronDown, Settings2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

interface TableInfo {
  schema: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onRun: () => void;
  loading?: boolean;
  connectionId?: string;
  dbType?: "postgresql" | "mysql" | "sqlite";
}

const LIMIT_OPTIONS = [
  { label: "No limit", value: 0 },
  { label: "100 rows", value: 100 },
  { label: "200 rows", value: 200 },
  { label: "500 rows", value: 500 },
  { label: "1 000 rows", value: 1000 },
  { label: "5 000 rows", value: 5000 },
  { label: "10 000 rows", value: 10000 },
  { label: "50 000 rows", value: 50000 },
  { label: "100 000 rows", value: 100000 },
  { label: "500 000 rows", value: 500000 },
];

const RUN_OPTIONS = ["Run Current", "Run All", "Add Query", "Save SQL as"];

function SplitButton({ label, options, onMain, onSelect }: { label: string; options: string[]; onMain: () => void; onSelect: (o: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const btnStyle: React.CSSProperties = {
    height: 26, background: "rgba(128,128,128,0.15)", border: "none",
    cursor: "pointer", color: "var(--foreground)", fontSize: 12, fontWeight: 500,
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "flex" }}>
      <button
        onClick={onMain}
        style={{ ...btnStyle, padding: "0 10px", borderRadius: "5px 0 0 5px", borderRight: "1px solid rgba(128,128,128,0.25)" }}
        className="hover:bg-muted/50 transition-colors"
      >
        {label}
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ ...btnStyle, padding: "0 6px", borderRadius: "0 5px 5px 0" }}
        className="hover:bg-muted/50 transition-colors"
      >
        <ChevronDown style={{ width: 12, height: 12 }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", right: 0,
          background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          minWidth: 160, zIndex: 50, padding: "4px 0",
        }}>
          {options.map((o) => (
            <button
              key={o}
              onClick={() => { onSelect(o); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "5px 12px", fontSize: 12, background: "none",
                border: "none", cursor: "pointer", color: "var(--foreground)",
              }}
              className="hover:bg-accent transition-colors"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dropdown({ label, options, onSelect }: { label: string; options: string[]; onSelect: (o: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          height: 26, padding: "0 8px", borderRadius: 5,
          fontSize: 12, fontWeight: 500, cursor: "pointer",
          background: "rgba(128,128,128,0.15)", border: "none",
          color: "var(--foreground)",
        }}
        className="hover:bg-muted/50 transition-colors"
      >
        {label}
        <ChevronDown style={{ width: 12, height: 12 }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 4px)", right: 0,
          background: "var(--popover)", border: "1px solid var(--border)",
          borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          minWidth: 160, zIndex: 50, padding: "4px 0",
        }}>
          {options.map((o) => (
            <button
              key={o}
              onClick={() => { onSelect(o); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "5px 12px", fontSize: 12, background: "none",
                border: "none", cursor: "pointer", color: "var(--foreground)",
              }}
              className="hover:bg-accent transition-colors"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SqlEditor({ value, onChange, onRun, loading, connectionId, dbType }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [sqlSchema, setSqlSchema] = useState<Record<string, string[]>>({});
  const [cursorInfo, setCursorInfo] = useState("line 1, column 1, location 1");
  const [limit, setLimit] = useState(0);
  const [beautify, setBeautify] = useState(true);

  useEffect(() => {
    if (!connectionId) return;
    invoke<TableInfo[]>("get_tables", { connectionId }).then((tables) => {
      const schema: Record<string, string[]> = {};
      for (const t of tables) {
        schema[`${t.schema}.${t.name}`] = [];
        schema[t.name] = [];
      }
      setSqlSchema(schema);
    }).catch(() => {});
  }, [connectionId]);

  const dialect = dbType === "mysql" ? MySQL : dbType === "sqlite" ? SQLite : PostgreSQL;
  const sqlExtension = sql({ dialect, schema: sqlSchema });

  const formatLabel = dbType === "mysql" ? "mysql" : dbType === "sqlite" ? "sqlite" : "postgresql";

  function handleBeautify() {
    try {
      const formatted = format(value, { language: formatLabel as any, tabWidth: 2 });
      onChange(formatted);
    } catch {}
  }

  function handleUglify() {
    onChange(value.replace(/\s+/g, " ").trim());
  }

  const currentLimitLabel = LIMIT_OPTIONS.find((o) => o.value === limit)?.label ?? "No limit";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "var(--background)" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 36, padding: "0 10px", borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <button style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", opacity: 0.6, color: "var(--foreground)" }}>
          <Settings2 style={{ width: 14, height: 14 }} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>SQL Query</span>
        <div style={{ width: 20 }} />
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <CodeMirror
          value={value}
          height="100%"
          extensions={[sqlExtension]}
          theme={isDark ? oneDark : undefined}
          onChange={onChange}
          onUpdate={(update) => {
            const sel = update.state.selection.main;
            const line = update.state.doc.lineAt(sel.head);
            const col = sel.head - line.from + 1;
            setCursorInfo(`line ${line.number}, column ${col}, location ${sel.head}`);
          }}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
          style={{ height: "100%", fontSize: 13 }}
        />
      </div>

      {/* Bottom bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 36, padding: "0 10px", borderTop: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, opacity: 0.5 }}>{cursorInfo}</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Dropdown
            label={currentLimitLabel}
            options={LIMIT_OPTIONS.map((o) => o.label)}
            onSelect={(l) => setLimit(LIMIT_OPTIONS.find((o) => o.label === l)?.value ?? 0)}
          />

          <Dropdown
            label={beautify ? "Beautify ⌘I" : "Uglify ⌘I"}
            options={["Beautify ⌘I", "Uglify ⌘I"]}
            onSelect={(o) => {
              if (o.startsWith("Beautify")) { setBeautify(true); handleBeautify(); }
              else { setBeautify(false); handleUglify(); }
            }}
          />

          <SplitButton
            label={loading ? "Running..." : "Run Current ⌘↵"}
            options={RUN_OPTIONS}
            onMain={onRun}
            onSelect={async (o) => {
              if (o === "Run Current" || o === "Run All") {
                onRun();
              } else if (o === "Add Query") {
                onChange(value.trimEnd() + "\n\n;\n\n");
              } else if (o === "Save SQL as") {
                const path = await save({ filters: [{ name: "SQL", extensions: ["sql"] }] });
                if (path) await writeTextFile(path, value);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
