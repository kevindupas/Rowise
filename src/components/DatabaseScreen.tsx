import { PanelRight, PanelLeft, PanelBottom, Moon, Sun, Monitor, RefreshCw, BarChart2, Search, MoreVertical, Unplug, X, Eye, List, Lock, Database } from "lucide-react";
import { useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { SchemaTree } from "./SchemaTree";
import { MainPanel } from "./MainPanel";
import { DetailPanel } from "./DetailPanel";
import { useConnectionStore } from "../store/connections";
import { useTabStore } from "../store/tabs";

export function DatabaseScreen() {
  const { connections, activeConnectionId, setConnected, tags } =
    useConnectionStore();
  const { tabs, activeTabId, showDetailPanel, toggleDetailPanel, openTab, openSqlTab, runTabQuery, clearPendingChanges } = useTabStore();
  const [showDiscardModal, setShowDiscardModal] = useState(false);
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

  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const [detailWidth, setDetailWidth] = useState(288);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(200);
  const consoleResizing = useRef(false);
  const consoleResizeStartY = useRef(0);
  const consoleResizeStartH = useRef(0);
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
      <div
        data-tauri-drag-region
        className="flex items-center shrink-0 select-none"
        style={{ height: 40, backgroundColor: "hsl(var(--background))", padding: "0 12px", gap: 15 }}
      >
        {/* Left icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0, color: "var(--foreground)", opacity: 0.7 }}>
          {[
            { icon: <Unplug style={{ width: 14, height: 14 }} />, onClick: handleDisconnect, title: "Disconnect" },
            { icon: <X style={{ width: 14, height: 14 }} />, onClick: undefined, title: "Close tab" },
            { icon: <Eye style={{ width: 14, height: 14 }} />, onClick: undefined, title: "Toggle visibility" },
            { icon: <List style={{ width: 14, height: 14 }} />, onClick: undefined, title: "Sort" },
            { icon: <Lock style={{ width: 14, height: 14 }} />, onClick: undefined, title: "Lock" },
            { icon: <Database style={{ width: 14, height: 14 }} />, onClick: undefined, title: "Database" },
          ].map((btn, i) => (
            <button key={i} onClick={btn.onClick} title={btn.title} style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}>
              {btn.icon}
            </button>
          ))}
        </div>

        {/* SQL badge */}
        {activeConnectionId && (
          <button
            onClick={() => openSqlTab(activeConnectionId)}
            title="Toggle SQL editor"
            aria-pressed={activeTab?.sqlMode ?? false}
            style={{
              height: 18,
              padding: "0 6px",
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.5px",
              flexShrink: 0,
              backgroundColor: activeTab?.sqlMode ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.18)",
              color: activeTab?.sqlMode ? "#000" : "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            SQL
          </button>
        )}

        {/* Green info pill */}
        {activeConn && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: 26,
              borderRadius: 13,
              backgroundColor: activeConn.color ?? "#087a3d",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 15px",
              fontSize: 13,
              fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace",
              color: "white",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* Progress shimmer */}
            {activeTab?.loading && (
              <div style={{
                position: "absolute",
                inset: 0,
                borderRadius: 13,
                overflow: "hidden",
                pointerEvents: "none",
              }}>
                <div style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  width: "25%",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
                  animation: "progress-indeterminate 1.2s ease-in-out infinite",
                }} />
              </div>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", position: "relative" }}>
              {activeTag && `${activeTag.name.toUpperCase()} | `}
              {activeConn.type === "postgresql" ? "PostgreSQL" : activeConn.type === "mysql" ? "MySQL" : "SQLite"}
              {activeConn.serverVersion ? ` ${activeConn.serverVersion}` : ""}
              {activeConn.tlsVersion ? ` : ${activeConn.tlsVersion}` : ""}
              {activeConn.ssh ? " : SSH" : ""}
              {` : ${activeConn.name}`}
              {` : ${activeConn.database}`}
              {activeTab ? ` : ${activeTab.schema}.${activeTab.table}` : ""}
            </span>
            {activeTabStats?.total_size && (
              <span style={{ fontSize: 12, opacity: 0.9, flexShrink: 0, marginLeft: 12, fontVariantNumeric: "tabular-nums", position: "relative" }}>
                {activeTabStats.total_size}
              </span>
            )}
          </div>
        )}

        {/* Right icons */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 4 }}>
          {[
            { icon: <BarChart2 style={{ width: 14, height: 14 }} />, onClick: undefined, title: "Stats" },
            ...(activeTab ? [{ icon: <RefreshCw style={{ width: 14, height: 14, animation: activeTab.loading ? "spin 0.8s linear infinite" : "none" }} />, onClick: () => {
              if (activeTab.pendingChanges.length > 0) setShowDiscardModal(true);
              else runTabQuery(activeTab.id);
            }, title: "Refresh (⌘R)" }] : []),
            { icon: <Search style={{ width: 14, height: 14 }} />, onClick: undefined, title: "Search" },
            { icon: <MoreVertical style={{ width: 14, height: 14 }} />, onClick: undefined, title: "More" },
          ].map((btn, i) => (
            <button
              key={i}
              onClick={btn.onClick}
              title={btn.title}
              style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "none", border: "none", cursor: "pointer", opacity: 0.7, color: "var(--foreground)" }}
              className="hover:bg-black/10 dark:hover:bg-white/10 hover:opacity-100 transition-all"
            >
              {btn.icon}
            </button>
          ))}

          <span style={{ width: 1, height: 14, backgroundColor: "currentColor", opacity: 0.2, margin: "0 2px" }} />

          <button
            onClick={() => setShowSidebar((v) => !v)}
            title="Toggle sidebar"
            style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "none", border: "none", cursor: "pointer", opacity: showSidebar ? 1 : 0.4, color: "var(--foreground)" }}
            className="hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <PanelLeft style={{ width: 14, height: 14 }} />
          </button>

          <button
            onClick={() => setShowConsole((v) => !v)}
            title="Toggle console"
            style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "none", border: "none", cursor: "pointer", opacity: showConsole ? 1 : 0.4, color: "var(--foreground)" }}
            className="hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <PanelBottom style={{ width: 14, height: 14 }} />
          </button>

          <button
            onClick={toggleDetailPanel}
            title="Toggle detail panel"
            style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "none", border: "none", cursor: "pointer", opacity: showDetailPanel ? 1 : 0.4, color: "var(--foreground)" }}
            className="hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <PanelRight style={{ width: 14, height: 14 }} />
          </button>

          <button
            onClick={cycleTheme}
            title={`Theme: ${selectedTheme}`}
            style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, background: "none", border: "none", cursor: "pointer", opacity: 0.7, color: "var(--foreground)" }}
            className="hover:bg-black/10 dark:hover:bg-white/10 hover:opacity-100 transition-all"
          >
            {selectedTheme === "dark" ? <Moon style={{ width: 14, height: 14 }} />
              : selectedTheme === "light" ? <Sun style={{ width: 14, height: 14 }} />
              : <Monitor style={{ width: 14, height: 14 }} />}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <div className="border-r shrink-0 flex flex-col overflow-hidden relative" style={{ width: sidebarWidth }}>
            {activeConnectionId && (
              <SchemaTree
                connectionId={activeConnectionId}
                onTableSelect={handleTableSelect}
                activeTable={activeTable}
              />
            )}
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/40 z-10"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startW = sidebarWidth;
                function onMove(e: MouseEvent) {
                  setSidebarWidth(Math.max(160, Math.min(480, startW + e.clientX - startX)));
                }
                function onUp() {
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                }
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            />
          </div>
        )}

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MainPanel
            showConsole={showConsole}
            consoleHeight={consoleHeight}
            onConsoleResizeStart={(e) => {
              e.preventDefault();
              consoleResizing.current = true;
              consoleResizeStartY.current = e.clientY;
              consoleResizeStartH.current = consoleHeight;
              function onMove(ev: MouseEvent) {
                if (!consoleResizing.current) return;
                setConsoleHeight(Math.max(80, Math.min(600, consoleResizeStartH.current - (ev.clientY - consoleResizeStartY.current))));
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
        </div>

        {/* Detail panel */}
        {showDetailPanel && activeTab && (
          <div className="border-l shrink-0 flex flex-col relative overflow-hidden" style={{ width: detailWidth }}>
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/40 z-10"
              onMouseDown={onMouseDown}
            />
            <DetailPanel />
          </div>
        )}
      </div>

      {showDiscardModal && activeTab && (
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
                onClick={() => {
                  clearPendingChanges(activeTab.id);
                  setShowDiscardModal(false);
                  runTabQuery(activeTab.id);
                }}
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
