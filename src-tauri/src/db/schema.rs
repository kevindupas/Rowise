use serde::{Deserialize, Serialize};
use crate::db::types::{ColumnInfo, IndexInfo, TableSchema};

#[derive(Debug, Serialize, Deserialize)]
pub struct TableStats {
    pub row_count: Option<i64>,
    pub total_size: Option<String>,
    pub data_size: Option<String>,
    pub index_size: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
}

pub async fn get_tables_pg(pool: &sqlx::PgPool) -> Result<Vec<TableInfo>, String> {
    let rows: Vec<TableInfo> = sqlx::query_as(
        "SELECT table_schema as schema, table_name as name
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         AND table_type = 'BASE TABLE'
         ORDER BY table_schema, table_name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub async fn get_tables_sqlite(pool: &sqlx::SqlitePool) -> Result<Vec<TableInfo>, String> {
    let rows: Vec<TableInfo> = sqlx::query_as(
        "SELECT 'main' as schema, name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub async fn get_tables_mysql(pool: &sqlx::MySqlPool) -> Result<Vec<TableInfo>, String> {
    let rows: Vec<TableInfo> = sqlx::query_as(
        "SELECT table_schema as schema, table_name as name
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
         ORDER BY table_name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub async fn get_table_schema_pg(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<TableSchema, String> {
    use sqlx::Row;

    let rows = sqlx::query(
        r#"
SELECT
  c.column_name,
  c.udt_name AS type_name,
  (c.is_nullable = 'YES') AS is_nullable,
  c.column_default,
  EXISTS (
    SELECT 1 FROM information_schema.key_column_usage kcu2
    JOIN information_schema.table_constraints tc2
      ON tc2.constraint_name = kcu2.constraint_name
      AND tc2.table_schema = kcu2.table_schema
    WHERE tc2.constraint_type = 'PRIMARY KEY'
      AND kcu2.table_schema = c.table_schema
      AND kcu2.table_name = c.table_name
      AND kcu2.column_name = c.column_name
  ) AS is_primary_key,
  ccu.table_schema AS fk_schema,
  ccu.table_name   AS fk_table,
  ccu.column_name  AS fk_column
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
  ON kcu.table_schema = c.table_schema
  AND kcu.table_name = c.table_name
  AND kcu.column_name = c.column_name
LEFT JOIN information_schema.table_constraints tc
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
  AND tc.constraint_type = 'FOREIGN KEY'
LEFT JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = rc.unique_constraint_name
  AND ccu.constraint_schema = rc.unique_constraint_schema
WHERE c.table_schema = $1 AND c.table_name = $2
ORDER BY c.ordinal_position
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let columns: Vec<ColumnInfo> = rows
        .iter()
        .map(|row| {
            let type_name: String = row.get("type_name");
            let fk_table: Option<String> = row.try_get("fk_table").ok().flatten();
            let fk_col: Option<String> = row.try_get("fk_column").ok().flatten();
            let fk_schema: Option<String> = row.try_get("fk_schema").ok().flatten();
            let is_fk = fk_table.is_some();
            let is_geo = matches!(
                type_name.as_str(),
                "geometry" | "geography" | "point" | "linestring" | "polygon"
            );
            ColumnInfo {
                name: row.get("column_name"),
                type_name,
                is_geo,
                is_primary_key: row.get("is_primary_key"),
                is_nullable: row.get("is_nullable"),
                column_default: row.try_get("column_default").ok().flatten(),
                is_foreign_key: is_fk,
                fk_table,
                fk_column: fk_col,
                fk_schema,
            }
        })
        .collect();

    // Indexes
    let idx_rows = sqlx::query(
        r#"
SELECT
  i.relname AS index_name,
  ix.indisunique AS is_unique,
  ix.indisprimary AS is_primary,
  am.amname AS index_type,
  array_agg(a.attname ORDER BY k.n) AS columns
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_am am ON am.oid = i.relam
JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, n) ON true
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
WHERE n.nspname = $1 AND t.relname = $2
GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
ORDER BY i.relname
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let indexes: Vec<IndexInfo> = idx_rows
        .iter()
        .map(|row| {
            let cols: Vec<String> = row.get("columns");
            IndexInfo {
                name: row.get("index_name"),
                is_unique: row.get("is_unique"),
                is_primary: row.get("is_primary"),
                columns: cols,
                index_type: row.get("index_type"),
            }
        })
        .collect();

    Ok(TableSchema { columns, indexes })
}

pub async fn get_table_schema_sqlite(
    pool: &sqlx::SqlitePool,
    table: &str,
) -> Result<TableSchema, String> {
    use sqlx::Row;

    // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
    let col_rows = sqlx::query(&format!("PRAGMA table_info(\"{}\")", table))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // PRAGMA foreign_key_list returns: id, seq, table, from, to, on_update, on_delete, match
    let fk_rows = sqlx::query(&format!("PRAGMA foreign_key_list(\"{}\")", table))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Build FK map: from_col -> (to_table, to_col)
    let mut fk_map: std::collections::HashMap<String, (String, String)> =
        std::collections::HashMap::new();
    for fk in &fk_rows {
        let from: String = fk.get("from");
        let to_table: String = fk.get("table");
        let to_col: String = fk.get("to");
        fk_map.insert(from, (to_table, to_col));
    }

    let columns: Vec<ColumnInfo> = col_rows
        .iter()
        .map(|row| {
            let name: String = row.get("name");
            let type_name: String = row.get("type");
            let pk: i32 = row.get("pk");
            let notnull: i32 = row.get("notnull");
            let dflt: Option<String> = row.try_get("dflt_value").ok().flatten();
            let (fk_table, fk_col, fk_schema) = if let Some((t, c)) = fk_map.get(&name) {
                (Some(t.clone()), Some(c.clone()), Some("main".to_string()))
            } else {
                (None, None, None)
            };
            let is_fk = fk_table.is_some();
            let is_geo = matches!(
                type_name.to_lowercase().as_str(),
                "geometry" | "geography" | "point" | "linestring" | "polygon"
            );
            ColumnInfo {
                name,
                type_name,
                is_geo,
                is_primary_key: pk > 0,
                is_nullable: notnull == 0,
                column_default: dflt,
                is_foreign_key: is_fk,
                fk_table,
                fk_column: fk_col,
                fk_schema,
            }
        })
        .collect();

    // PRAGMA index_list + index_info for indexes
    let idx_list = sqlx::query(&format!("PRAGMA index_list(\"{}\")", table))
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut indexes: Vec<IndexInfo> = Vec::new();
    for idx in &idx_list {
        let idx_name: String = idx.get("name");
        let unique: i32 = idx.get("unique");
        let origin: String = idx.get("origin");
        let is_primary = origin == "pk";

        let info_rows =
            sqlx::query(&format!("PRAGMA index_info(\"{}\")", idx_name))
                .fetch_all(pool)
                .await
                .map_err(|e| e.to_string())?;

        let cols: Vec<String> = info_rows.iter().map(|r| r.get("name")).collect();
        indexes.push(IndexInfo {
            name: idx_name,
            is_unique: unique != 0,
            is_primary,
            columns: cols,
            index_type: "BTREE".to_string(),
        });
    }

    Ok(TableSchema { columns, indexes })
}

pub async fn get_table_schema_mysql(
    pool: &sqlx::MySqlPool,
    schema: &str,
    table: &str,
) -> Result<TableSchema, String> {
    use sqlx::Row;

    let col_rows = sqlx::query(
        r#"
SELECT
  c.COLUMN_NAME AS column_name,
  c.DATA_TYPE AS type_name,
  (c.IS_NULLABLE = 'YES') AS is_nullable,
  c.COLUMN_DEFAULT AS column_default,
  (c.COLUMN_KEY = 'PRI') AS is_primary_key,
  kcu.REFERENCED_TABLE_SCHEMA AS fk_schema,
  kcu.REFERENCED_TABLE_NAME AS fk_table,
  kcu.REFERENCED_COLUMN_NAME AS fk_column
FROM information_schema.COLUMNS c
LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
  ON kcu.TABLE_SCHEMA = c.TABLE_SCHEMA
  AND kcu.TABLE_NAME = c.TABLE_NAME
  AND kcu.COLUMN_NAME = c.COLUMN_NAME
  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ?
ORDER BY c.ORDINAL_POSITION
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let columns: Vec<ColumnInfo> = col_rows
        .iter()
        .map(|row| {
            let type_name: String = row.get("type_name");
            let fk_table: Option<String> = row.try_get("fk_table").ok().flatten();
            let fk_col: Option<String> = row.try_get("fk_column").ok().flatten();
            let fk_schema: Option<String> = row.try_get("fk_schema").ok().flatten();
            let is_fk = fk_table.is_some();
            let is_geo = matches!(
                type_name.as_str(),
                "geometry" | "point" | "linestring" | "polygon" | "multipolygon"
            );
            // MySQL returns TINYINT(1) for bool columns; is_nullable/is_primary_key come as i8
            let is_nullable: i8 = row.try_get("is_nullable").unwrap_or(1);
            let is_primary_key: i8 = row.try_get("is_primary_key").unwrap_or(0);
            ColumnInfo {
                name: row.get("column_name"),
                type_name,
                is_geo,
                is_primary_key: is_primary_key != 0,
                is_nullable: is_nullable != 0,
                column_default: row.try_get("column_default").ok().flatten(),
                is_foreign_key: is_fk,
                fk_table,
                fk_column: fk_col,
                fk_schema,
            }
        })
        .collect();

    // Indexes
    let idx_rows = sqlx::query(
        r#"
SELECT
  s.INDEX_NAME AS index_name,
  (s.NON_UNIQUE = 0) AS is_unique,
  (s.INDEX_NAME = 'PRIMARY') AS is_primary,
  s.INDEX_TYPE AS index_type,
  GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX SEPARATOR ',') AS columns
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = ? AND s.TABLE_NAME = ?
GROUP BY s.INDEX_NAME, s.NON_UNIQUE, s.INDEX_TYPE
ORDER BY s.INDEX_NAME
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let indexes: Vec<IndexInfo> = idx_rows
        .iter()
        .map(|row| {
            let cols_str: String = row.get("columns");
            let is_unique: i8 = row.try_get("is_unique").unwrap_or(0);
            let is_primary: i8 = row.try_get("is_primary").unwrap_or(0);
            IndexInfo {
                name: row.get("index_name"),
                is_unique: is_unique != 0,
                is_primary: is_primary != 0,
                columns: cols_str.split(',').map(str::to_string).collect(),
                index_type: row.get("index_type"),
            }
        })
        .collect();

    Ok(TableSchema { columns, indexes })
}

pub async fn get_table_stats_pg(pool: &sqlx::PgPool, schema: &str, table: &str) -> Result<TableStats, String> {
    use sqlx::Row;
    let row = sqlx::query(r#"
        SELECT
            c.reltuples::bigint AS row_count,
            pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
            pg_size_pretty(pg_relation_size(c.oid)) AS data_size,
            pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
            obj_description(c.oid, 'pg_class') AS comment
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
    "#)
    .bind(schema)
    .bind(table)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(TableStats {
        row_count: row.try_get("row_count").ok(),
        total_size: row.try_get("total_size").ok(),
        data_size: row.try_get("data_size").ok(),
        index_size: row.try_get("index_size").ok(),
        comment: row.try_get("comment").ok().flatten(),
    })
}

pub async fn get_table_stats_sqlite(pool: &sqlx::SqlitePool, table: &str) -> Result<TableStats, String> {
    use sqlx::Row;
    let count_row = sqlx::query(&format!("SELECT COUNT(*) as cnt FROM \"{}\"", table))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let row_count: i64 = count_row.get("cnt");

    Ok(TableStats {
        row_count: Some(row_count),
        total_size: None,
        data_size: None,
        index_size: None,
        comment: None,
    })
}

pub async fn get_table_stats_mysql(pool: &sqlx::MySqlPool, schema: &str, table: &str) -> Result<TableStats, String> {
    use sqlx::Row;
    let row = sqlx::query(r#"
        SELECT
            TABLE_ROWS as row_count,
            ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as total_mb,
            ROUND(DATA_LENGTH / 1024 / 1024, 2) as data_mb,
            ROUND(INDEX_LENGTH / 1024 / 1024, 2) as index_mb,
            TABLE_COMMENT as comment
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    "#)
    .bind(schema)
    .bind(table)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let total_mb: Option<f64> = row.try_get("total_mb").ok().flatten();
    let data_mb: Option<f64> = row.try_get("data_mb").ok().flatten();
    let index_mb: Option<f64> = row.try_get("index_mb").ok().flatten();
    let comment: Option<String> = row.try_get("comment").ok().flatten();

    fn fmt_mb(v: f64) -> String {
        if v < 1.0 { format!("{} KB", (v * 1024.0).round() as i64) }
        else { format!("{} MB", v) }
    }

    Ok(TableStats {
        row_count: row.try_get("row_count").ok(),
        total_size: total_mb.map(fmt_mb),
        data_size: data_mb.map(fmt_mb),
        index_size: index_mb.map(fmt_mb),
        comment: comment.filter(|s| !s.is_empty()),
    })
}
