use std::collections::{HashMap, HashSet};

use serde_json::Value;
use tokio_postgres::Client;

use crate::db::error::AppResult;

/// The full database schema, captured offline as `db.json` at the repo root and
/// baked into the binary by `build.rs`. It is authoritative (includes every
/// table, primary key, and foreign key) and always available, even before a DB
/// query runs. `db.json` is private/gitignored, so when it's absent at build
/// time (e.g. CI) this is an empty string and the app falls back to live
/// introspection (see `build`).
const DB_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/db_schema.json"));

/// Build the model-facing schema text. Prefer the bundled `db.json` (complete,
/// with relationships); fall back to live introspection if it can't be parsed.
pub async fn build(client: &Client) -> AppResult<String> {
    match bundled() {
        Ok(s) if !s.is_empty() => Ok(s),
        _ => introspect(client).await,
    }
}

/// Parse the bundled `db.json` into a compact, model-friendly block:
///   table_name(col type [pk], col type -> other_table.col, ...)
/// One line per table/view. `[pk]` marks primary keys; `-> table.col` marks
/// foreign keys, so the model knows exactly how to join.
pub fn bundled() -> AppResult<String> {
    // Absent at build time (db.json is private/gitignored) → no bundled schema.
    if DB_JSON.trim().is_empty() {
        return Ok(String::new());
    }
    let root: Value = serde_json::from_str(DB_JSON)?;
    // db.json is `[{ "database_schema": "<json-encoded array of tables>" }]`.
    let raw = root
        .get(0)
        .and_then(|o| o.get("database_schema"))
        .and_then(Value::as_str)
        .unwrap_or("[]");
    let tables: Value = serde_json::from_str(raw)?;
    let Some(tables) = tables.as_array() else {
        return Ok(String::new());
    };

    let mut out = String::new();
    for t in tables {
        let name = t.get("name").and_then(Value::as_str).unwrap_or("");
        if name.is_empty() {
            continue;
        }

        // Primary-key column set.
        let pk: HashSet<&str> = t
            .get("primary_key")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();

        // column -> "table.col" for each foreign key.
        let mut fk: HashMap<&str, String> = HashMap::new();
        if let Some(fks) = t.get("foreign_keys").and_then(Value::as_array) {
            for f in fks {
                let cols = f.get("columns").and_then(Value::as_array);
                let rt = f.get("references_table").and_then(Value::as_str);
                let rcs = f.get("references_columns").and_then(Value::as_array);
                if let (Some(cols), Some(rt), Some(rcs)) = (cols, rt, rcs) {
                    for (c, rc) in cols.iter().zip(rcs.iter()) {
                        if let (Some(c), Some(rc)) = (c.as_str(), rc.as_str()) {
                            fk.insert(c, format!("{rt}.{rc}"));
                        }
                    }
                }
            }
        }

        out.push_str(name);
        out.push('(');
        let mut first = true;
        if let Some(cols) = t.get("columns").and_then(Value::as_array) {
            for c in cols {
                let cname = c.get("name").and_then(Value::as_str).unwrap_or("");
                if cname.is_empty() {
                    continue;
                }
                // Drop the "(255)" / "(8,2)" precision noise — type family is enough.
                let ctype = c
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .split('(')
                    .next()
                    .unwrap_or("")
                    .trim();
                if !first {
                    out.push_str(", ");
                }
                out.push_str(cname);
                out.push(' ');
                out.push_str(ctype);
                if pk.contains(cname) {
                    out.push_str(" [pk]");
                }
                if let Some(reference) = fk.get(cname) {
                    out.push_str(" -> ");
                    out.push_str(reference);
                }
                first = false;
            }
        }
        out.push_str(")\n");
    }
    Ok(out)
}

/// Live fallback: introspect the public schema with primary/foreign keys.
/// Used only if the bundled `db.json` can't be parsed.
pub async fn introspect(client: &Client) -> AppResult<String> {
    let cols = client
        .query(
            "SELECT table_name, column_name, data_type
             FROM information_schema.columns
             WHERE table_schema = 'public'
             ORDER BY table_name, ordinal_position",
            &[],
        )
        .await?;

    let pks = primary_keys(client).await?;
    let fks = foreign_keys(client).await?;

    let mut out = String::new();
    let mut current = String::new();
    let mut first_col = true;

    for row in &cols {
        let table: String = row.get("table_name");
        let col: String = row.get("column_name");
        let dtype: String = row.get("data_type");

        if table != current {
            if !current.is_empty() {
                out.push_str(")\n");
            }
            out.push_str(&table);
            out.push('(');
            current = table.clone();
            first_col = true;
        }
        if !first_col {
            out.push_str(", ");
        }
        out.push_str(&col);
        out.push(' ');
        out.push_str(&dtype);
        if pks.get(&table).map(|s| s.contains(&col)).unwrap_or(false) {
            out.push_str(" [pk]");
        }
        if let Some((ft, fc)) = fks.get(&(table.clone(), col.clone())) {
            out.push_str(" -> ");
            out.push_str(ft);
            out.push('.');
            out.push_str(fc);
        }
        first_col = false;
    }
    if !current.is_empty() {
        out.push_str(")\n");
    }
    Ok(out)
}

/// table_name -> set of primary-key column names.
async fn primary_keys(client: &Client) -> AppResult<HashMap<String, HashSet<String>>> {
    let rows = client
        .query(
            "SELECT tc.table_name, kcu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = 'public'",
            &[],
        )
        .await?;

    let mut map: HashMap<String, HashSet<String>> = HashMap::new();
    for row in &rows {
        let table: String = row.get("table_name");
        let col: String = row.get("column_name");
        map.entry(table).or_default().insert(col);
    }
    Ok(map)
}

/// (table_name, column_name) -> (referenced_table, referenced_column).
async fn foreign_keys(client: &Client) -> AppResult<HashMap<(String, String), (String, String)>> {
    let rows = client
        .query(
            "SELECT
                 tc.table_name,
                 kcu.column_name,
                 ccu.table_name  AS foreign_table,
                 ccu.column_name AS foreign_column
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY'
               AND tc.table_schema = 'public'",
            &[],
        )
        .await?;

    let mut map = HashMap::new();
    for row in &rows {
        let table: String = row.get("table_name");
        let col: String = row.get("column_name");
        let ft: String = row.get("foreign_table");
        let fc: String = row.get("foreign_column");
        map.insert((table, col), (ft, fc));
    }
    Ok(map)
}
