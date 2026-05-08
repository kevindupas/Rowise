import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { listDatabases } from "../lib/tauri-commands";
import { connectToDatabase } from "../lib/connect-to-database";
import { NewDatabaseModal } from "./NewDatabaseModal";
import type { Connection } from "../store/connections";

interface Props {
  activeConn: Connection;
  onClose: () => void;
}

function buildListConfig(conn: Connection, password: string, sshPassword?: string) {
  return {
    id: conn.id, name: conn.name, db_type: conn.type,
    host: conn.host, port: conn.port, database: conn.database,
    username: conn.username, password, color: conn.color,
    ssh_host: conn.ssh?.host, ssh_port: conn.ssh?.port,
    ssh_username: conn.ssh?.username, ssh_auth_method: conn.ssh?.authMethod,
    ssh_password: sshPassword, ssh_private_key_path: conn.ssh?.privateKeyPath,
    ssh_use_password_auth: conn.ssh?.usePasswordAuth,
    ssh_add_legacy_host_key: conn.ssh?.addLegacyHostKeyAlgos,
    ssh_add_legacy_kex: conn.ssh?.addLegacyKexAlgos,
    ssh_backend: conn.ssh?.backend,
  };
}

export function OpenDatabaseModal({ activeConn, onClose }: Props) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>(activeConn.database);
  const [connecting, setConnecting] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    loadDatabases();
  }, []);

  async function loadDatabases() {
    setLoading(true);
    setError(null);
    try {
      const { getPassword, getSshPassword } = await import("../lib/tauri-commands");
      const password = await getPassword(activeConn.id).catch(() => "");
      const sshPassword = activeConn.ssh?.authMethod === "password"
        ? await getSshPassword(activeConn.id).catch(() => "")
        : undefined;
      const config = buildListConfig(activeConn, password, sshPassword);
      const dbs = await listDatabases(config);
      setDatabases(dbs);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen() {
    if (!selected || selected === activeConn.database) { onClose(); return; }
    setConnecting(true);
    try {
      await connectToDatabase(activeConn, selected);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setConnecting(false);
    }
  }

  function handleCreated(dbName: string) {
    setShowNew(false);
    setDatabases((prev) => [...prev, dbName].sort());
    setSelected(dbName);
  }

  const filtered = databases.filter((db) =>
    db.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-background border rounded-lg shadow-xl w-[420px] mx-4 flex flex-col"
          style={{ maxHeight: "70vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 pt-4 pb-2">
            <h3 className="font-semibold text-sm text-center mb-3">Open database</h3>
            <div className="flex items-center gap-2 border rounded px-2 py-1 bg-muted/30 focus-within:ring-2 focus-within:ring-blue-500">
              <Search style={{ width: 13, height: 13, opacity: 0.5, flexShrink: 0 }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for database..."
                className="flex-1 text-sm bg-transparent outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
            {loading && (
              <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
            )}
            {error && (
              <p className="text-xs text-destructive px-2 py-2">{error}</p>
            )}
            {!loading && !error && filtered.map((db) => (
              <button
                key={db}
                onClick={() => setSelected(db)}
                onDoubleClick={handleOpen}
                className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center gap-2 transition-colors ${
                  selected === db
                    ? "bg-blue-600 text-white"
                    : "hover:bg-muted"
                }`}
              >
                <span style={{ fontSize: 16 }}>🗄</span>
                {db}
              </button>
            ))}
          </div>

          <div className="px-4 py-3 border-t flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <div className="flex gap-2">
              {activeConn.type !== "sqlite" && (
                <button
                  onClick={() => setShowNew(true)}
                  className="px-4 py-1.5 text-sm rounded border hover:bg-muted transition-colors"
                >
                  New…
                </button>
              )}
              <button
                onClick={handleOpen}
                disabled={connecting || !selected}
                className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {connecting ? "Opening…" : "Open"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNew && (
        <NewDatabaseModal
          connectionId={activeConn.id}
          dbType={activeConn.type}
          onCreated={handleCreated}
          onClose={() => setShowNew(false)}
        />
      )}
    </>
  );
}
