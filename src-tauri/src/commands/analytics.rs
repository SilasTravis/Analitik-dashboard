use std::collections::HashMap;

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio_postgres::types::ToSql;

use crate::db::error::{AppError, AppResult};
use crate::db::pool::ConnectionState;

#[derive(Debug, Deserialize)]
pub struct RangeArgs {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

/// `[&from, &to]` ready to splice into a `WHERE col BETWEEN $1 AND $2`.
fn params(args: &RangeArgs) -> [&(dyn ToSql + Sync); 2] {
    [&args.from, &args.to]
}

// ───────────────────────── KPI overview ─────────────────────────

#[derive(Debug, Serialize)]
pub struct KpiOverview {
    pub visits: i64,
    pub sessions: i64,
    pub orders: i64,
    pub revenue: f64,
    pub avg_order_value: f64,
    pub conversion_rate: f64,
}

#[tauri::command]
pub async fn get_kpi_overview(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<KpiOverview> {
    let client = state.client().await?;

    let sql = "
        WITH
        v AS (SELECT COUNT(*)::bigint AS c
              FROM analytics_page_views
              WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz),
        s AS (SELECT COUNT(DISTINCT session_id)::bigint AS c
              FROM analytics_sessions
              WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz),
        o AS (SELECT COUNT(*)::bigint AS c,
                     COALESCE(SUM(total_price), 0)::float8 AS rev
              FROM orders
              WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
                AND deleted_at IS NULL)
        SELECT v.c AS visits, s.c AS sessions, o.c AS orders, o.rev AS revenue
        FROM v, s, o;
    ";
    let row = client.query_one(sql, &params(&args)).await?;
    let visits: i64 = row.get("visits");
    let sessions: i64 = row.get("sessions");
    let orders: i64 = row.get("orders");
    let revenue: f64 = row.get("revenue");
    let aov = if orders > 0 {
        revenue / (orders as f64)
    } else {
        0.0
    };
    let conv = if sessions > 0 {
        (orders as f64) / (sessions as f64)
    } else {
        0.0
    };
    Ok(KpiOverview {
        visits,
        sessions,
        orders,
        revenue,
        avg_order_value: aov,
        conversion_rate: conv,
    })
}

// ───────────────────────── Daily traffic ─────────────────────────

#[derive(Debug, Serialize)]
pub struct DailyTraffic {
    pub date: NaiveDate,
    pub visits: i64,
    pub sessions: i64,
}

#[tauri::command]
pub async fn get_daily_traffic(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<DailyTraffic>> {
    let client = state.client().await?;
    let sql = "
        WITH days AS (
            SELECT generate_series(
                date_trunc('day', $1::timestamptz),
                date_trunc('day', $2::timestamptz),
                interval '1 day'
            )::date AS day
        ),
        v AS (
            SELECT date_trunc('day', occurred_at)::date AS day, COUNT(*)::bigint AS c
            FROM analytics_page_views
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
            GROUP BY 1
        ),
        s AS (
            SELECT date_trunc('day', occurred_at)::date AS day,
                   COUNT(DISTINCT session_id)::bigint AS c
            FROM analytics_sessions
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
            GROUP BY 1
        )
        SELECT d.day, COALESCE(v.c, 0) AS visits, COALESCE(s.c, 0) AS sessions
        FROM days d
        LEFT JOIN v USING (day)
        LEFT JOIN s USING (day)
        ORDER BY d.day;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| DailyTraffic {
            date: r.get("day"),
            visits: r.get("visits"),
            sessions: r.get("sessions"),
        })
        .collect())
}

// ───────────────────────── Daily revenue ─────────────────────────

#[derive(Debug, Serialize)]
pub struct DailyRevenue {
    pub date: NaiveDate,
    pub orders: i64,
    pub revenue: f64,
}

#[tauri::command]
pub async fn get_daily_revenue(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<DailyRevenue>> {
    let client = state.client().await?;
    let sql = "
        WITH days AS (
            SELECT generate_series(
                date_trunc('day', $1::timestamptz),
                date_trunc('day', $2::timestamptz),
                interval '1 day'
            )::date AS day
        ),
        o AS (
            SELECT date_trunc('day', created_at)::date AS day,
                   COUNT(*)::bigint AS orders,
                   COALESCE(SUM(total_price), 0)::float8 AS revenue
            FROM orders
            WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND deleted_at IS NULL
            GROUP BY 1
        )
        SELECT d.day, COALESCE(o.orders, 0) AS orders, COALESCE(o.revenue, 0) AS revenue
        FROM days d
        LEFT JOIN o USING (day)
        ORDER BY d.day;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| DailyRevenue {
            date: r.get("day"),
            orders: r.get("orders"),
            revenue: r.get("revenue"),
        })
        .collect())
}

