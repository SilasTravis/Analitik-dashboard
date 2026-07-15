use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio_postgres::types::ToSql;

use crate::commands::analytics::RangeArgs;
use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;

/// Range + device segment + the set of order statuses that count as
/// "completed/paid" for the funnel's final stage.
#[derive(Debug, Deserialize)]
pub struct ConvArgs {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    /// "mobile" | "desktop" | anything else / null = all devices.
    pub device: Option<String>,
    /// Statuses treated as a completed conversion. Empty = none completed.
    #[serde(default)]
    pub statuses: Vec<String>,
}

/// SQL fragment restricting a `session_id` column to a device segment.
///
/// Mirrors `performance::device_filter`: a session can have several
/// `analytics_sessions` rows and `is_mobile` is nullable, so we collapse each
/// session to one verdict with `bool_or(is_mobile)` (NULL counts as desktop).
/// The output is a fixed literal — no user input is interpolated — so it is
/// safe to splice. `col` is always a hard-coded column name from this file.
fn device_clause(device: &Option<String>, col: &str) -> String {
    match device.as_deref() {
        Some("mobile") => format!(
            " AND EXISTS (\
                SELECT 1 FROM analytics_sessions device_session \
                WHERE device_session.session_id = {col} \
                  AND device_session.is_mobile IS TRUE \
                OFFSET 0\
              )"
        ),
        Some("desktop") => format!(
            " AND EXISTS (\
                SELECT 1 FROM analytics_sessions known_session \
                WHERE known_session.session_id = {col} \
                OFFSET 0\
              ) \
              AND NOT EXISTS (\
                SELECT 1 FROM analytics_sessions device_session \
                WHERE device_session.session_id = {col} \
                  AND device_session.is_mobile IS TRUE \
                OFFSET 0\
              )"
        ),
        _ => String::new(),
    }
}

// ───────────────────────── Order statuses ─────────────────────────

#[derive(Debug, Serialize)]
pub struct OrderStatusRow {
    pub status: String,
    pub orders: i64,
}

