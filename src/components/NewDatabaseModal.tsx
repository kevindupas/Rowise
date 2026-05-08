import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  connectionId: string;
  dbType: "postgresql" | "mysql" | "sqlite";
  onCreated: (dbName: string) => void;
  onClose: () => void;
}

const PG_ENCODINGS = ["Default", "UTF8", "LATIN1", "SQL_ASCII", "WIN1252"];
const PG_COLLATIONS = ["Default", "C", "POSIX", "en_US.UTF-8", "fr_FR.UTF-8"];
const MYSQL_CHARSETS = ["Default", "utf8mb4", "utf8", "latin1", "ascii"];
const MYSQL_COLLATIONS: Record<string, string[]> = {
  utf8mb4: ["Default", "utf8mb4_unicode_ci", "utf8mb4_general_ci", "utf8mb4_bin"],
  utf8: ["Default", "utf8_unicode_ci", "utf8_general_ci"],
  latin1: ["Default", "latin1_swedish_ci", "latin1_bin"],
  ascii: ["Default", "ascii_general_ci", "ascii_bin"],
  Default: ["Default"],
};

export function NewDatabaseModal({ connectionId, dbType, onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [encoding, setEncoding] = useState("Default");
  const [collation, setCollation] = useState("Default");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const encodings = dbType === "mysql" ? MYSQL_CHARSETS : PG_ENCODINGS;
  const collations = dbType === "mysql"
    ? (MYSQL_COLLATIONS[encoding] ?? ["Default"])
    : PG_COLLATIONS;

  async function handleCreate() {
    const dbName = name.trim();
    if (!dbName) { setError("Name is required"); return; }
    setError(null);
    setLoading(true);
    try {
      let sql = `CREATE DATABASE "${dbName}"`;
      if (dbType === "postgresql") {
        if (encoding !== "Default") sql += ` ENCODING '${encoding}'`;
        if (collation !== "Default") sql += ` LC_COLLATE '${collation}' LC_CTYPE '${collation}'`;
      } else if (dbType === "mysql") {
        if (encoding !== "Default") sql += ` CHARACTER SET ${encoding}`;
        if (collation !== "Default") sql += ` COLLATE ${collation}`;
      }
      await invoke("execute_query", {
        connectionId,
        sql,
        limit: 1,
        offset: 0,
      });
      onCreated(dbName);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border rounded-lg shadow-xl w-[400px] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-sm text-center">New Database</h3>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm w-20 text-right shrink-0">Name:</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="flex-1 px-2 py-1 text-sm border rounded bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {dbType !== "sqlite" && (
            <>
              <div className="flex items-center gap-3">
                <label className="text-sm w-20 text-right shrink-0">
                  {dbType === "mysql" ? "Charset:" : "Encoding:"}
                </label>
                <select
                  value={encoding}
                  onChange={(e) => { setEncoding(e.target.value); setCollation("Default"); }}
                  className="flex-1 px-2 py-1 text-sm border rounded bg-background focus:outline-none"
                >
                  {encodings.map((e) => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm w-20 text-right shrink-0">Collation:</label>
                <select
                  value={collation}
                  onChange={(e) => setCollation(e.target.value)}
                  className="flex-1 px-2 py-1 text-sm border rounded bg-background focus:outline-none"
                >
                  {collations.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="px-6 py-3 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating…" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
