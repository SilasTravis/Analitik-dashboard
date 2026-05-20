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
    let aov = if orders > 0 { revenue / (orders as f64) } else { 0.0 };
    let conv = if sessions > 0 { (orders as f64) / (sessions as f64) } else { 0.0 };
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

#[tauri::command]
pub async fn get_period_comparison(
    state: State<'_, ConnectionState>,
    args: ComparisonArgs,
) -> AppResult<Vec<PeriodMetrics>> {
    let client = state.client().await?;
    // `g` is allowlisted, so interpolating it into date_trunc / interval is
    // safe — Postgres won't accept a bind parameter there anyway.
    let g = validate_granularity(&args.granularity)?;
    let sql = format!(
        "
        WITH bounds AS (
            SELECT
                date_trunc('{g}', NOW() - make_interval({g}s => ($1 - 1)::int)) AS start_at,
                date_trunc('{g}', NOW()) + interval '1 {g}' AS end_at
        ),
        periods AS (
            SELECT generate_series(
                (SELECT start_at FROM bounds),
                (SELECT end_at FROM bounds) - interval '1 {g}',
                interval '1 {g}'
            ) AS period_start
        ),
        v AS (
            SELECT date_trunc('{g}', occurred_at) AS p, COUNT(*)::bigint AS c
            FROM analytics_page_views
            WHERE occurred_at >= (SELECT start_at FROM bounds)
            GROUP BY 1
        ),
        s AS (
            SELECT date_trunc('{g}', occurred_at) AS p,
                   COUNT(DISTINCT session_id)::bigint AS c
            FROM analytics_sessions
            WHERE occurred_at >= (SELECT start_at FROM bounds)
            GROUP BY 1
        ),
        o AS (
            SELECT date_trunc('{g}', created_at) AS p,
                   COUNT(*)::bigint AS orders,
                   COALESCE(SUM(total_price), 0)::float8 AS revenue
            FROM orders
            WHERE created_at >= (SELECT start_at FROM bounds)
              AND deleted_at IS NULL
            GROUP BY 1
        )
        SELECT
            p.period_start,
            COALESCE(v.c, 0) AS visits,
            COALESCE(s.c, 0) AS sessions,
            COALESCE(o.orders, 0) AS orders,
            COALESCE(o.revenue, 0) AS revenue
        FROM periods p
        LEFT JOIN v ON v.p = p.period_start
        LEFT JOIN s ON s.p = p.period_start
        LEFT JOIN o ON o.p = p.period_start
        ORDER BY p.period_start;
        "
    );
    let rows = client.query(&sql, &[&args.count]).await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let period_start: DateTime<Utc> = r.get("period_start");
            let label = match g {
                "week" => format!("W{}", period_start.format("%G-%V")),
                "month" => period_start.format("%b %Y").to_string(),
                "year" => period_start.format("%Y").to_string(),
                _ => period_start.to_rfc3339(),
            };
            PeriodMetrics {
                period_start,
                label,
                visits: r.get("visits"),
                sessions: r.get("sessions"),
                orders: r.get("orders"),
                revenue: r.get("revenue"),
            }
        })
        .collect())
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

#[tauri::command]
pub async fn get_campaigns_report(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<CampaignRow>> {
    let client = state.client().await?;
    let sql = "
        WITH session_campaigns AS (
            SELECT 
                session_id,
                MIN(utm_campaign) AS campaign
            FROM analytics_page_views
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND utm_campaign IS NOT NULL AND utm_campaign != ''
            GROUP BY session_id
        ),
        campaign_pv AS (
            SELECT 
                utm_campaign AS campaign,
                COUNT(*)::bigint AS page_views
            FROM analytics_page_views
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND utm_campaign IS NOT NULL AND utm_campaign != ''
            GROUP BY 1
        ),
        campaign_sessions AS (
            SELECT 
                campaign,
                COUNT(*)::bigint AS sessions
            FROM session_campaigns
            GROUP BY 1
        ),
        campaign_basket AS (
            SELECT 
                sc.campaign,
                COUNT(*)::bigint AS baskets
            FROM analytics_basket ab
            JOIN session_campaigns sc ON ab.session_id = sc.session_id
            WHERE ab.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
            GROUP BY 1
        ),
        campaign_orders AS (
            SELECT 
                sc.campaign,
                COUNT(*)::bigint AS orders,
                COALESCE(SUM(o.total_price), 0)::float8 AS revenue
            FROM orders o
            JOIN session_campaigns sc ON o.session_id = sc.session_id
            WHERE o.created_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND o.deleted_at IS NULL
            GROUP BY 1
        )
        SELECT 
            c.campaign,
            COALESCE(pv.page_views, 0) AS page_views,
            COALESCE(s.sessions, 0) AS sessions,
            COALESCE(b.baskets, 0) AS baskets,
            COALESCE(o.orders, 0) AS orders,
            COALESCE(o.revenue, 0) AS revenue
        FROM (
            SELECT campaign FROM campaign_pv
            UNION
            SELECT campaign FROM campaign_sessions
            UNION
            SELECT campaign FROM campaign_basket
            UNION
            SELECT campaign FROM campaign_orders
        ) c
        LEFT JOIN campaign_pv pv ON pv.campaign = c.campaign
        LEFT JOIN campaign_sessions s ON s.campaign = c.campaign
        LEFT JOIN campaign_basket b ON b.campaign = c.campaign
        LEFT JOIN campaign_orders o ON o.campaign = c.campaign
        ORDER BY sessions DESC;
    ";
    let rows = client.query(sql, &params(&args)).await?;
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
        WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
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

