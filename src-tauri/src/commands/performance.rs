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

// Exact view counts still use every bounded row. Only the expensive ordered
// p75 aggregates use this stable 2% sample (roughly 1/50th of the sort input).
const PERFORMANCE_SAMPLE_SQL: &str = "hashtextextended(\
    COALESCE(pv.page_view_id::text, pv.session_id::text, pv.occurred_at::text), 0\
) % 50 = 0";

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
            " AND EXISTS (\
                SELECT 1 FROM analytics_sessions device_session \
                WHERE device_session.session_id = pv.session_id \
                  AND device_session.is_mobile IS TRUE \
                OFFSET 0\
              )"
        }
        Some("desktop") => {
            " AND EXISTS (\
                SELECT 1 FROM analytics_sessions known_session \
                WHERE known_session.session_id = pv.session_id \
                OFFSET 0\
              ) \
              AND NOT EXISTS (\
                SELECT 1 FROM analytics_sessions mobile_session \
                WHERE mobile_session.session_id = pv.session_id \
                  AND mobile_session.is_mobile IS TRUE \
                OFFSET 0\
              )"
        }
        _ => "",
    }
}

fn performance_overview_sql(device: &Option<String>) -> String {
    format!(
        r#"
        SELECT
            COUNT(*)::bigint AS total_views,
            COUNT(lcp)::bigint AS measured_views,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY ttfb)
                FILTER (WHERE percentile_sample))::float8 AS ttfb_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp)
                FILTER (WHERE percentile_sample))::float8 AS fcp_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp)
                FILTER (WHERE percentile_sample))::float8 AS lcp_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY cls)
                FILTER (WHERE percentile_sample))::float8 AS cls_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY fid)
                FILTER (WHERE percentile_sample))::float8 AS fid_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY dom_complete)
                FILTER (WHERE percentile_sample))::float8 AS dom_complete_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY full_load)
                FILTER (WHERE percentile_sample))::float8 AS full_load_p75
        FROM (
            SELECT
                pv.ttfb,
                pv.fcp,
                pv.lcp,
                pv.cls,
                pv.fid,
                pv.dom_complete,
                pv.full_load,
                {sample} AS percentile_sample
            FROM analytics_page_views pv
            WHERE pv.received_at BETWEEN ($1::timestamptz - interval '48 hours')
                                     AND ($2::timestamptz + interval '48 hours')
              AND pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{filter}
        ) bounded_views;
        "#,
        filter = device_filter(device),
        sample = PERFORMANCE_SAMPLE_SQL
    )
}

fn performance_trend_sql(device: &Option<String>) -> String {
    format!(
        r#"
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
                (percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp)
                    FILTER (WHERE percentile_sample))::float8 AS lcp_p75,
                (percentile_cont(0.75) WITHIN GROUP (ORDER BY fcp)
                    FILTER (WHERE percentile_sample))::float8 AS fcp_p75,
                (percentile_cont(0.75) WITHIN GROUP (ORDER BY full_load)
                    FILTER (WHERE percentile_sample))::float8 AS full_load_p75
            FROM (
                SELECT
                    pv.occurred_at,
                    pv.lcp,
                    pv.fcp,
                    pv.full_load,
                    {sample} AS percentile_sample
                FROM analytics_page_views pv
                WHERE pv.received_at BETWEEN ($1::timestamptz - interval '48 hours')
                                         AND ($2::timestamptz + interval '48 hours')
                  AND pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{filter}
            ) bounded_views
            GROUP BY 1
        )
        SELECT d.day, p.lcp_p75, p.fcp_p75, p.full_load_p75
        FROM days d
        LEFT JOIN p USING (day)
        ORDER BY d.day;
        "#,
        filter = device_filter(device),
        sample = PERFORMANCE_SAMPLE_SQL
    )
}

fn page_performance_sql(device: &Option<String>) -> String {
    format!(
        r#"
        SELECT
            page_type,
            COUNT(*)::bigint AS views_count,
            COUNT(lcp)::bigint AS measured_views,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp)
                FILTER (WHERE percentile_sample))::float8 AS lcp_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY cls)
                FILTER (WHERE percentile_sample))::float8 AS cls_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY fid)
                FILTER (WHERE percentile_sample))::float8 AS fid_p75,
            (percentile_cont(0.75) WITHIN GROUP (ORDER BY full_load)
                FILTER (WHERE percentile_sample))::float8 AS full_load_p75
        FROM (
            SELECT
                CASE WHEN pv.page_type IS NULL OR pv.page_type = ''
                     THEN 'other' ELSE pv.page_type END AS page_type,
                pv.lcp,
                pv.cls,
                pv.fid,
                pv.full_load,
                {sample} AS percentile_sample
            FROM analytics_page_views pv
            WHERE pv.received_at BETWEEN ($1::timestamptz - interval '48 hours')
                                     AND ($2::timestamptz + interval '48 hours')
              AND pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz{filter}
        ) bounded_views
        GROUP BY 1
        ORDER BY views_count DESC
        LIMIT 20;
        "#,
        filter = device_filter(device),
        sample = PERFORMANCE_SAMPLE_SQL
    )
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
    let client = state.analytics_client().await?;
    let sql = performance_overview_sql(&args.device);
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
    let client = state.analytics_client().await?;
    let sql = performance_trend_sql(&args.device);
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
    let client = state.analytics_client().await?;
    let sql = page_performance_sql(&args.device);
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

#[cfg(test)]
mod report_sql_tests {
    use super::{
        device_filter, page_performance_sql, performance_overview_sql, performance_trend_sql,
    };

    fn assert_indexed_page_view_candidates(sql: &str) {
        assert!(
            sql.contains("received_at BETWEEN"),
            "performance needs the page-view received_at index"
        );
        assert!(
            sql.contains("interval '48 hours'"),
            "page-view candidate margin is missing"
        );
        assert!(
            sql.contains("occurred_at BETWEEN"),
            "event time must remain authoritative"
        );
    }

    fn assert_lightweight_percentiles(sql: &str, percentile_count: usize) {
        assert!(
            sql.contains("hashtextextended(") && sql.contains("% 50 = 0 AS percentile_sample"),
            "p75 calculations need a deterministic two-percent sample"
        );
        assert_eq!(
            sql.matches("FILTER (WHERE percentile_sample)").count(),
            percentile_count,
            "every percentile sort must use only the compact sample"
        );
        assert!(
            sql.contains("COUNT(*)::bigint") || sql.contains("WITH days AS"),
            "exact count and empty-day behavior must remain unchanged"
        );
    }

    #[test]
    fn report_sql_performance_queries_bound_page_view_candidates() {
        assert_indexed_page_view_candidates(&performance_overview_sql(&None));
        assert_indexed_page_view_candidates(&performance_trend_sql(&None));
        assert_indexed_page_view_candidates(&page_performance_sql(&None));
    }

    #[test]
    fn report_sql_percentile_sorts_use_small_deterministic_samples() {
        assert_lightweight_percentiles(&performance_overview_sql(&None), 7);
        assert_lightweight_percentiles(&performance_trend_sql(&None), 3);
        assert_lightweight_percentiles(&page_performance_sql(&None), 4);
    }

    #[test]
    fn report_sql_device_filters_use_session_id_index_probes() {
        let mobile = device_filter(&Some("mobile".into()));
        let desktop = device_filter(&Some("desktop".into()));

        assert!(mobile.contains("EXISTS"));
        assert!(desktop.contains("EXISTS"));
        assert!(desktop.contains("NOT EXISTS"));
        assert!(!mobile.contains("GROUP BY"));
        assert!(!desktop.contains("GROUP BY"));
    }
}
