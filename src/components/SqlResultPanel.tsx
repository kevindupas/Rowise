import { useEffect, useRef, useState } from "react";
import { Pin, Search, Download, Trash2 } from "lucide-react";
import type { Tab } from "../store/tabs";
import { useQueryLogStore } from "../store/queryLog";

interface Props {
  tab: Tab;
  dataGrid: React.ReactNode;
}

const SQL_KEYWORDS_RE = /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|IN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|WITH|UNION|ALL|DISTINCT|INTO|VALUES|SET|TABLE|INDEX|VIEW|FUNCTION|PROCEDURE|TRIGGER|BEGIN|END|CASE|WHEN|THEN|ELSE|EXISTS|BETWEEN|LIKE|ILIKE|RETURNING|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|CONSTRAINT|UNIQUE|COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST)\b/g;

function highlightSql(sql: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  SQL_KEYWORDS_RE.lastIndex = 0;
  while ((match = SQL_KEYWORDS_RE.exec(sql)) !== null) {
    if (match.index > last) result.push(<span key={last} className="text-foreground/75">{sql.slice(last, match.index)}</span>);
    result.push(<span key={match.index} className="text-blue-400 font-semibold">{match[0]}</span>);
    last = match.index + match[0].length;
  }
  if (last < sql.length) result.push(<span key={last} className="text-foreground/75">{sql.slice(last)}</span>);
  return result;
}

export function SqlResultPanel({ tab, dataGrid }: Props) {
  const { entries, clear } = useQueryLogStore();
  const [resultTab, setResultTab] = useState<"data" | "message">("data");
  const [consoleHeight, setConsoleHeight] = useState(180);
  const consoleResizing = useRef(false);
  const consoleResizeStartY = useRef(0);
  const consoleResizeStartH = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab.loading) return;
    if (tab.error) setResultTab("message");
    else if (tab.result) setResultTab("data");
  }, [tab.loading, tab.error, tab.result]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden border-t">

      {/* Result content — flex-1 */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {resultTab === "data" ? (
          tab.loading && !tab.result ? (
            <div className="flex items-center justify-center text-muted-foreground text-sm h-full">
              Running query...
            </div>
          ) : dataGrid
        ) : (
          <div className="p-3 text-xs font-mono overflow-auto h-full">
            {tab.lastQueryMessage ? (
              <span className={tab.error ? "text-destructive" : "text-emerald-500"}>
                {tab.lastQueryMessage}
              </span>
            ) : (
              <span className="text-muted-foreground">No query run yet.</span>
            )}
            {tab.error && (
              <pre className="mt-2 text-destructive whitespace-pre-wrap">{tab.error}</pre>
            )}
          </div>
        )}
      </div>

      {/* Data/Message bar — between results and console */}
      <div className="flex items-center justify-between border-t border-b shrink-0 px-2" style={{ height: 34 }}>
        <div className="flex items-center h-full gap-1">
          {(["data", "message"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setResultTab(t)}
              className={`px-3 h-full text-xs font-medium border-b-2 transition-colors ${
                resultTab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "data" ? "Data" : "Message"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {tab.lastQueryMs !== null && (
            <span className="tabular-nums">{tab.lastQueryMs} ms</span>
          )}
          {tab.result && (
            <span className="tabular-nums">{tab.result.rows.length} rows</span>
          )}
          <div className="flex items-center gap-1">
            <button className="opacity-50 hover:opacity-100 transition-opacity" title="Pin">
              <Pin style={{ width: 13, height: 13 }} />
            </button>
            <button className="opacity-50 hover:opacity-100 transition-opacity" title="Search">
              <Search style={{ width: 13, height: 13 }} />
            </button>
            <button className="opacity-50 hover:opacity-100 transition-opacity" title="Export">
              <Download style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>
      </div>

      {/* Console resize handle */}
      <div
        style={{ height: 4, cursor: "ns-resize", flexShrink: 0, background: "transparent" }}
        className="hover:bg-blue-500/40 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          consoleResizing.current = true;
          consoleResizeStartY.current = e.clientY;
          consoleResizeStartH.current = consoleHeight;
          function onMove(ev: MouseEvent) {
            if (!consoleResizing.current) return;
            setConsoleHeight(Math.max(60, Math.min(500, consoleResizeStartH.current - (ev.clientY - consoleResizeStartY.current))));
          }
          function onUp() {
            consoleResizing.current = false;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          }
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />

      {/* Console logs */}
      <div
        ref={consoleRef}
        className="overflow-y-auto shrink-0 font-mono bg-muted/10"
        style={{ height: consoleHeight, fontSize: 11 }}
      >
        {entries.length === 0 ? (
          <div className="px-3 py-2 text-muted-foreground">No queries yet.</div>
        ) : (
          [...entries].reverse().map((entry) => (
            <div key={entry.id} className="px-3 py-1.5 border-b border-border/30">
              <div className="flex items-center gap-3 text-muted-foreground mb-0.5">
                <span>-- {entry.timestamp}</span>
                {entry.durationMs !== null && <span className="tabular-nums">{entry.durationMs} ms</span>}
                {entry.error && <span className="text-destructive">ERROR</span>}
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed">{highlightSql(entry.sql)}</pre>
            </div>
          ))
        )}
      </div>

      {/* Bottom bar — trash tout en bas */}
      <div className="border-t flex items-center justify-between px-3 shrink-0" style={{ height: 28 }}>
        <span className="text-xs font-medium text-muted-foreground">Console</span>
        <button
          onClick={clear}
          title="Clear logs"
          className="opacity-50 hover:opacity-100 transition-opacity"
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </div>

    </div>
  );
}
