use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;

/// Range + optional device segment for the performance page.
#[derive(Debug, Deserialize)]
pub struct PerfArgs {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    /// "mobile" | "desktop" | anything else / null = all devices.
    pub device: Option<String>,
}

/// SQL fragment restricting page views to a device segment.
///
/// A `session_id` can have several rows in `analytics_sessions`, and `is_mobile`
/// is nullable, so we collapse each session to a single verdict with
/// `bool_or(is_mobile)`:
///   * mobile  → the session has at least one mobile row.
///   * desktop → the session exists but never reports mobile (FALSE *or* NULL).
///
/// Treating NULL as desktop matches the Devices overview widget
/// (`CASE WHEN is_mobile THEN 'Mobile' ELSE 'Desktop'`) and makes the two
/// segments a clean partition of all sessions (no overlap, no NULL gap).
///
/// The returned string is a fixed literal (no user input interpolated), so it
/// is safe to splice into the query.
fn device_filter(device: &Option<String>) -> &'static str {
    match device.as_deref() {
        Some("mobile") => {
            " AND session_id IN (SELECT session_id FROM analytics_sessions \
              GROUP BY session_id HAVING bool_or(is_mobile))"
        }
        Some("desktop") => {
            " AND session_id IN (SELECT session_id FROM analytics_sessions \
              GROUP BY session_id HAVING NOT COALESCE(bool_or(is_mobile), FALSE))"
        }
        _ => "",
    }
}

// ───────────────────────── Overview (p75) ─────────────────────────

#[derive(Debug, Serialize)]
pub struct PerformanceOverview {
    /// Total page views in range (denominator for coverage).
    pub total_views: i64,
    /// Page views that carry at least an LCP sample.
    pub measured_views: i64,
    /// p75 in milliseconds; null when no samples.
    pub ttfb_p75: Option<f64>,
    pub fcp_p75: Option<f64>,
    pub lcp_p75: Option<f64>,
    /// CLS is a unitless score.
    pub cls_p75: Option<f64>,
    pub fid_p75: Option<f64>,
    pub dom_complete_p75: Option<f64>,
    pub full_load_p75: Option<f64>,
}

#[tauri::command]
pub async fn get_performance_overview(
    state: State<'_, ConnectionState>,
    args: PerfArgs,
) -> AppResult<PerformanceOverview> {
    let client = state.client().await?;
    let sql = format!(
        "
        SELECT
            COUNT(*)::bigint AS total_views,
            COUNT(lcp)::bigint AS measured_views,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb))::float8         AS ttfb_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp))::float8          AS fcp_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp))::float8          AS lcp_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY cls))::float8          AS cls_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY fid))::float8          AS fid_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY dom_complete))::float8 AS dom_complete_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY full_load))::float8    AS full_load_p75
        FROM analytics_page_views
        WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{filter};
    ",
        filter = device_filter(&args.device)
    );
    let row = client.query_one(&sql, &[&args.from, &args.to]).await?;
    Ok(PerformanceOverview {
        total_views: row.get("total_views"),
        measured_views: row.get("measured_views"),
        ttfb_p75: row.get("ttfb_p75"),
        fcp_p75: row.get("fcp_p75"),
        lcp_p75: row.get("lcp_p75"),
        cls_p75: row.get("cls_p75"),
        fid_p75: row.get("fid_p75"),
        dom_complete_p75: row.get("dom_complete_p75"),
        full_load_p75: row.get("full_load_p75"),
    })
}

// ───────────────────────── Daily trend (p75) ─────────────────────────

#[derive(Debug, Serialize)]
pub struct PerformanceTrendPoint {
    pub date: NaiveDate,
    pub lcp_p75: Option<f64>,
    pub fcp_p75: Option<f64>,
    pub full_load_p75: Option<f64>,
}

#[tauri::command]
pub async fn get_performance_trend(
    state: State<'_, ConnectionState>,
    args: PerfArgs,
) -> AppResult<Vec<PerformanceTrendPoint>> {
    let client = state.client().await?;
    let sql = format!(
        "
        WITH days AS (
            SELECT generate_series(
                date_trunc('day', $1::timestamptz),
                date_trunc('day', $2::timestamptz),
                interval '1 day'
            )::date AS day
        ),
        p AS (
            SELECT
                date_trunc('day', occurred_at)::date AS day,
                (percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp))::float8       AS lcp_p75,
                (percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp))::float8       AS fcp_p75,
                (percentile_cont(0.75) WITHIN GROUP (ORDER BY full_load))::float8 AS full_load_p75
            FROM analytics_page_views
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{filter}
            GROUP BY 1
        )
        SELECT d.day, p.lcp_p75, p.fcp_p75, p.full_load_p75
        FROM days d
        LEFT JOIN p USING (day)
        ORDER BY d.day;
    ",
        filter = device_filter(&args.device)
    );
    let rows = client.query(&sql, &[&args.from, &args.to]).await?;
    Ok(rows
        .into_iter()
        .map(|r| PerformanceTrendPoint {
            date: r.get("day"),
            lcp_p75: r.get("lcp_p75"),
            fcp_p75: r.get("fcp_p75"),
            full_load_p75: r.get("full_load_p75"),
        })
        .collect())
}

// ───────────────────────── Per page type (p75) ─────────────────────────

#[derive(Debug, Serialize)]
pub struct PagePerformanceRow {
    pub page_type: String,
    pub views_count: i64,
    pub measured_views: i64,
    pub lcp_p75: Option<f64>,
    pub cls_p75: Option<f64>,
    pub fid_p75: Option<f64>,
    pub full_load_p75: Option<f64>,
}

#[tauri::command]
pub async fn get_page_performance(
    state: State<'_, ConnectionState>,
    args: PerfArgs,
) -> AppResult<Vec<PagePerformanceRow>> {
    let client = state.client().await?;
    let sql = format!(
        "
        SELECT
            CASE WHEN page_type IS NULL OR page_type = '' THEN 'other' ELSE page_type END AS page_type,
            COUNT(*)::bigint AS views_count,
            COUNT(lcp)::bigint AS measured_views,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp))::float8       AS lcp_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY cls))::float8       AS cls_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY fid))::float8       AS fid_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY full_load))::float8 AS full_load_p75
        FROM analytics_page_views
        WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{filter}
        GROUP BY 1
        ORDER BY views_count DESC
        LIMIT 20;
    ",
        filter = device_filter(&args.device)
    );
    let rows = client.query(&sql, &[&args.from, &args.to]).await?;
    Ok(rows
        .into_iter()
        .map(|r| PagePerformanceRow {
            page_type: r.get("page_type"),
            views_count: r.get("views_count"),
            measured_views: r.get("measured_views"),
            lcp_p75: r.get("lcp_p75"),
            cls_p75: r.get("cls_p75"),
            fid_p75: r.get("fid_p75"),
            full_load_p75: r.get("full_load_p75"),
        })
        .collect())
}