// ───────────────────────── Devices ─────────────────────────

#[derive(Debug, Serialize)]
pub struct DeviceBucket {
    pub device: String,
    pub count: i64,
}

#[tauri::command]
pub async fn get_devices_overview(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<DeviceBucket>> {
    let client = state.client().await?;
    let sql = "
        SELECT
            CASE WHEN is_mobile THEN 'Mobile' ELSE 'Desktop' END AS device,
            COUNT(DISTINCT session_id)::bigint AS c
        FROM analytics_sessions
        WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY 1
        ORDER BY c DESC;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| DeviceBucket {
            device: r.get("device"),
            count: r.get("c"),
        })
        .collect())
}

// ───────────────────────── Browsers ─────────────────────────

#[derive(Debug, Serialize)]
pub struct BrowserBucket {
    pub browser: String,
    pub count: i64,
}

#[tauri::command]
pub async fn get_browsers_overview(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<BrowserBucket>> {
    let client = state.client().await?;
    let sql = "
        SELECT COALESCE(NULLIF(browser, ''), 'Unknown') AS browser,
               COUNT(DISTINCT session_id)::bigint AS c
        FROM analytics_sessions
        WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY 1
        ORDER BY c DESC
        LIMIT 6;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| BrowserBucket {
            browser: r.get("browser"),
            count: r.get("c"),
        })
        .collect())
}

// ───────────────────────── Top products ─────────────────────────

#[derive(Debug, Serialize)]
pub struct ProductRow {
    pub sap_code: String,
    pub name: String,
    pub purchases: i64,
    pub revenue: f64,
}

#[tauri::command]
pub async fn get_top_products(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<ProductRow>> {
    let client = state.client().await?;
    let sql = "
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
        JOIN orders o ON o.id = op.order_id
        LEFT JOIN products p ON p.sap_code = op.sap_code
        WHERE o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND o.deleted_at IS NULL
        GROUP BY op.sap_code, p.name_ru, p.name_uz, p.name_kr
        ORDER BY purchases DESC
        LIMIT 10;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| ProductRow {
            sap_code: r.get("sap_code"),
            name: r.get("name"),
            purchases: r.get("purchases"),
            revenue: r.get("revenue"),
        })
        .collect())
}

// ───────────────────────── Order sources ─────────────────────────

#[derive(Debug, Serialize)]
pub struct SourceRow {
    pub source: String,
    pub orders: i64,
    pub revenue: f64,
}

#[tauri::command]
pub async fn get_order_sources(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<SourceRow>> {
    let client = state.client().await?;
    let sql = "
        SELECT COALESCE(NULLIF(order_source_type, ''), 'direct') AS source,
               COUNT(*)::bigint AS orders,
               COALESCE(SUM(total_price), 0)::float8 AS revenue
        FROM orders
        WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND deleted_at IS NULL
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 10;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| SourceRow {
            source: r.get("source"),
            orders: r.get("orders"),
            revenue: r.get("revenue"),
        })
        .collect())
}

// ───────────────────────── UTM sources (visits) ─────────────────────────

