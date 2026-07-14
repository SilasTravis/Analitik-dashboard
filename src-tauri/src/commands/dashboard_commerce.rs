use serde::Serialize;
use tauri::State;
use tokio_postgres::types::ToSql;
use tokio_postgres::Client;

use crate::commands::analytics::{DailyRevenue, ProductRow, RangeArgs, SourceRow};
use crate::db::error::{AppError, AppResult};
use crate::db::pool::ConnectionState;

const SET_STATEMENT_TIMEOUT_SQL: &str = "SET statement_timeout = '15s'";
const RESET_STATEMENT_TIMEOUT_SQL: &str = "RESET statement_timeout";

const COMMERCE_AGGREGATE_SQL: &str = "
    WITH aggregates AS MATERIALIZED (
        SELECT date_trunc('day', created_at)::date AS day,
               COALESCE(NULLIF(order_source_type, ''), 'direct') AS source,
               COUNT(*)::bigint AS orders,
               COALESCE(SUM(total_price), 0)::float8 AS revenue
        FROM orders
        WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND deleted_at IS NULL
        GROUP BY GROUPING SETS (
            (),
            (date_trunc('day', created_at)::date),
            (COALESCE(NULLIF(order_source_type, ''), 'direct'))
        )
    ),
    days AS (
        SELECT generate_series(
            date_trunc('day', $1::timestamptz),
            date_trunc('day', $2::timestamptz),
            interval '1 day'
        )::date AS day
    ),
    source_rows AS (
        SELECT source, orders, revenue
        FROM aggregates
        WHERE day IS NULL
          AND source IS NOT NULL
        ORDER BY revenue DESC
        LIMIT 10
    )
    SELECT kind, day, orders, revenue, source
    FROM (
        SELECT 0 AS section,
               'total'::text AS kind,
               NULL::date AS day,
               orders,
               revenue,
               NULL::text AS source
        FROM aggregates
        WHERE day IS NULL
          AND source IS NULL

        UNION ALL

        SELECT 1 AS section,
               'daily'::text AS kind,
               days.day,
               COALESCE(aggregates.orders, 0) AS orders,
               COALESCE(aggregates.revenue, 0) AS revenue,
               NULL::text AS source
        FROM days
        LEFT JOIN aggregates
          ON aggregates.day = days.day
         AND aggregates.source IS NULL

        UNION ALL

        SELECT 2 AS section,
               'source'::text AS kind,
               NULL::date AS day,
               orders,
               revenue,
               source
        FROM source_rows
    ) AS commerce_rows
    ORDER BY section, day ASC NULLS LAST, revenue DESC NULLS LAST;
";

const TOP_PRODUCTS_SQL: &str = "
    WITH bounded_orders AS MATERIALIZED (
        SELECT id
        FROM orders
        WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND deleted_at IS NULL
    )
    SELECT
        op.sap_code,
        COALESCE(
            NULLIF(p.name_ru, ''),
            NULLIF(p.name_uz, ''),
            NULLIF(p.name_kr, ''),
            op.sap_code
        ) AS name,
        SUM(op.quantity)::bigint AS purchases,
        COALESCE(SUM(op.total_price), 0)::float8 AS revenue
    FROM order_products op
    JOIN bounded_orders o ON o.id = op.order_id
    LEFT JOIN products p ON p.sap_code = op.sap_code
    GROUP BY op.sap_code, p.name_ru, p.name_uz, p.name_kr
    ORDER BY purchases DESC
    LIMIT 10;
";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardCommerce {
    pub orders: i64,
    pub revenue: f64,
    pub daily_revenue: Vec<DailyRevenue>,
    pub order_sources: Vec<SourceRow>,
    pub top_products: Vec<ProductRow>,
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

async fn load_dashboard_commerce(
    client: &Client,
    args: &RangeArgs,
) -> AppResult<DashboardCommerce> {
    let params: [&(dyn ToSql + Sync); 2] = [&args.from, &args.to];
    let aggregate_rows = client.query(COMMERCE_AGGREGATE_SQL, &params).await?;

    let mut orders = 0;
    let mut revenue = 0.0;
    let mut daily_revenue = Vec::new();
    let mut order_sources = Vec::new();

    for row in aggregate_rows {
        let kind: String = row.get("kind");
        match kind.as_str() {
            "total" => {
                orders = row.get("orders");
                revenue = row.get("revenue");
            }
            "daily" => daily_revenue.push(DailyRevenue {
                date: row.get("day"),
                orders: row.get("orders"),
                revenue: row.get("revenue"),
            }),
            "source" => order_sources.push(SourceRow {
                source: row.get("source"),
                orders: row.get("orders"),
                revenue: row.get("revenue"),
            }),
            unexpected => {
                return Err(AppError::Message(format!(
                    "unexpected commerce row kind: {unexpected}"
                )));
            }
        }
    }

    let top_products = client
        .query(TOP_PRODUCTS_SQL, &params)
        .await?
        .into_iter()
        .map(|row| ProductRow {
            sap_code: row.get("sap_code"),
            name: row.get("name"),
            purchases: row.get("purchases"),
            revenue: row.get("revenue"),
        })
        .collect();

    Ok(DashboardCommerce {
        orders,
        revenue,
        daily_revenue,
        order_sources,
        top_products,
    })
}

