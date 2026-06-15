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
            " AND {col} IN (SELECT session_id FROM analytics_sessions \
             GROUP BY session_id HAVING bool_or(is_mobile))"
        ),
        Some("desktop") => format!(
            " AND {col} IN (SELECT session_id FROM analytics_sessions \
             GROUP BY session_id HAVING NOT COALESCE(bool_or(is_mobile), FALSE))"
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
    let client = state.client().await?;
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

#[tauri::command]
pub async fn get_conversion_funnel(
    state: State<'_, ConnectionState>,
    args: ConvArgs,
) -> AppResult<ConversionFunnel> {
    let client = state.client().await?;
    // Device clause is applied to the session universe (`sess`); every later
    // stage is constrained to `sess`, so the segment propagates for free.
    let sql = format!(
        "
        WITH sess AS (
            SELECT DISTINCT session_id
            FROM analytics_sessions
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{device}
        ),
        viewed AS (
            SELECT DISTINCT pv.session_id
            FROM analytics_page_views pv
            WHERE pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND pv.page_type = 'product_view'
              AND pv.session_id IN (SELECT session_id FROM sess)
        ),
        basket AS (
            SELECT DISTINCT b.session_id
            FROM analytics_basket b
            WHERE b.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND b.action = 'BASKET_ACTION_ADD'
              AND b.session_id IN (SELECT session_id FROM sess)
        ),
        placed AS (
            SELECT DISTINCT o.session_id
            FROM orders o
            WHERE o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND o.deleted_at IS NULL
              AND o.session_id IS NOT NULL
              AND o.session_id IN (SELECT session_id FROM sess)
        ),
        completed AS (
            SELECT DISTINCT o.session_id
            FROM orders o
            WHERE o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND o.deleted_at IS NULL
              AND o.session_id IS NOT NULL
              AND o.status = ANY($3::text[])
              AND o.session_id IN (SELECT session_id FROM sess)
        )
        SELECT
            (SELECT COUNT(*) FROM sess)::bigint      AS sessions,
            (SELECT COUNT(*) FROM viewed)::bigint     AS viewed_product,
            (SELECT COUNT(*) FROM basket)::bigint      AS added_basket,
            (SELECT COUNT(*) FROM placed)::bigint       AS order_placed,
            (SELECT COUNT(*) FROM completed)::bigint     AS order_completed;
    ",
        device = device_clause(&args.device, "session_id")
    );
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

#[tauri::command]
pub async fn get_conversion_kpis(
    state: State<'_, ConnectionState>,
    args: ConvArgs,
) -> AppResult<ConversionKpis> {
    let client = state.client().await?;
    let device = device_clause(&args.device, "session_id");
    // `o_device` filters orders by the device class of their session. NULL
    // session orders drop out of a device segment (and out of attribution).
    let o_device = device_clause(&args.device, "o.session_id");
    let sql = format!(
        "
        WITH sess AS (
            SELECT DISTINCT session_id
            FROM analytics_sessions
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{device}
        ),
        basket_sess AS (
            SELECT DISTINCT session_id
            FROM analytics_basket
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND action = 'BASKET_ACTION_ADD'
              AND session_id IN (SELECT session_id FROM sess)
        ),
        ord AS (
            SELECT o.session_id,
                   o.total_price,
                   (o.status = ANY($3::text[])) AS is_completed
            FROM orders o
            WHERE o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND o.deleted_at IS NULL{o_device}
        )
        SELECT
            (SELECT COUNT(*) FROM sess)::bigint                                  AS sessions,
            (SELECT COUNT(*) FROM basket_sess)::bigint                            AS basket_sessions,
            COUNT(*) FILTER (WHERE session_id IS NOT NULL)::bigint                 AS attributed_orders,
            COUNT(*)::bigint                                                        AS total_orders,
            COUNT(*)::bigint                                                         AS orders_placed,
            COUNT(*) FILTER (WHERE is_completed)::bigint                              AS orders_completed,
            COALESCE(SUM(total_price), 0)::float8                                      AS revenue_placed,
            COALESCE(SUM(total_price) FILTER (WHERE is_completed), 0)::float8           AS revenue_completed,
            COUNT(DISTINCT session_id) FILTER (
                WHERE session_id IN (SELECT session_id FROM sess))::bigint              AS ordering_sessions,
            COUNT(DISTINCT session_id) FILTER (
                WHERE is_completed AND session_id IN (SELECT session_id FROM sess))::bigint AS completed_sessions
        FROM ord;
    ",
        device = device,
        o_device = o_device
    );
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