#[derive(Debug, Serialize)]
pub struct UtmRow {
    pub source: String,
    pub visits: i64,
}

#[tauri::command]
pub async fn get_utm_sources(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<UtmRow>> {
    let client = state.client().await?;
    let sql = "
        SELECT COALESCE(NULLIF(utm_source, ''), 'direct') AS source,
               COUNT(*)::bigint AS visits
        FROM analytics_page_views
        WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY 1
        ORDER BY visits DESC
        LIMIT 10;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| UtmRow {
            source: r.get("source"),
            visits: r.get("visits"),
        })
        .collect())
}

// ───────────────────────── Geo ─────────────────────────

#[derive(Debug, Serialize)]
pub struct GeoRow {
    pub country: String,
    pub city: String,
    pub visits: i64,
}

#[tauri::command]
pub async fn get_geo_breakdown(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<GeoRow>> {
    let client = state.client().await?;
    let sql = "
        SELECT
            COALESCE(NULLIF(viewer_country, ''), 'Unknown') AS country,
            COALESCE(NULLIF(viewer_city, ''), '—') AS city,
            COUNT(*)::bigint AS visits
        FROM analytics_page_views
        WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY 1, 2
        ORDER BY visits DESC
        LIMIT 10;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| GeoRow {
            country: r.get("country"),
            city: r.get("city"),
            visits: r.get("visits"),
        })
        .collect())
}

// ───────────────────────── Period comparison ─────────────────────────

#[derive(Debug, Deserialize)]
pub struct ComparisonArgs {
    /// "week" | "month" | "year"
    pub granularity: String,
    /// How many periods (including current) to return.
    pub count: i32,
}

#[derive(Debug, Serialize)]
pub struct PeriodMetrics {
    pub period_start: DateTime<Utc>,
    pub label: String,
    pub visits: i64,
    pub sessions: i64,
    pub orders: i64,
    pub revenue: f64,
}

fn validate_granularity(g: &str) -> AppResult<&'static str> {
    match g {
        "week" => Ok("week"),
        "month" => Ok("month"),
        "year" => Ok("year"),
        _ => Err(AppError::Message(format!("invalid granularity: {g}"))),
    }
}

fn validate_comparison_count(granularity: &str, count: i32) -> AppResult<()> {
    let maximum = match granularity {
        "week" => 52,
        "month" => 24,
        "year" => 5,
        _ => return Err(AppError::Message("invalid comparison granularity".into())),
    };

    if (1..=maximum).contains(&count) {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "comparison count must be between 1 and {maximum} for {granularity}"
        )))
    }
}

const COMPARISON_SOURCE_TYPES_SQL: &str = r#"
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

const SET_COMPARISON_WORK_MEM_SQL: &str = "SET work_mem = '96MB'";
const RESET_COMPARISON_WORK_MEM_SQL: &str = "RESET work_mem";

fn finish_comparison_after_reset<T, E>(
    query_result: Result<T, E>,
    reset_result: Result<(), E>,
) -> Result<T, E> {
    match query_result {
        Err(query_error) => Err(query_error),
        Ok(value) => reset_result.map(|()| value),
    }
}

fn comparison_visits_sql(granularity: &str) -> String {
    format!(
        r#"
        WITH bounds AS MATERIALIZED (
            SELECT
                date_trunc('{granularity}', NOW() - make_interval({granularity}s => ($1 - 1)::int)) AS start_at,
                date_trunc('{granularity}', NOW()) + interval '1 {granularity}' AS end_at
        ),
        periods AS (
            SELECT generate_series(
                (SELECT start_at FROM bounds),
                (SELECT end_at FROM bounds) - interval '1 {granularity}',
                interval '1 {granularity}'
            ) AS period_start
        ),
        visit_rollups AS (
            SELECT
                date_trunc('{granularity}', page_views.received_at) AS period_start,
                COUNT(*)::bigint AS visits
            FROM analytics_page_views page_views
            CROSS JOIN bounds
            WHERE page_views.received_at >= bounds.start_at
              AND page_views.received_at < bounds.end_at
            GROUP BY 1
        )
        SELECT periods.period_start,
               COALESCE(visit_rollups.visits, 0)::bigint AS visits
        FROM periods
        LEFT JOIN visit_rollups USING (period_start)
        ORDER BY periods.period_start;
        "#
    )
}