/// Distinct `orders.status` values in range with counts. Powers the status
/// filter so the UI never hard-codes a vocabulary it can't see.
#[tauri::command]
pub async fn get_order_statuses(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<OrderStatusRow>> {
    let client = state.analytics_client().await?;
    let sql = "
        SELECT COALESCE(NULLIF(status, ''), 'unknown') AS status,
               COUNT(*)::bigint AS orders
        FROM orders
        WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND deleted_at IS NULL
        GROUP BY 1
        ORDER BY orders DESC;
    ";
    let rows = client.query(sql, &[&args.from, &args.to]).await?;
    Ok(rows
        .into_iter()
        .map(|r| OrderStatusRow {
            status: r.get("status"),
            orders: r.get("orders"),
        })
        .collect())
}

// ───────────────────────── Conversion funnel ─────────────────────────

#[derive(Debug, Serialize)]
pub struct ConversionFunnel {
    /// Distinct sessions in range (top of funnel).
    pub sessions: i64,
    /// Sessions that viewed at least one product page.
    pub viewed_product: i64,
    /// Sessions that added at least one item to the basket.
    pub added_basket: i64,
    /// Sessions that placed any order (all statuses).
    pub order_placed: i64,
    /// Sessions that placed an order in the "completed" status set.
    pub order_completed: i64,
}

fn conversion_funnel_sql(device: &Option<String>) -> String {
    format!(
        r#"
        WITH sampled_session_ids AS MATERIALIZED (
            SELECT sampled.session_id
            FROM analytics_sessions AS sampled
                TABLESAMPLE SYSTEM (2) REPEATABLE (20260714)
            WHERE sampled.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND sampled.session_id IS NOT NULL
            GROUP BY sampled.session_id
        ),
        sess AS MATERIALIZED (
            SELECT sampled_session_ids.session_id
            FROM sampled_session_ids
            WHERE TRUE{device}
        ),
        viewed_sessions AS (
            SELECT sess.session_id
            FROM sess
            WHERE EXISTS (
                SELECT 1
                FROM analytics_page_views product_view
                WHERE product_view.session_id = sess.session_id
                  AND product_view.received_at BETWEEN
                      ($1::timestamptz - interval '48 hours') AND
                      ($2::timestamptz + interval '48 hours')
                  AND product_view.occurred_at BETWEEN
                      $1::timestamptz AND $2::timestamptz
                  AND product_view.page_type = 'product_view'
                OFFSET 0
            )
        ),
        basket_sessions AS (
            SELECT sess.session_id
            FROM sess
            WHERE EXISTS (
                SELECT 1
                FROM analytics_basket basket
                WHERE basket.session_id = sess.session_id
                  AND basket.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
                  AND basket.action = 'BASKET_ACTION_ADD'
                OFFSET 0
            )
        ),
        order_sessions AS (
            SELECT
                orders.session_id,
                bool_or(orders.status = ANY($3::text[])) AS is_completed
            FROM orders
            JOIN sess ON sess.session_id = orders.session_id
            WHERE orders.created_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND orders.deleted_at IS NULL
            GROUP BY orders.session_id
        )
        SELECT
            (SELECT COUNT(*) FROM sess)::bigint * 50 AS sessions,
            (SELECT COUNT(*) FROM viewed_sessions)::bigint * 50 AS viewed_product,
            (SELECT COUNT(*) FROM basket_sessions)::bigint * 50 AS added_basket,
            (SELECT COUNT(*) FROM order_sessions)::bigint * 50 AS order_placed,
            (SELECT COUNT(*) FROM order_sessions WHERE is_completed)::bigint * 50 AS order_completed;
        "#,
        device = device_clause(device, "sampled_session_ids.session_id")
    )
}

#[tauri::command]
pub async fn get_conversion_funnel(
    state: State<'_, ConnectionState>,
    args: ConvArgs,
) -> AppResult<ConversionFunnel> {
    let client = state.analytics_client().await?;
    let sql = conversion_funnel_sql(&args.device);
    let params: [&(dyn ToSql + Sync); 3] = [&args.from, &args.to, &args.statuses];
    let row = client.query_one(&sql, &params).await?;
    Ok(ConversionFunnel {
        sessions: row.get("sessions"),
        viewed_product: row.get("viewed_product"),
        added_basket: row.get("added_basket"),
        order_placed: row.get("order_placed"),
        order_completed: row.get("order_completed"),
    })
}

// ───────────────────────── Conversion KPIs ─────────────────────────

#[derive(Debug, Serialize)]
pub struct ConversionKpis {
    pub sessions: i64,
    pub basket_sessions: i64,
    pub ordering_sessions: i64,
    pub completed_sessions: i64,
    pub orders_placed: i64,
    pub orders_completed: i64,
    pub revenue_placed: f64,
    pub revenue_completed: f64,
    pub attributed_orders: i64,
    pub total_orders: i64,
    // Derived rates / values.
    pub session_to_basket_rate: f64,
    pub basket_to_order_rate: f64,
    pub session_to_order_rate: f64,
    pub cart_abandonment_rate: f64,
    pub avg_order_value: f64,
    pub revenue_per_session: f64,
    pub attributed_pct: f64,
}

fn conversion_kpis_sql(device: &Option<String>) -> String {
    format!(
        r#"
        WITH sampled_session_ids AS MATERIALIZED (
            SELECT sampled.session_id
            FROM analytics_sessions AS sampled
                TABLESAMPLE SYSTEM (2) REPEATABLE (20260714)
            WHERE sampled.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND sampled.session_id IS NOT NULL
            GROUP BY sampled.session_id
        ),
        sess AS MATERIALIZED (
            SELECT sampled_session_ids.session_id
            FROM sampled_session_ids
            WHERE TRUE{device}
        ),
        basket_sessions AS (
            SELECT sess.session_id
            FROM sess
            WHERE EXISTS (
                SELECT 1
                FROM analytics_basket basket
                WHERE basket.session_id = sess.session_id
                  AND basket.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
                  AND basket.action = 'BASKET_ACTION_ADD'
                OFFSET 0
            )
        ),
        orders_in_range AS MATERIALIZED (
            SELECT
                o.session_id,
                o.total_price,
                (o.status = ANY($3::text[])) AS is_completed
            FROM orders o
            WHERE o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND o.deleted_at IS NULL{o_device}
        ),
        order_totals AS (
            SELECT
                COUNT(*) FILTER (WHERE session_id IS NOT NULL)::bigint AS attributed_orders,
                COUNT(*)::bigint AS total_orders,
                COUNT(*)::bigint AS orders_placed,
                COUNT(*) FILTER (WHERE is_completed)::bigint AS orders_completed,
                COALESCE(SUM(total_price), 0)::float8 AS revenue_placed,
                COALESCE(SUM(total_price) FILTER (WHERE is_completed), 0)::float8 AS revenue_completed
            FROM orders_in_range
        ),
        session_order_totals AS (
            SELECT
                COUNT(DISTINCT orders_in_range.session_id)::bigint AS ordering_sessions,
                COUNT(DISTINCT orders_in_range.session_id)
                    FILTER (WHERE orders_in_range.is_completed)::bigint AS completed_sessions
            FROM orders_in_range
            JOIN sess ON sess.session_id = orders_in_range.session_id
        )
        SELECT
            (SELECT COUNT(*) FROM sess)::bigint * 50 AS sessions,
            (SELECT COUNT(*) FROM basket_sessions)::bigint * 50 AS basket_sessions,
            session_order_totals.ordering_sessions * 50 AS ordering_sessions,
            session_order_totals.completed_sessions * 50 AS completed_sessions,
            order_totals.orders_placed,
            order_totals.orders_completed,
            order_totals.revenue_placed,
            order_totals.revenue_completed,
            order_totals.attributed_orders,
            order_totals.total_orders
        FROM order_totals
        CROSS JOIN session_order_totals;
        "#,
        device = device_clause(device, "sampled_session_ids.session_id"),
        o_device = device_clause(device, "o.session_id")
    )
}

#[tauri::command]
pub async fn get_conversion_kpis(
    state: State<'_, ConnectionState>,
    args: ConvArgs,
) -> AppResult<ConversionKpis> {
    let client = state.analytics_client().await?;
    let sql = conversion_kpis_sql(&args.device);
    let params: [&(dyn ToSql + Sync); 3] = [&args.from, &args.to, &args.statuses];
    let row = client.query_one(&sql, &params).await?;

    let sessions: i64 = row.get("sessions");
    let basket_sessions: i64 = row.get("basket_sessions");
    let ordering_sessions: i64 = row.get("ordering_sessions");
    let completed_sessions: i64 = row.get("completed_sessions");
    let orders_placed: i64 = row.get("orders_placed");
    let orders_completed: i64 = row.get("orders_completed");
    let revenue_placed: f64 = row.get("revenue_placed");
    let revenue_completed: f64 = row.get("revenue_completed");
    let attributed_orders: i64 = row.get("attributed_orders");
    let total_orders: i64 = row.get("total_orders");

    let div = |a: i64, b: i64| if b > 0 { a as f64 / b as f64 } else { 0.0 };
    let session_to_basket_rate = div(basket_sessions, sessions);
    let basket_to_order_rate = div(completed_sessions, basket_sessions);
    let session_to_order_rate = div(completed_sessions, sessions);
    let cart_abandonment_rate = if basket_sessions > 0 {
        1.0 - basket_to_order_rate
    } else {
        0.0
    };
    let avg_order_value = if orders_completed > 0 {
        revenue_completed / orders_completed as f64
    } else {
        0.0
    };
    let revenue_per_session = if sessions > 0 {
        revenue_completed / sessions as f64
    } else {
        0.0
    };
    let attributed_pct = div(attributed_orders, total_orders);

    Ok(ConversionKpis {
        sessions,
        basket_sessions,
        ordering_sessions,
        completed_sessions,
        orders_placed,
        orders_completed,
        revenue_placed,
        revenue_completed,
        attributed_orders,
        total_orders,
        session_to_basket_rate,
        basket_to_order_rate,
        session_to_order_rate,
        cart_abandonment_rate,
        avg_order_value,
        revenue_per_session,
        attributed_pct,
    })
}

#[cfg(test)]
mod report_sql_tests {
    const SOURCE: &str = include_str!("conversion.rs");

    fn section(start: &str, end: &str) -> &'static str {
        let start = SOURCE.find(start).expect("SQL builder start");
        let rest = &SOURCE[start..];
        let end = rest.find(end).expect("SQL builder end");
        &rest[..end]
    }

    fn assert_fast_sampled_session_range(sql: &str) {
        assert!(
            sql.contains("analytics_sessions AS sampled")
                && sql.contains("TABLESAMPLE SYSTEM (2)")
                && sql.contains("REPEATABLE (20260714)"),
            "conversion must read only a stable two-percent session sample"
        );
        assert!(
            sql.contains("sampled.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"),
            "event time must remain the authoritative range"
        );
        assert!(
            sql.contains("sampled_session_ids AS MATERIALIZED"),
            "only sampled distinct session IDs may be reused"
        );
        assert!(
            !sql.contains("FROM analytics_page_views pv")
                && !sql.contains("page_view_sessions AS MATERIALIZED")
                && !sql.contains("session_activity AS MATERIALIZED"),
            "conversion must not group the complete page-view range"
        );
    }

    #[test]
    fn report_sql_device_filters_use_session_id_index_probes() {
        let sql = section(
            "fn device_clause",
            "// ───────────────────────── Order statuses",
        );

        assert!(sql.contains("EXISTS") && sql.contains("NOT EXISTS"));
        assert!(sql.contains("device_session.session_id = {col}"));
        assert!(!sql.contains("GROUP BY session_id"));
    }

    #[test]
    fn report_sql_funnel_aggregates_each_source_once() {
        let sql = section(
            "fn conversion_funnel_sql",
            "pub async fn get_conversion_funnel",
        );

        assert_fast_sampled_session_range(sql);
        assert!(sql.contains("FROM analytics_page_views product_view"));
        assert!(sql.contains("product_view.session_id = sess.session_id"));
        assert!(sql.contains("product_view.received_at BETWEEN"));
        assert!(sql.contains("EXISTS (") && sql.contains("FROM analytics_basket basket"));
        assert_eq!(sql.matches("FROM orders").count(), 1);
        assert!(sql.matches("* 50").count() >= 5);
        assert!(!sql.contains("IN (SELECT session_id FROM sess)"));
    }

    #[test]
    fn report_sql_kpis_reuse_compact_sessions_and_orders() {
        let sql = section("fn conversion_kpis_sql", "pub async fn get_conversion_kpis");

        assert_fast_sampled_session_range(sql);
        assert_eq!(sql.matches("FROM analytics_page_views").count(), 0);
        assert!(sql.contains("orders_in_range AS MATERIALIZED"));
        assert!(sql.contains("EXISTS (") && sql.contains("FROM analytics_basket basket"));
        assert_eq!(sql.matches("FROM orders o").count(), 1);
        assert!(sql.matches("* 50").count() >= 4);
        assert!(!sql.contains("IN (SELECT session_id FROM sess)"));
    }

    #[test]
    fn conversion_queries_wait_for_status_initialization() {
        let funnel =
            include_str!("../../../src/widgets/conversion-funnel/model/use-conversion-funnel.ts");
        let kpis =
            include_str!("../../../src/widgets/conversion-kpis/model/use-conversion-kpis.ts");

        for hook in [funnel, kpis] {
            assert!(hook.contains("const initialized = useConversionFilterStore"));
            assert!(hook.contains("enabled: initialized"));
        }
    }
}
