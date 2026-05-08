import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { useQueryLogStore } from "../store/queryLog";

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

interface Props {
  height: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function QueryLogPanel({ height, onResizeStart }: Props) {
  const { entries, clear } = useQueryLogStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col shrink-0 border-t" style={{ height }}>
      {/* Resize handle */}
      <div
        style={{ height: 4, cursor: "ns-resize", flexShrink: 0 }}
        className="hover:bg-blue-500/40 transition-colors -mt-1"
        onMouseDown={onResizeStart}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 border-b shrink-0" style={{ height: 28 }}>
        <span className="text-xs font-medium text-muted-foreground">Console</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{entries.length} queries</span>
          <button onClick={clear} title="Clear logs" className="opacity-50 hover:opacity-100 transition-opacity">
            <Trash2 style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono bg-muted/10" style={{ fontSize: 11 }}>
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
    </div>
  );
}
