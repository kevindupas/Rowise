import { ArrowLeft, Code, PanelRight, Moon, Sun, Monitor, RefreshCw } from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { Button } from "./ui/button";
import { SchemaTree } from "./SchemaTree";
import { MainPanel } from "./MainPanel";
import { DetailPanel } from "./DetailPanel";
import { useConnectionStore } from "../store/connections";
import { useTabStore } from "../store/tabs";

function Separator() {
  return <span className="mx-1.5 text-muted-foreground/40 select-none">·</span>;
}

export function DatabaseScreen() {
  const { connections, activeConnectionId, setConnected, tags } =
    useConnectionStore();
  const { tabs, activeTabId, showDetailPanel, toggleDetailPanel, toggleSqlMode, openTab, runTabQuery } = useTabStore();
  const { theme, setTheme } = useTheme();

  const activeConn = connections.find((c) => c.id === activeConnectionId) ?? null;
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeTable = activeTab ? { schema: activeTab.schema, name: activeTab.table } : null;
  const activeTag = activeConn?.tagId ? tags.find(t => t.id === activeConn.tagId) ?? null : null;
  const activeTabStats = activeTab?.tableStats;

  function handleTableSelect(schema: string, name: string) {
    if (!activeConnectionId) return;
    openTab(activeConnectionId, schema, name);
  }

  const [detailWidth, setDetailWidth] = useState(288);
  const [resizing, setResizing] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = detailWidth;
    setResizing(true);

    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = startX.current - e.clientX;
      setDetailWidth(Math.max(200, Math.min(600, startWidth.current + delta)));
    }
    function onUp() {
      dragging.current = false;
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [detailWidth]);

  function handleDisconnect() {
    if (!activeConnectionId) return;
    setConnected(activeConnectionId, false);
  }

  function cycleTheme() {
    const resolved = theme ?? "system";
    if (resolved === "light") setTheme("dark");
    else if (resolved === "dark") setTheme("system");
    else setTheme("light");
  }

  const selectedTheme = theme ?? "system";

  return (
    <div className={`flex flex-col h-screen bg-background text-foreground overflow-hidden ${resizing ? "select-none cursor-ew-resize" : ""}`}>
      {/* Toolbar */}
      <div className="h-9 border-b flex items-center px-2 shrink-0 bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 mr-1"
          onClick={handleDisconnect}
          title="Back to connections"
          aria-label="Back to connections"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {activeConn && (
          <div className="flex items-center min-w-0 flex-1 overflow-hidden text-xs text-muted-foreground">
            {activeTag && (
              <>
                <span
                  className="font-semibold uppercase tracking-wide shrink-0"
                  style={{ color: activeTag.color }}
                >
                  {activeTag.name}
                </span>
                <Separator />
              </>
            )}

            <span className="shrink-0 text-foreground/80">
              {activeConn.type === "postgresql" ? "PostgreSQL" : activeConn.type === "mysql" ? "MySQL" : "SQLite"}
              {activeConn.serverVersion ? ` ${activeConn.serverVersion}` : ""}
            </span>

            {activeConn.tlsVersion && (
              <>
                <Separator />
                <span className="shrink-0">{activeConn.tlsVersion}</span>
              </>
            )}

            {activeConn.ssh && (
              <>
                <Separator />
                <span className="shrink-0 font-medium">SSH</span>
              </>
            )}

            <Separator />
            <span className="shrink-0 text-foreground font-medium truncate max-w-30">
              {activeConn.name}
            </span>

            <Separator />
            <span className="shrink-0 truncate max-w-30">{activeConn.database}</span>

            {activeTab && (
              <>
                <Separator />
                <span className="shrink-0 truncate max-w-40">
                  {activeTab.schema}.{activeTab.table}
                </span>
              </>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {activeTabStats?.total_size && (
            <span className="text-xs text-muted-foreground px-1 tabular-nums">
              {activeTabStats.total_size}
            </span>
          )}

          {activeTab && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => runTabQuery(activeTab.id)}
                title="Refresh (⌘R)"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${activeTab.sqlMode ? "text-foreground" : "text-muted-foreground"}`}
                onClick={() => toggleSqlMode(activeTab.id)}
                title="Toggle SQL editor"
                aria-pressed={activeTab.sqlMode}
              >
                <Code className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${showDetailPanel ? "text-foreground" : "text-muted-foreground"}`}
            onClick={toggleDetailPanel}
            title="Toggle detail panel"
            aria-pressed={showDetailPanel}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={cycleTheme}
            title={`Theme: ${selectedTheme}`}
          >
            {selectedTheme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : selectedTheme === "light" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r shrink-0 flex flex-col overflow-hidden">
          {activeConnectionId && (
            <SchemaTree
              connectionId={activeConnectionId}
              onTableSelect={handleTableSelect}
              activeTable={activeTable}
            />
          )}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MainPanel />
        </div>

        {/* Detail panel */}
        {showDetailPanel && activeTab && (
          <div className="border-l shrink-0 flex flex-col relative" style={{ width: detailWidth }}>
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/40 z-10"
              onMouseDown={onMouseDown}
            />
            <DetailPanel />
          </div>
        )}
      </div>
    </div>
  );
}
