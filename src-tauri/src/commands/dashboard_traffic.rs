use chrono::NaiveDate;
use serde::Serialize;
use tauri::State;
use tokio_postgres::Row;

use crate::commands::analytics::RangeArgs;
use crate::db::error::{AppError, AppResult};
use crate::db::pool::ConnectionState;

const SET_STATEMENT_TIMEOUT_SQL: &str = "SET statement_timeout = '15s'";
const RESET_STATEMENT_TIMEOUT_SQL: &str = "RESET statement_timeout";

const TRAFFIC_SQL: &str = r#"
WITH daily AS MATERIALIZED (
    SELECT date_trunc('day', occurred_at)::date AS day,
           COUNT(*)::bigint AS visits
    FROM analytics_page_views
    WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours')
                          AND ($2::timestamptz + interval '48 hours')
      AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
    GROUP BY 1
),
days AS (
    SELECT generate_series(
        date_trunc('day', $1::timestamptz),
        date_trunc('day', $2::timestamptz),
        interval '1 day'
    )::date AS day
),
filled AS MATERIALIZED (
    SELECT days.day,
           COALESCE(daily.visits, 0)::bigint AS visits
    FROM days
    LEFT JOIN daily USING (day)
)
SELECT 'total'::text AS row_type,
       NULL::date AS day,
       COALESCE(SUM(visits), 0)::bigint AS visits
FROM filled

UNION ALL

SELECT 'daily'::text AS row_type,
       day,
       visits
FROM filled

ORDER BY day NULLS FIRST;
"#;

#[derive(Debug, Serialize)]
pub struct DailyVisits {
    pub date: NaiveDate,
    pub visits: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardTraffic {
    pub visits: i64,
    pub daily_visits: Vec<DailyVisits>,
}

fn kpi_visits(total: Option<i64>) -> i64 {
    total.unwrap_or_default()
}

fn finish_after_reset<T, E>(
    query_result: Result<T, E>,
    reset_result: Result<(), E>,
) -> Result<T, E> {
    match query_result {
        Err(query_error) => Err(query_error),
        Ok(value) => reset_result.map(|()| value),
    }
}

fn dashboard_traffic_from_rows(rows: Vec<Row>) -> AppResult<DashboardTraffic> {
    let mut visits = None;
    let mut daily_visits = Vec::new();

    for row in rows {
        let row_type: String = row.try_get("row_type")?;
        match row_type.as_str() {
            "total" => visits = Some(row.try_get("visits")?),
            "daily" => daily_visits.push(DailyVisits {
                date: row.try_get("day")?,
                visits: row.try_get("visits")?,
            }),
            tag => {
                return Err(AppError::Message(format!(
                    "unexpected dashboard traffic row type: {tag}"
                )))
            }
        }
    }

    Ok(DashboardTraffic {
        visits: kpi_visits(visits),
        daily_visits,
    })
}

#[tauri::command]
pub async fn get_dashboard_traffic(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<DashboardTraffic> {
    let client = state.client().await?;
    client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await?;

    let query_result = client.query(TRAFFIC_SQL, &[&args.from, &args.to]).await;
    let reset_result = client.batch_execute(RESET_STATEMENT_TIMEOUT_SQL).await;
    let rows = finish_after_reset(query_result, reset_result)?;

    dashboard_traffic_from_rows(rows)
}

#[cfg(test)]
mod tests {
    use super::{
        finish_after_reset, kpi_visits, DashboardTraffic, RESET_STATEMENT_TIMEOUT_SQL,
        SET_STATEMENT_TIMEOUT_SQL, TRAFFIC_SQL,
    };

    fn compact(sql: &str) -> String {
        sql.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn dashboard_traffic_query_uses_received_at_candidate_range() {
        let sql = compact(TRAFFIC_SQL);

        assert!(sql.contains(
            "WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours') AND ($2::timestamptz + interval '48 hours')"
        ));
    }

    #[test]
    fn dashboard_traffic_uses_an_exclusive_client_lease_without_global_serialization() {
        let production = include_str!("dashboard_traffic.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("production source");
        let command = production
            .split("pub async fn get_dashboard_traffic")
            .nth(1)
            .expect("dashboard traffic command");

        assert!(!command.contains("dashboard_query_guard"));
        let client = command
            .find("state.client().await")
            .expect("exclusive client lease must be acquired");
        let timeout = command
            .find("client.batch_execute(SET_STATEMENT_TIMEOUT_SQL)")
            .expect("statement timeout must be set");
        assert!(client < timeout);
    }

    #[test]
    fn dashboard_traffic_query_keeps_exact_occurred_at_range() {
        assert!(TRAFFIC_SQL.contains("AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"));
    }

    #[test]
    fn dashboard_traffic_aggregates_before_materializing_daily_rows() {
        let sql = compact(TRAFFIC_SQL);

        assert!(sql.contains(
            "WITH daily AS MATERIALIZED ( SELECT date_trunc('day', occurred_at)::date AS day, COUNT(*)::bigint AS visits FROM analytics_page_views"
        ));
        assert!(!sql.contains("candidates AS MATERIALIZED"));
        assert_eq!(sql.matches("FROM analytics_page_views").count(), 1);
        assert!(sql.contains("GROUP BY 1"));
        assert!(sql.contains("filled AS MATERIALIZED"));
        assert!(sql.contains("COALESCE(SUM(visits), 0)::bigint AS visits FROM filled"));
        assert!(sql.contains("generate_series"));
        assert!(sql.contains("'total'::text AS row_type"));
        assert!(sql.contains("'daily'::text AS row_type"));
        assert!(!sql.contains("'geo'::text AS row_type"));
        assert!(!sql.contains("viewer_country"));
        assert!(!sql.contains("viewer_city"));
    }

    #[test]
    fn dashboard_traffic_serialization_excludes_geography() {
        let value = serde_json::to_value(DashboardTraffic {
            visits: 0,
            daily_visits: Vec::new(),
        })
        .unwrap();

        assert!(value.get("dailyVisits").is_some());
        assert!(value.get("geo").is_none());
    }

    #[test]
    fn dashboard_traffic_kpi_helper_preserves_zero_and_nonzero_counts() {
        assert_eq!(kpi_visits(Some(0)), 0);
        assert_eq!(kpi_visits(Some(37)), 37);
    }

    #[test]
    fn dashboard_traffic_timeout_is_finite_and_resettable() {
        assert_eq!(SET_STATEMENT_TIMEOUT_SQL, "SET statement_timeout = '15s'");
        assert_eq!(RESET_STATEMENT_TIMEOUT_SQL, "RESET statement_timeout");
    }

    #[test]
    fn dashboard_traffic_query_error_wins_after_reset_attempt() {
        let result: Result<(), &str> = finish_after_reset(Err("query failed"), Err("reset failed"));

        assert_eq!(result, Err("query failed"));
    }

    #[test]
    fn dashboard_traffic_reset_error_is_returned_after_query_success() {
        let result = finish_after_reset(Ok(42), Err("reset failed"));

        assert_eq!(result, Err("reset failed"));
    }

    #[test]
    fn dashboard_traffic_daily_rows_are_zero_filled() {
        let sql = compact(TRAFFIC_SQL);

        assert!(sql.contains("LEFT JOIN daily USING (day)"));
        assert!(sql.contains("COALESCE(daily.visits, 0)::bigint AS visits"));
    }

    #[test]
    fn dashboard_traffic_daily_rows_are_ordered_by_date() {
        let sql = compact(TRAFFIC_SQL);

        assert!(sql.contains("ORDER BY day NULLS FIRST"));
    }
}
