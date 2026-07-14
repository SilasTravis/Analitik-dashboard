use chrono::NaiveDate;
use serde::Serialize;
use tauri::State;

use crate::commands::analytics::{DeviceBucket, RangeArgs};
use crate::db::error::{AppError, AppResult};
use crate::db::pool::ConnectionState;

const SET_STATEMENT_TIMEOUT_SQL: &str = "SET statement_timeout = '15s'";
const RESET_STATEMENT_TIMEOUT_SQL: &str = "RESET statement_timeout";

/// Walk the leading column of the existing source index one distinct value at
/// a time. This avoids scanning the full sessions table just to build the list
/// used by the indexed candidate lookup.
const SOURCE_TYPES_SQL: &str = r#"
    WITH RECURSIVE source_values(source_type) AS (
        (
            SELECT source_type
            FROM analytics_sessions
            WHERE source_type IS NOT NULL
            ORDER BY source_type
            LIMIT 1
        )

        UNION ALL

        SELECT (
            SELECT sessions.source_type
            FROM analytics_sessions sessions
            WHERE sessions.source_type > source_values.source_type
              AND sessions.source_type IS NOT NULL
            ORDER BY sessions.source_type
            LIMIT 1
        )
        FROM source_values
        WHERE source_values.source_type IS NOT NULL
    )
    SELECT source_type
    FROM source_values
    WHERE source_type IS NOT NULL
    ORDER BY source_type;
"#;

/// Aggregate the bounded sessions in one pass, then materialize only the
/// small total, daily, and device result set.
const SESSIONS_SQL: &str = r#"
    WITH aggregates AS MATERIALIZED (
        SELECT date_trunc('day', occurred_at)::date AS day,
               CASE WHEN is_mobile THEN 'Mobile' ELSE 'Desktop' END AS device,
               COUNT(DISTINCT session_id)::bigint AS sessions
        FROM analytics_sessions
        WHERE (source_type = ANY($3::text[]) OR source_type IS NULL)
          AND session_registered_at BETWEEN
              (($1::timestamptz - interval '5 minutes') AT TIME ZONE 'UTC') AND
              (($2::timestamptz + interval '5 minutes') AT TIME ZONE 'UTC')
          AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY GROUPING SETS (
            (),
            (date_trunc('day', occurred_at)::date),
            (CASE WHEN is_mobile THEN 'Mobile' ELSE 'Desktop' END)
        )
    ),
    days AS (
        SELECT generate_series(
            date_trunc('day', $1::timestamptz),
            date_trunc('day', $2::timestamptz),
            interval '1 day'
        )::date AS day
    )
    SELECT 0::int2 AS sort_order,
           'total' AS kind,
           NULL::date AS day,
           NULL::text AS device,
           COALESCE(MAX(aggregates.sessions), 0)::bigint AS sessions
    FROM aggregates
    WHERE aggregates.day IS NULL
      AND aggregates.device IS NULL

    UNION ALL

    SELECT 1::int2 AS sort_order,
           'daily' AS kind,
           days.day,
           NULL::text AS device,
           COALESCE(aggregates.sessions, 0)::bigint AS sessions
    FROM days
    LEFT JOIN aggregates
      ON aggregates.day = days.day
     AND aggregates.device IS NULL

    UNION ALL

    SELECT 2::int2 AS sort_order,
           'device' AS kind,
           NULL::date AS day,
           aggregates.device,
           aggregates.sessions
    FROM aggregates
    WHERE aggregates.day IS NULL
      AND aggregates.device IS NOT NULL

    ORDER BY sort_order, day, sessions DESC, device;
"#;