#[tauri::command]
pub async fn get_dashboard_commerce(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<DashboardCommerce> {
    let client = state.client().await?;
    client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await?;

    let query_result = load_dashboard_commerce(client.as_ref(), &args).await;
    let reset_result = client
        .batch_execute(RESET_STATEMENT_TIMEOUT_SQL)
        .await
        .map_err(AppError::from);

    finish_after_reset(query_result, reset_result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compact(sql: &str) -> String {
        sql.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn commerce_aggregates_orders_in_one_pass_before_materializing() {
        let sql = compact(COMMERCE_AGGREGATE_SQL);

        assert!(sql.contains("WITH aggregates AS MATERIALIZED"));
        assert!(!sql.contains("bounded_orders AS MATERIALIZED"));
        assert!(sql.contains(
            "WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz AND deleted_at IS NULL"
        ));
        assert_eq!(sql.matches("FROM orders").count(), 1);
        assert!(sql.contains("GROUP BY GROUPING SETS"));
        assert!(sql.contains("FROM aggregates"));
    }

    #[test]
    fn aggregate_query_fills_days_and_preserves_legacy_source_rules() {
        let sql = compact(COMMERCE_AGGREGATE_SQL);

        assert!(sql.contains("SELECT generate_series("));
        assert!(sql.contains("LEFT JOIN aggregates ON aggregates.day = days.day"));
        assert!(sql.contains("COALESCE(aggregates.orders, 0) AS orders"));
        assert!(sql.contains("COALESCE(aggregates.revenue, 0) AS revenue"));
        assert!(sql.contains("COALESCE(NULLIF(order_source_type, ''), 'direct') AS source"));
        assert!(sql.contains("ORDER BY revenue DESC LIMIT 10"));
    }

    #[test]
    fn top_products_join_only_the_bounded_non_deleted_order_set() {
        let sql = compact(TOP_PRODUCTS_SQL);

        assert!(sql.contains("WITH bounded_orders AS MATERIALIZED"));
        assert!(sql.contains(
            "WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz AND deleted_at IS NULL"
        ));
        assert!(sql.contains("JOIN bounded_orders o ON o.id = op.order_id"));
        assert!(!sql.contains("JOIN orders o ON"));
        assert!(sql.contains(
            "COALESCE( NULLIF(p.name_ru, ''), NULLIF(p.name_uz, ''), NULLIF(p.name_kr, ''), op.sap_code ) AS name"
        ));
        assert!(sql.contains("GROUP BY op.sap_code, p.name_ru, p.name_uz, p.name_kr"));
        assert!(sql.contains("ORDER BY purchases DESC LIMIT 10"));
    }

    #[test]
    fn timeout_contract_sets_fifteen_seconds_and_resets() {
        assert_eq!(SET_STATEMENT_TIMEOUT_SQL, "SET statement_timeout = '15s'");
        assert_eq!(RESET_STATEMENT_TIMEOUT_SQL, "RESET statement_timeout");
    }

    #[test]
    fn query_error_wins_after_a_reset_attempt() {
        let result: Result<(), &str> = finish_after_reset(Err("query failed"), Err("reset failed"));

        assert_eq!(result, Err("query failed"));
    }

    #[test]
    fn reset_error_is_returned_when_queries_succeed() {
        let result = finish_after_reset(Ok(42), Err("reset failed"));

        assert_eq!(result, Err("reset failed"));
    }

    #[test]
    fn dashboard_serializes_collection_fields_as_camel_case() {
        let value = serde_json::to_value(DashboardCommerce {
            orders: 0,
            revenue: 0.0,
            daily_revenue: Vec::new(),
            order_sources: Vec::new(),
            top_products: Vec::new(),
        })
        .expect("dashboard should serialize");

        assert!(value.get("dailyRevenue").is_some());
        assert!(value.get("orderSources").is_some());
        assert!(value.get("topProducts").is_some());
        assert!(value.get("daily_revenue").is_none());
        assert!(value.get("order_sources").is_none());
        assert!(value.get("top_products").is_none());
    }

    #[test]
    fn commerce_command_uses_an_exclusive_client_lease_without_global_serialization() {
        let source = include_str!("dashboard_commerce.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("production source should precede tests");
        assert!(!production.contains("dashboard_query_guard"));
        let client = production
            .find("state.client().await")
            .expect("commerce command must obtain an exclusive client lease");
        let timeout = production
            .find("client.batch_execute(SET_STATEMENT_TIMEOUT_SQL).await")
            .expect("commerce command must set its timeout");

        assert!(client < timeout);
    }
}