fn comparison_sessions_sql(granularity: &str) -> String {
    format!(
        r#"
        WITH bounds AS MATERIALIZED (
            SELECT
                date_trunc('{granularity}', NOW() - make_interval({granularity}s => ($1 - 1)::int)) AS start_at,
                date_trunc('{granularity}', NOW()) + interval '1 {granularity}' AS end_at
        ),
        periods AS (
            SELECT generate_series(
                (SELECT start_at FROM bounds),
                (SELECT end_at FROM bounds) - interval '1 {granularity}',
                interval '1 {granularity}'
            ) AS period_start
        )
        SELECT
            periods.period_start,
            COALESCE(session_counts.sessions, 0)::bigint AS sessions
        FROM periods
        LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT sessions.session_id)::bigint AS sessions
            FROM (
                SELECT indexed_sessions.session_id
                FROM analytics_sessions indexed_sessions
                WHERE indexed_sessions.source_type = ANY($2::text[])
                  AND indexed_sessions.session_registered_at >=
                      (periods.period_start AT TIME ZONE 'UTC')
                  AND indexed_sessions.session_registered_at <
                      ((periods.period_start + interval '1 {granularity}') AT TIME ZONE 'UTC')
                  AND indexed_sessions.session_id IS NOT NULL

                UNION ALL

                SELECT null_source_sessions.session_id
                FROM analytics_sessions null_source_sessions
                WHERE null_source_sessions.source_type IS NULL
                  AND null_source_sessions.session_registered_at >=
                      (periods.period_start AT TIME ZONE 'UTC')
                  AND null_source_sessions.session_registered_at <
                      ((periods.period_start + interval '1 {granularity}') AT TIME ZONE 'UTC')
                  AND null_source_sessions.session_id IS NOT NULL
            ) sessions
        ) session_counts ON TRUE
        ORDER BY periods.period_start;
        "#
    )
}

fn comparison_orders_sql(granularity: &str) -> String {
    format!(
        r#"
        WITH bounds AS MATERIALIZED (
            SELECT
                date_trunc('{granularity}', NOW() - make_interval({granularity}s => ($1 - 1)::int))::timestamp AS start_at,
                (date_trunc('{granularity}', NOW()) + interval '1 {granularity}')::timestamp AS end_at
        )
        SELECT
            date_trunc('{granularity}', orders.created_at)::timestamptz AS period_start,
            COUNT(*)::bigint AS orders,
            COALESCE(SUM(orders.total_price), 0)::float8 AS revenue
        FROM orders
        CROSS JOIN bounds
        WHERE orders.created_at >= bounds.start_at
          AND orders.created_at < bounds.end_at
          AND orders.deleted_at IS NULL
        GROUP BY 1;
        "#
    )
}