#[derive(Debug, Serialize)]
pub struct DailySessions {
    pub date: NaiveDate,
    pub sessions: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSessions {
    pub sessions: i64,
    pub daily_sessions: Vec<DailySessions>,
    pub devices: Vec<DeviceBucket>,
}

#[derive(Debug, Eq, PartialEq)]
enum TaggedRowKind {
    Total,
    Daily,
    Device,
}

fn tagged_row_kind(kind: &str) -> AppResult<TaggedRowKind> {
    match kind {
        "total" => Ok(TaggedRowKind::Total),
        "daily" => Ok(TaggedRowKind::Daily),
        "device" => Ok(TaggedRowKind::Device),
        unexpected => Err(AppError::Message(format!(
            "unexpected dashboard sessions row kind: {unexpected}"
        ))),
    }
}

fn finish_after_reset<T, QueryError, ResetError>(
    query_result: Result<T, QueryError>,
    reset_result: Result<(), ResetError>,
) -> Result<T, QueryError>
where
    QueryError: From<ResetError>,
{
    match query_result {
        Err(query_error) => Err(query_error),
        Ok(bundle) => reset_result.map(|()| bundle).map_err(QueryError::from),
    }
}

async fn load_dashboard_sessions(
    client: &tokio_postgres::Client,
    args: &RangeArgs,
) -> AppResult<DashboardSessions> {
    let source_rows = client.query(SOURCE_TYPES_SQL, &[]).await?;
    let source_types: Vec<String> = source_rows
        .into_iter()
        .map(|row| row.get("source_type"))
        .collect();

    let rows = client
        .query(SESSIONS_SQL, &[&args.from, &args.to, &source_types])
        .await?;

    let mut sessions = 0;
    let mut daily_sessions = Vec::new();
    let mut devices = Vec::new();

    for row in rows {
        let kind: &str = row.get("kind");
        let count: i64 = row.get("sessions");

        match tagged_row_kind(kind)? {
            TaggedRowKind::Total => sessions = count,
            TaggedRowKind::Daily => daily_sessions.push(DailySessions {
                date: row.get("day"),
                sessions: count,
            }),
            TaggedRowKind::Device => devices.push(DeviceBucket {
                device: row.get("device"),
                count,
            }),
        }
    }

    Ok(DashboardSessions {
        sessions,
        daily_sessions,
        devices,
    })
}

#[tauri::command]
pub async fn get_dashboard_sessions(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<DashboardSessions> {
    let client = state.client().await?;
    client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await?;

    let query_result = load_dashboard_sessions(client.as_ref(), &args).await;
    let reset_result = client.batch_execute(RESET_STATEMENT_TIMEOUT_SQL).await;

    finish_after_reset(query_result, reset_result)
}

#[cfg(test)]
mod dashboard_sessions_tests {
    use super::{
        finish_after_reset, tagged_row_kind, DailySessions, DashboardSessions,
        RESET_STATEMENT_TIMEOUT_SQL, SESSIONS_SQL, SET_STATEMENT_TIMEOUT_SQL, SOURCE_TYPES_SQL,
    };
    use crate::db::error::AppError;

    fn compact(sql: &str) -> String {
        sql.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn dashboard_sessions_discovers_source_types_with_a_recursive_loose_index_scan() {
        let sql = compact(SOURCE_TYPES_SQL);

        assert!(sql.contains("WITH RECURSIVE source_values(source_type) AS"));
        assert!(sql.contains("FROM analytics_sessions"));
        assert!(sql.contains("source_type IS NOT NULL"));
        assert!(sql.contains("source_type > source_values.source_type"));
        assert!(sql.contains("ORDER BY source_type LIMIT 1"));
    }

    #[test]
    fn dashboard_sessions_uses_the_exact_registered_and_occurred_candidate_ranges() {
        let sql = compact(SESSIONS_SQL);

        assert!(sql.contains(
            "session_registered_at BETWEEN (($1::timestamptz - interval '5 minutes') AT TIME ZONE 'UTC') AND (($2::timestamptz + interval '5 minutes') AT TIME ZONE 'UTC')"
        ));
        assert!(sql.contains("occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"));
    }

    #[test]
    fn dashboard_sessions_passes_discovered_sources_without_hard_coding_values() {
        let discovery = compact(SOURCE_TYPES_SQL).to_ascii_lowercase();
        let sessions = compact(SESSIONS_SQL).to_ascii_lowercase();

        assert!(sessions.contains("(source_type = any($3::text[]) or source_type is null)"));
        assert!(!discovery.contains("source_type = '"));
        assert!(!sessions.contains("source_type = '"));
        assert!(!sessions.contains("source_type in ("));
    }

    #[test]
    fn dashboard_sessions_materializes_only_grouped_results() {
        let sql = compact(SESSIONS_SQL);

        assert_eq!(sql.matches("AS MATERIALIZED").count(), 1);
        assert!(sql.contains("WITH aggregates AS MATERIALIZED"));
        assert!(!sql.contains("candidates AS MATERIALIZED"));
        assert!(sql.contains("GROUP BY GROUPING SETS"));
        assert_eq!(sql.matches("FROM analytics_sessions").count(), 1);
        assert!(sql.contains("'total' AS kind"));
        assert!(sql.contains("'daily' AS kind"));
        assert!(sql.contains("'device' AS kind"));
        assert!(sql.contains("COALESCE(aggregates.sessions, 0)"));
        assert!(sql.contains("CASE WHEN is_mobile THEN 'Mobile' ELSE 'Desktop' END"));
    }

    #[test]
    fn dashboard_sessions_sets_and_resets_a_fifteen_second_timeout() {
        assert_eq!(SET_STATEMENT_TIMEOUT_SQL, "SET statement_timeout = '15s'");
        assert_eq!(RESET_STATEMENT_TIMEOUT_SQL, "RESET statement_timeout");
    }

    #[test]
    fn dashboard_sessions_serializes_daily_sessions_in_camel_case() {
        let bundle = DashboardSessions {
            sessions: 1,
            daily_sessions: vec![DailySessions {
                date: chrono::NaiveDate::from_ymd_opt(2026, 7, 14).unwrap(),
                sessions: 1,
            }],
            devices: Vec::new(),
        };

        let value = serde_json::to_value(bundle).unwrap();
        assert!(value.get("dailySessions").is_some());
        assert!(value.get("daily_sessions").is_none());
    }

    #[test]
    fn dashboard_sessions_rejects_an_unexpected_tag() {
        let error = tagged_row_kind("surprise").unwrap_err();

        assert!(matches!(
            error,
            AppError::Message(message)
                if message == "unexpected dashboard sessions row kind: surprise"
        ));
    }

    #[test]
    fn dashboard_sessions_uses_an_exclusive_client_lease_without_global_serialization() {
        let implementation = include_str!("dashboard_sessions.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        let command = implementation
            .split("pub async fn get_dashboard_sessions")
            .nth(1)
            .unwrap();
        assert!(!command.contains("dashboard_query_guard"));
        let client = command
            .find("state.client().await")
            .expect("exclusive client lease must be acquired");
        let set_timeout = command
            .find("client.batch_execute(SET_STATEMENT_TIMEOUT_SQL)")
            .expect("statement timeout must be set");

        assert!(client < set_timeout);
    }

    #[test]
    fn dashboard_sessions_query_error_wins_after_reset_attempt() {
        let result: Result<(), &str> = finish_after_reset(Err("query failed"), Err("reset failed"));

        assert_eq!(result, Err("query failed"));
    }

    #[test]
    fn dashboard_sessions_reset_error_is_returned_after_query_success() {
        let result: Result<i32, &str> = finish_after_reset(Ok(42), Err("reset failed"));

        assert_eq!(result, Err("reset failed"));
    }
}
