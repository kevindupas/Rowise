import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { QueryResult, CellValue } from "../components/DataGrid";

function cellToString(cell: CellValue): string {
  if (cell.type === "Null") return "";
  if (cell.type === "Geo") return JSON.stringify(cell.value.geojson);
  return String(cell.value);
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function exportCsv(result: QueryResult, defaultName = "export") {
  const path = await save({
    defaultPath: `${defaultName}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return;

  const header = result.columns.map((c) => escapeCsv(c.name)).join(",");
  const rows = result.rows.map((row) =>
    row.map((cell) => escapeCsv(cellToString(cell))).join(",")
  );
  await writeTextFile(path, [header, ...rows].join("\n"));
}

export async function exportGeoJson(result: QueryResult, geoColIndex: number, defaultName = "export") {
  const path = await save({
    defaultPath: `${defaultName}.geojson`,
    filters: [{ name: "GeoJSON", extensions: ["geojson", "json"] }],
  });
  if (!path) return;

  const features = result.rows
    .map((row) => {
      const geoCell = row[geoColIndex];
      if (!geoCell || geoCell.type !== "Geo") return null;
      const properties: Record<string, unknown> = {};
      result.columns.forEach((col, i) => {
        if (i !== geoColIndex) properties[col.name] = cellToString(row[i]);
      });
      return {
        type: "Feature" as const,
        geometry: geoCell.value.geojson,
        properties,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const geojson = { type: "FeatureCollection", features };
  await writeTextFile(path, JSON.stringify(geojson, null, 2));
}
