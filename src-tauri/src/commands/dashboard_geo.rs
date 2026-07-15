use tauri::State;

use crate::commands::analytics::{GeoRow, RangeArgs};
use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;

const SET_STATEMENT_TIMEOUT_SQL: &str = "SET statement_timeout = '15s'";
const RESET_STATEMENT_TIMEOUT_SQL: &str = "RESET statement_timeout";

const GEO_SQL: &str = r#"
SELECT COALESCE(NULLIF(viewer_country, ''), 'Unknown') AS country,
       COALESCE(NULLIF(viewer_city, ''), '—') AS city,
       COUNT(*)::bigint AS visits
FROM analytics_page_views
WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours')
                      AND ($2::timestamptz + interval '48 hours')
  AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
GROUP BY 1, 2
ORDER BY visits DESC
LIMIT 10;
"#;

fn finish_after_reset<T, E>(
    query_result: Result<T, E>,
    reset_result: Result<(), E>,
) -> Result<T, E> {
    match query_result {
        Err(query_error) => Err(query_error),
        Ok(value) => reset_result.map(|()| value),
    }
}

#[tauri::command]
pub async fn get_dashboard_geo(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<GeoRow>> {
    let client = state.analytics_client().await?;
    client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await?;

    let query_result = client.query(GEO_SQL, &[&args.from, &args.to]).await;
    let reset_result = client.batch_execute(RESET_STATEMENT_TIMEOUT_SQL).await;
    let rows = finish_after_reset(query_result, reset_result)?;

    rows.into_iter()
        .map(|row| {
            Ok(GeoRow {
                country: row.try_get("country")?,
                city: row.try_get("city")?,
                visits: row.try_get("visits")?,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        finish_after_reset, GEO_SQL, RESET_STATEMENT_TIMEOUT_SQL, SET_STATEMENT_TIMEOUT_SQL,
    };

    fn compact(sql: &str) -> String {
        sql.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn dashboard_geo_uses_the_indexed_candidate_and_exact_authoritative_range() {
        let sql = compact(GEO_SQL);

        assert!(sql.contains(
            "WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours') AND ($2::timestamptz + interval '48 hours')"
        ));
        assert!(sql.contains("AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"));
    }

    #[test]
    fn dashboard_geo_aggregates_directly_without_materializing_raw_rows() {
        let sql = compact(GEO_SQL);

        assert!(!sql.contains("AS MATERIALIZED"));
        assert!(!sql.contains("WITH candidates"));
        assert_eq!(sql.matches("FROM analytics_page_views").count(), 1);
    }

    #[test]
    fn dashboard_geo_preserves_legacy_fallback_grouping_order_and_limit() {
        let sql = compact(GEO_SQL);

        assert!(sql.contains("COALESCE(NULLIF(viewer_country, ''), 'Unknown') AS country"));
        assert!(sql.contains("COALESCE(NULLIF(viewer_city, ''), '—') AS city"));
        assert!(sql.contains("COUNT(*)::bigint AS visits"));
        assert!(sql.contains("GROUP BY 1, 2"));
        assert!(sql.contains("ORDER BY visits DESC"));
        assert!(sql.contains("LIMIT 10"));
    }

    #[test]
    fn dashboard_geo_timeout_is_finite_and_resettable() {
        assert_eq!(SET_STATEMENT_TIMEOUT_SQL, "SET statement_timeout = '15s'");
        assert_eq!(RESET_STATEMENT_TIMEOUT_SQL, "RESET statement_timeout");
    }

    #[test]
    fn dashboard_geo_query_error_wins_after_reset_attempt() {
        let result: Result<(), &str> = finish_after_reset(Err("query failed"), Err("reset failed"));

        assert_eq!(result, Err("query failed"));
    }

    #[test]
    fn dashboard_geo_reset_error_is_returned_after_query_success() {
        let result = finish_after_reset(Ok(42), Err("reset failed"));

        assert_eq!(result, Err("reset failed"));
    }

    #[test]
    fn dashboard_geo_uses_an_exclusive_client_lease_without_global_serialization() {
        let production = include_str!("dashboard_geo.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap();
        let command = production
            .split("pub async fn get_dashboard_geo")
            .nth(1)
            .unwrap();
        assert!(!command.contains("dashboard_query_guard"));
        let client = command
            .find("state.analytics_client().await")
            .expect("exclusive client lease must be acquired");
        let timeout = command
            .find("client.batch_execute(SET_STATEMENT_TIMEOUT_SQL)")
            .expect("statement timeout must be set");

        assert!(client < timeout);
    }
}