#[tauri::command]
pub async fn get_period_comparison(
    state: State<'_, ConnectionState>,
    args: ComparisonArgs,
) -> AppResult<Vec<PeriodMetrics>> {
    // `g` is allowlisted, so interpolating it into date_trunc / interval is
    // safe — Postgres won't accept a bind parameter there anyway.
    let g = validate_granularity(&args.granularity)?;
    validate_comparison_count(g, args.count)?;
    let visits_sql = comparison_visits_sql(g);
    let sessions_sql = comparison_sessions_sql(g);
    let orders_sql = comparison_orders_sql(g);

    let (visits_client, sessions_client, orders_client) =
        tokio::try_join!(state.client(), state.client(), state.client())?;

    let visits_future =
        async { Ok::<_, AppError>(visits_client.query(&visits_sql, &[&args.count]).await?) };
    let sessions_future = async {
        let source_rows = sessions_client
            .query(COMPARISON_SOURCE_TYPES_SQL, &[])
            .await?;
        let source_types: Vec<String> = source_rows
            .into_iter()
            .map(|row| row.try_get("source_type"))
            .collect::<Result<_, tokio_postgres::Error>>()?;

        sessions_client
            .batch_execute(SET_COMPARISON_WORK_MEM_SQL)
            .await?;
        let query_result = sessions_client
            .query(&sessions_sql, &[&args.count, &source_types])
            .await;
        let reset_result = sessions_client
            .batch_execute(RESET_COMPARISON_WORK_MEM_SQL)
            .await;
        Ok::<_, AppError>(finish_comparison_after_reset(query_result, reset_result)?)
    };
    let orders_future =
        async { Ok::<_, AppError>(orders_client.query(&orders_sql, &[&args.count]).await?) };

    let (visit_rows, session_rows, order_rows) =
        tokio::try_join!(visits_future, sessions_future, orders_future)?;

    let sessions_by_period: HashMap<DateTime<Utc>, i64> = session_rows
        .into_iter()
        .map(|row| Ok((row.try_get("period_start")?, row.try_get("sessions")?)))
        .collect::<Result<_, tokio_postgres::Error>>()?;
    let orders_by_period: HashMap<DateTime<Utc>, (i64, f64)> = order_rows
        .into_iter()
        .map(|row| {
            Ok((
                row.try_get("period_start")?,
                (row.try_get("orders")?, row.try_get("revenue")?),
            ))
        })
        .collect::<Result<_, tokio_postgres::Error>>()?;

    visit_rows
        .into_iter()
        .map(|row| {
            let period_start: DateTime<Utc> = row.try_get("period_start")?;
            let label = match g {
                "week" => format!("W{}", period_start.format("%G-%V")),
                "month" => period_start.format("%b %Y").to_string(),
                "year" => period_start.format("%Y").to_string(),
                _ => period_start.to_rfc3339(),
            };

            let (orders, revenue) = orders_by_period
                .get(&period_start)
                .copied()
                .unwrap_or((0, 0.0));

            Ok(PeriodMetrics {
                period_start,
                label,
                visits: row.try_get("visits")?,
                sessions: sessions_by_period.get(&period_start).copied().unwrap_or(0),
                orders,
                revenue,
            })
        })
        .collect()
}

// ───────────────────────── Campaigns & Referrers ─────────────────────────

#[derive(Debug, Serialize)]
pub struct CampaignRow {
    pub campaign: String,
    pub page_views: i64,
    pub sessions: i64,
    pub baskets: i64,
    pub orders: i64,
    pub revenue: f64,
}

const CAMPAIGNS_SQL: &str = r#"
    WITH session_campaign_counts AS MATERIALIZED (
        SELECT
            session_id,
            utm_campaign AS campaign,
            COUNT(*)::bigint AS page_views
        FROM analytics_page_views
        WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours')
                              AND ($2::timestamptz + interval '48 hours')
          AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND utm_campaign IS NOT NULL
          AND utm_campaign != ''
        GROUP BY session_id, utm_campaign
    ),
    session_campaigns AS MATERIALIZED (
        SELECT session_id, MIN(campaign) AS campaign
        FROM session_campaign_counts
        GROUP BY session_id
    ),
    campaign_pv AS (
        SELECT campaign, SUM(page_views)::bigint AS page_views
        FROM session_campaign_counts
        GROUP BY 1
    ),
    campaign_sessions AS (
        SELECT campaign, COUNT(*)::bigint AS sessions
        FROM session_campaigns
        GROUP BY 1
    ),
    campaign_basket AS (
        SELECT session_campaigns.campaign, COUNT(*)::bigint AS baskets
        FROM session_campaigns
        JOIN analytics_basket basket
          ON basket.session_id = session_campaigns.session_id
         AND basket.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY 1
    ),
    campaign_orders AS (
        SELECT
            session_campaigns.campaign,
            COUNT(*)::bigint AS orders,
            COALESCE(SUM(orders.total_price), 0)::float8 AS revenue
        FROM session_campaigns
        JOIN orders
          ON orders.session_id = session_campaigns.session_id
         AND orders.created_at BETWEEN $1::timestamptz AND $2::timestamptz
         AND orders.deleted_at IS NULL
        GROUP BY 1
    )
    SELECT
        campaign_pv.campaign,
        campaign_pv.page_views,
        COALESCE(campaign_sessions.sessions, 0) AS sessions,
        COALESCE(campaign_basket.baskets, 0) AS baskets,
        COALESCE(campaign_orders.orders, 0) AS orders,
        COALESCE(campaign_orders.revenue, 0) AS revenue
    FROM campaign_pv
    LEFT JOIN campaign_sessions USING (campaign)
    LEFT JOIN campaign_basket USING (campaign)
    LEFT JOIN campaign_orders USING (campaign)
    ORDER BY sessions DESC;
