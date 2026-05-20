use serde::{Deserialize, Serialize};
use tauri::State;
use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;
use crate::commands::analytics::RangeArgs;

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowLink {
    pub source: String,
    pub target: String,
    pub volume: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PageFlowReport {
    pub links: Vec<FlowLink>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PageEngagementRow {
    pub page_type: String,
    pub views_count: i64,
    pub avg_duration_seconds: f64,
    pub avg_scroll_depth: f64,
    pub avg_click_count: f64,
}

#[tauri::command]
pub async fn get_page_flow_map(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<PageFlowReport> {
    let client = state.client().await?;

    let sql = "
        WITH sampled_sessions AS (
            SELECT session_id
            FROM analytics_sessions
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND ABS(hashtext(session_id) % 10) = 0
        ),
        ordered_clicks AS (
            SELECT 
                session_id,
                CASE WHEN page_type IS NULL OR page_type = '' THEN 'other' ELSE page_type END AS page_type,
                occurred_at,
                lead(CASE WHEN page_type IS NULL OR page_type = '' THEN 'other' ELSE page_type END) 
                    OVER (PARTITION BY session_id ORDER BY occurred_at) AS next_page
            FROM analytics_page_views
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND session_id IN (SELECT session_id FROM sampled_sessions)
        )
        SELECT 
            page_type AS source,
            COALESCE(next_page, 'Exit') AS target,
            COUNT(*)::bigint * 10 AS flow_volume
        FROM ordered_clicks
        WHERE page_type != COALESCE(next_page, 'Exit')
        GROUP BY 1, 2
        ORDER BY flow_volume DESC;
    ";

    let rows = client.query(sql, &[&args.from, &args.to]).await?;

    let mut links = Vec::new();
    for row in rows {
        let source: String = row.get("source");
        let target: String = row.get("target");
        let volume: i64 = row.get("flow_volume");
        links.push(FlowLink { source, target, volume });
    }

    Ok(PageFlowReport { links })
}

#[tauri::command]
pub async fn get_page_engagement_report(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<PageEngagementRow>> {
    let client = state.client().await?;

    let sql = "
        WITH sampled_sessions AS (
            SELECT session_id
            FROM analytics_sessions
            WHERE occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND ABS(hashtext(session_id) % 10) = 0
        ),
        pv_durations AS (
            SELECT 
                pv.page_view_id,
                CASE WHEN pv.page_type IS NULL OR pv.page_type = '' THEN 'other' ELSE pv.page_type END AS page_type,
                pv.occurred_at,
                lead(pv.occurred_at) OVER (PARTITION BY pv.session_id ORDER BY pv.occurred_at) AS next_occurred_at
            FROM analytics_page_views pv
            WHERE pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
              AND pv.session_id IN (SELECT session_id FROM sampled_sessions)
        ),
        pv_stats AS (
            SELECT 
                d.page_view_id,
                d.page_type,
                EXTRACT(EPOCH FROM (d.next_occurred_at - d.occurred_at))::float8 AS duration_seconds
            FROM pv_durations d
            WHERE d.next_occurred_at IS NOT NULL
              AND (d.next_occurred_at - d.occurred_at) < interval '30 minutes'
        )
        SELECT 
            s.page_type,
            (COUNT(DISTINCT s.page_view_id)::bigint * 10) AS views_count,
            AVG(s.duration_seconds)::float8 AS avg_duration_seconds,
            COALESCE(AVG(e.max_scroll_depth::float8), 0.0)::float8 AS avg_scroll_depth,
            COALESCE(AVG(e.click_count::float8), 0.0)::float8 AS avg_click_count
        FROM pv_stats s
        LEFT JOIN analytics_page_engagements e ON s.page_view_id = e.page_view_id
        GROUP BY 1
        ORDER BY views_count DESC;
    ";

    let rows = client.query(sql, &[&args.from, &args.to]).await?;

    let mut report = Vec::new();
    for row in rows {
        let page_type: String = row.get("page_type");
        let views_count: i64 = row.get("views_count");
        let avg_duration_seconds: f64 = row.get("avg_duration_seconds");
        let avg_scroll_depth: f64 = row.get("avg_scroll_depth");
        let avg_click_count: f64 = row.get("avg_click_count");
        report.push(PageEngagementRow {
            page_type,
            views_count,
            avg_duration_seconds,
            avg_scroll_depth,
            avg_click_count,
        });
    }

    Ok(report)
}
