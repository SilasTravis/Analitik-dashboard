use std::collections::HashMap;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio_postgres::Row;

use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;

const SET_STATEMENT_TIMEOUT_SQL: &str = "SET statement_timeout = '15s'";
const RESET_STATEMENT_TIMEOUT_SQL: &str = "RESET statement_timeout";

#[derive(Debug, Deserialize)]
pub struct LiveOrderArgs {
    /// The Uzbekistan calendar day (`YYYY-MM-DD`) to bucket, as picked by the
    /// caller — not a UTC instant. The query itself converts `created_at`
    /// into Uzbekistan wall-clock time before comparing against it, so the
    /// caller never has to reason about UTC offsets.
    pub day: NaiveDate,
}

/// Buckets `orders` into the 24 Uzbekistan-local hours of the requested day,
/// by source. Both the day filter and `hour_index` shift `created_at` into
/// Uzbekistan wall-clock time first — deliberately avoiding `::timestamptz`
/// casts (which resolve through the DB session's timezone setting) so the
/// result is correct regardless of how the connection is configured.
///
/// Reads `orders.source` (the order channel: "ios", "android", "web/mobile",
/// "operator", "click", "basket", …) and NOT `order_source_type`, which is a
/// different, marketing-attribution column (direct/paid/organic/referral/
/// social) already used by the commerce dashboard — confirmed against
/// production data before wiring this up.
pub(crate) const HOURLY_ORDERS_SQL: &str = "
    SELECT
        EXTRACT(HOUR FROM (created_at + interval '5 hours'))::int AS hour_index,
        COALESCE(NULLIF(source, ''), 'unknown') AS source,
        COUNT(*)::bigint AS orders
    FROM orders
    WHERE (created_at + interval '5 hours') >= $1::date
      AND (created_at + interval '5 hours') < ($1::date + interval '1 day')
      AND deleted_at IS NULL
    GROUP BY 1, 2
    ORDER BY 1, 2;