"#;

#[tauri::command]
pub async fn get_campaigns_report(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<CampaignRow>> {
    let client = state.client().await?;
    let rows = client.query(CAMPAIGNS_SQL, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| CampaignRow {
            campaign: r.get("campaign"),
            page_views: r.get("page_views"),
            sessions: r.get("sessions"),
            baskets: r.get("baskets"),
            orders: r.get("orders"),
            revenue: r.get("revenue"),
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferrerRow {
    pub referrer: String,
    #[serde(rename = "page_views")]
    pub page_views: i64,
    pub sessions: i64,
}

#[tauri::command]
pub async fn get_referrers_report(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<ReferrerRow>> {
    let client = state.client().await?;
    let sql = "
        SELECT 
            CASE 
                WHEN referrer IS NULL OR referrer = '' OR referrer = 'not_available' OR referrer = 'direct' THEN 'Direct'
                ELSE COALESCE(
                    NULLIF(regexp_replace(substring(referrer from '://([^/]+)'), '^www\\.', ''), ''),
                    referrer,
                    'Direct'
                )
            END AS referrer,
            COUNT(*)::bigint AS page_views,
            COUNT(DISTINCT session_id)::bigint AS sessions
        FROM analytics_page_views
        WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours')
                              AND ($2::timestamptz + interval '48 hours')
          AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY 1
        ORDER BY page_views DESC, sessions DESC
        LIMIT 50;
    ";
    let rows = client.query(sql, &params(&args)).await?;
    Ok(rows
        .into_iter()
        .map(|r| ReferrerRow {
            referrer: r.get("referrer"),
            page_views: r.get("page_views"),
            sessions: r.get("sessions"),
        })
        .collect())
}

#[cfg(test)]
mod report_sql_tests {
    use super::{validate_comparison_count, CAMPAIGNS_SQL};

    #[test]
    fn comparison_uses_existing_time_indexes_without_occurred_at() {
        let source = include_str!("analytics.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("production source");
        let start = production.find("fn comparison_visits_sql").unwrap_or(0);
        let end = production
            .find("// ───────────────────────── Campaigns & Referrers")
            .expect("campaign section");
        let comparison = &production[start..end];

        assert!(comparison.contains("fn comparison_visits_sql"));
        assert!(comparison.contains("fn comparison_sessions_sql"));
        assert!(comparison.contains("fn comparison_orders_sql"));
        assert!(comparison.contains("COMPARISON_SOURCE_TYPES_SQL"));
        assert!(comparison.contains("tokio::try_join!"));
        assert!(!comparison.contains("occurred_at"));
        assert!(comparison.contains("page_views.received_at >= bounds.start_at"));
        assert!(comparison.contains("date_trunc('{granularity}', page_views.received_at)"));
        assert!(comparison.contains("indexed_sessions.session_registered_at >="));
        assert!(comparison.contains("indexed_sessions.source_type = ANY($2::text[])"));
        assert!(comparison.contains("null_source_sessions.source_type IS NULL"));
        assert!(comparison.contains("SET_COMPARISON_WORK_MEM_SQL"));
        assert!(comparison.contains("RESET_COMPARISON_WORK_MEM_SQL"));
        assert_eq!(comparison.matches("FROM analytics_page_views").count(), 1);
        assert_eq!(comparison.matches("FROM analytics_sessions").count(), 2);
        assert_eq!(comparison.matches("FROM orders").count(), 1);
        assert!(comparison.contains("COUNT(DISTINCT sessions.session_id)::bigint AS sessions"));
        assert!(comparison.contains("orders.created_at >= bounds.start_at"));
    }

    #[test]
    fn comparison_rejects_ranges_larger_than_the_ui_can_request() {
        let production = include_str!("analytics.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("production source");

        assert!(production.contains("fn validate_comparison_count"));
        assert!(production.contains("validate_comparison_count(g, args.count)?"));
        assert!(validate_comparison_count("week", 52).is_ok());
        assert!(validate_comparison_count("month", 24).is_ok());
        assert!(validate_comparison_count("year", 5).is_ok());
        assert!(validate_comparison_count("week", 0).is_err());
        assert!(validate_comparison_count("week", 53).is_err());
        assert!(validate_comparison_count("month", 25).is_err());
        assert!(validate_comparison_count("year", 6).is_err());
    }

    #[test]
    fn comparison_periods_are_timestamptz_and_decode_without_panics() {
        let production = include_str!("analytics.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("production source");

        assert!(production.contains("date_trunc('{granularity}', page_views.received_at)"));
        assert!(production.contains("periods.period_start AT TIME ZONE 'UTC'"));
        assert!(production.contains(
            "date_trunc('{granularity}', orders.created_at)::timestamptz AS period_start"
        ));
        assert!(production.contains("row.try_get(\"period_start\")"));
        assert!(!production.contains("row.get(\"period_start\")"));
    }

    #[test]
    fn comparison_request_reuses_recent_results_without_retry_storms() {
        let query = include_str!("../../../src/entities/analytics/model/use-comparison.ts");

        assert!(query.contains("staleTime: 5 * 60 * 1000"));
        assert!(query.contains("gcTime: 30 * 60 * 1000"));
        assert!(query.contains("refetchOnWindowFocus: false"));
        assert!(query.contains("retry: 1"));
    }

    #[test]
    fn report_sql_campaigns_scans_the_page_view_range_once() {
        let sql = CAMPAIGNS_SQL;

        assert!(
            sql.contains("session_campaign_counts AS MATERIALIZED"),
            "page views must aggregate before any reusable set is materialized"
        );
        assert!(
            sql.contains("received_at BETWEEN"),
            "campaign page views need an indexed candidate range"
        );
        assert_eq!(sql.matches("FROM analytics_page_views").count(), 1);
        assert!(
            sql.contains("GROUP BY session_id, utm_campaign"),
            "the raw scan must collapse rows to the minimal session/campaign shape"
        );
        assert!(
            sql.contains("SUM(page_views)::bigint AS page_views"),
            "campaign totals must reuse the compact page-view counts"
        );
        assert!(
            !sql.contains("campaign_page_views AS MATERIALIZED"),
            "materializing every matching page view causes large temporary writes"
        );
    }

    #[test]
    fn report_sql_referrers_uses_the_page_view_time_index() {
        let source = include_str!("analytics.rs");
        let start = source
            .find("pub async fn get_referrers_report")
            .expect("referrers command");
        let sql = source[start..]
            .split("#[cfg(test)]")
            .next()
            .expect("referrers production source");

        assert!(
            sql.contains("received_at BETWEEN ($1::timestamptz - interval '48 hours')"),
            "referrers must use the existing received_at index"
        );
        assert!(
            sql.contains("occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"),
            "occurred_at must remain the authoritative range"
        );
    }
}