";

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HourlyOrderPoint {
    pub hour: i32,
    pub total: i64,
    pub by_source: HashMap<String, i64>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LiveOrderStats {
    pub total_orders: i64,
    /// Distinct `orders.source` values seen on the day, ordered by volume
    /// descending — lets the UI assign a fixed color per source without
    /// hard-coding a vocabulary it can't see.
    pub sources: Vec<String>,
    /// 24 entries, index 0 = 00:00 Uzbekistan time.
    pub hourly: Vec<HourlyOrderPoint>,
}

fn finish_after_reset<T, E>(
    query_result: Result<T, E>,
    reset_result: Result<(), E>,
) -> Result<T, E> {
    match query_result {
        Err(error) => Err(error),
        Ok(value) => reset_result.map(|()| value),
    }
}

fn live_order_stats_from_rows(rows: Vec<Row>) -> AppResult<LiveOrderStats> {
    let mut hourly: Vec<HourlyOrderPoint> = (0..24)
        .map(|hour| HourlyOrderPoint {
            hour,
            total: 0,
            by_source: HashMap::new(),
        })
        .collect();
    let mut source_totals: HashMap<String, i64> = HashMap::new();
    let mut total_orders: i64 = 0;

    for row in rows {
        let hour_index: i32 = row.try_get("hour_index")?;
        let source: String = row.try_get("source")?;
        let orders: i64 = row.try_get("orders")?;

        // Guard against a caller-supplied window that isn't exactly one day;
        // out-of-range hours are dropped rather than panicking on index.
        if !(0..24).contains(&hour_index) {
            continue;
        }

        let bucket = &mut hourly[hour_index as usize];
        bucket.total += orders;
        *bucket.by_source.entry(source.clone()).or_insert(0) += orders;

        *source_totals.entry(source).or_insert(0) += orders;
        total_orders += orders;
    }

    let mut sources: Vec<String> = source_totals.keys().cloned().collect();
    sources.sort_by(|a, b| {
        source_totals[b]
            .cmp(&source_totals[a])
            .then_with(|| a.cmp(b))
    });

    Ok(LiveOrderStats {
        total_orders,
        sources,
        hourly,
    })
}

#[tauri::command]
pub async fn get_live_order_stats(
    state: State<'_, ConnectionState>,
    args: LiveOrderArgs,
) -> AppResult<LiveOrderStats> {
    let client = state.analytics_client().await?;
    client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await?;

    let query_result = client.query(HOURLY_ORDERS_SQL, &[&args.day]).await;
    let reset_result = client.batch_execute(RESET_STATEMENT_TIMEOUT_SQL).await;
    let rows = finish_after_reset(query_result, reset_result)?;

    live_order_stats_from_rows(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compact(sql: &str) -> String {
        sql.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn hourly_sql_buckets_by_uzbekistan_wall_clock_hour() {
        let sql = compact(HOURLY_ORDERS_SQL);

        assert!(sql.contains("EXTRACT(HOUR FROM (created_at + interval '5 hours'))::int AS hour_index"));
        assert!(sql.contains("(created_at + interval '5 hours') >= $1::date"));
        assert!(sql.contains("(created_at + interval '5 hours') < ($1::date + interval '1 day')"));
        assert!(sql.contains("AND deleted_at IS NULL"));
        assert!(sql.contains("COALESCE(NULLIF(source, ''), 'unknown') AS source"));
        assert!(sql.contains("GROUP BY 1, 2"));
        assert!(sql.contains("ORDER BY 1, 2"));
        assert_eq!(sql.matches("FROM orders").count(), 1);
    }

    #[test]
    fn hourly_sql_never_relies_on_timestamptz_session_timezone_casts() {
        let sql = compact(HOURLY_ORDERS_SQL);

        // A `::timestamptz` cast resolves through the DB session's timezone
        // setting, which this command must not depend on — Uzbekistan's
        // fixed +5h offset is applied explicitly instead.
        assert!(!sql.contains("timestamptz"));
    }

    #[test]
    fn hourly_sql_reads_the_channel_column_not_the_attribution_column() {
        let sql = compact(HOURLY_ORDERS_SQL);

        // `order_source_type` is a different column (marketing attribution:
        // direct/paid/organic/referral/social) — see `get_order_sources` in
        // analytics.rs. Live Orders must read the channel column instead.
        assert!(!sql.contains("order_source_type"));
        assert!(sql.contains("NULLIF(source, '')"));
    }

    #[test]
    fn timeout_contract_sets_fifteen_seconds_and_resets() {
        assert_eq!(SET_STATEMENT_TIMEOUT_SQL, "SET statement_timeout = '15s'");
        assert_eq!(RESET_STATEMENT_TIMEOUT_SQL, "RESET statement_timeout");
    }

    #[test]
    fn command_uses_an_exclusive_client_lease_and_sets_its_timeout() {
        let source = include_str!("live_orders.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("production source should precede tests");

        let client = production
            .find("state.analytics_client().await")
            .expect("command must obtain an exclusive client lease");
        let timeout = production
            .find("client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await")
            .expect("command must set its timeout");

        assert!(client < timeout);
    }

    #[test]
    fn serializes_hourly_fields_as_camel_case() {
        let value = serde_json::to_value(HourlyOrderPoint {
            hour: 0,
            total: 0,
            by_source: HashMap::new(),
        })
        .expect("point should serialize");

        assert!(value.get("bySource").is_some());
        assert!(value.get("by_source").is_none());

        let stats = serde_json::to_value(LiveOrderStats {
            total_orders: 0,
            sources: Vec::new(),
            hourly: Vec::new(),
        })
        .expect("stats should serialize");

        assert!(stats.get("totalOrders").is_some());
        assert!(stats.get("total_orders").is_none());
    }

    #[test]
    fn query_error_wins_after_a_reset_attempt() {
        let result: Result<(), &str> = finish_after_reset(Err("query failed"), Err("reset failed"));

        assert_eq!(result, Err("query failed"));
    }

    #[test]
    fn reset_error_is_returned_when_query_succeeds() {
        let result = finish_after_reset(Ok(42), Err("reset failed"));

        assert_eq!(result, Err("reset failed"));
    }

    #[test]
    fn live_order_args_deserializes_a_plain_calendar_day_from_the_frontend() {
        let args: LiveOrderArgs =
            serde_json::from_str(r#"{"day":"2026-08-07"}"#).expect("plain YYYY-MM-DD should parse");

        assert_eq!(args.day, NaiveDate::from_ymd_opt(2026, 8, 7).unwrap());
    }
}
