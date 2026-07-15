use crate::commands::analytics::RangeArgs;
use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;
use serde::{Deserialize, Serialize};
use tauri::State;

const PAGE_FLOW_SQL: &str = r#"
    WITH sampled_page_views AS (
        SELECT
            pv.session_id,
            CASE WHEN pv.page_type IS NULL OR pv.page_type = ''
                 THEN 'other' ELSE pv.page_type END AS page_type,
            pv.occurred_at
        FROM analytics_page_views pv
        WHERE pv.received_at BETWEEN ($1::timestamptz - interval '48 hours')
                                 AND ($2::timestamptz + interval '48 hours')
          AND pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND pv.session_id IS NOT NULL
          AND hashtext(pv.session_id) % 10 = 0
    ),
    ordered_clicks AS (
        SELECT
            session_id,
            page_type,
            lead(page_type) OVER (
                PARTITION BY session_id
                ORDER BY occurred_at
            ) AS next_page
        FROM sampled_page_views
    )
    SELECT
        page_type AS source,
        COALESCE(next_page, 'Exit') AS target,
        COUNT(*)::bigint * 10 AS flow_volume
    FROM ordered_clicks
    WHERE page_type != COALESCE(next_page, 'Exit')
    GROUP BY 1, 2
    ORDER BY flow_volume DESC;
"#;

const PAGE_ENGAGEMENT_SQL: &str = r#"
    WITH sampled_page_views AS (
        SELECT
            pv.page_view_id,
            pv.session_id,
            CASE WHEN pv.page_type IS NULL OR pv.page_type = ''
                 THEN 'other' ELSE pv.page_type END AS page_type,
            pv.occurred_at
        FROM analytics_page_views pv
        WHERE pv.received_at BETWEEN ($1::timestamptz - interval '48 hours')
                                 AND ($2::timestamptz + interval '48 hours')
          AND pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
          AND pv.session_id IS NOT NULL
          AND hashtext(pv.session_id) % 10 = 0
    ),
    pv_durations AS (
        SELECT
            page_view_id,
            page_type,
            occurred_at,
            lead(occurred_at) OVER (
                PARTITION BY session_id
                ORDER BY occurred_at
            ) AS next_occurred_at
        FROM sampled_page_views
    ),
    pv_stats AS (
        SELECT
            durations.page_view_id,
            durations.page_type,
            EXTRACT(EPOCH FROM (
                durations.next_occurred_at - durations.occurred_at
            ))::float8 AS duration_seconds
        FROM pv_durations durations
        WHERE durations.next_occurred_at IS NOT NULL
          AND (durations.next_occurred_at - durations.occurred_at) < interval '30 minutes'
    )
    SELECT
        stats.page_type,
        (COUNT(DISTINCT stats.page_view_id)::bigint * 10) AS views_count,
        AVG(stats.duration_seconds)::float8 AS avg_duration_seconds,
        COALESCE(AVG(engagement.max_scroll_depth::float8), 0.0)::float8 AS avg_scroll_depth,
        COALESCE(AVG(engagement.click_count::float8), 0.0)::float8 AS avg_click_count
    FROM pv_stats stats
    LEFT JOIN analytics_page_engagements engagement
      ON stats.page_view_id = engagement.page_view_id
    GROUP BY 1
    ORDER BY views_count DESC;
"#;

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
    let client = state.analytics_client().await?;
    let rows = client.query(PAGE_FLOW_SQL, &[&args.from, &args.to]).await?;

    let mut links = Vec::new();
    for row in rows {
        let source: String = row.get("source");
        let target: String = row.get("target");
        let volume: i64 = row.get("flow_volume");
        links.push(FlowLink {
            source,
            target,
            volume,
        });
    }

    Ok(PageFlowReport { links })
}

#[tauri::command]
pub async fn get_page_engagement_report(
    state: State<'_, ConnectionState>,
    args: RangeArgs,
) -> AppResult<Vec<PageEngagementRow>> {
    let client = state.analytics_client().await?;
    let rows = client
        .query(PAGE_ENGAGEMENT_SQL, &[&args.from, &args.to])
        .await?;

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

#[cfg(test)]
mod report_sql_tests {
    use super::{PAGE_ENGAGEMENT_SQL, PAGE_FLOW_SQL};

    fn assert_lightweight_page_view_sample(sql: &str) {
        assert!(
            sql.contains("pv.received_at BETWEEN ($1::timestamptz - interval '48 hours')"),
            "page views must start from the indexed received-time range"
        );
        assert!(
            sql.contains("pv.occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"),
            "event time must remain the authoritative range"
        );
        assert!(
            sql.contains("hashtext(pv.session_id) % 10 = 0"),
            "the existing deterministic ten-percent session sample must be preserved"
        );
        assert_eq!(sql.matches("FROM analytics_page_views").count(), 1);
        assert!(
            !sql.contains("analytics_sessions")
                && !sql.contains("sampled_sessions")
                && !sql.contains("JOIN LATERAL"),
            "the report must not enumerate sessions before scanning page views"
        );
    }

    #[test]
    fn report_sql_page_flow_uses_one_indexed_sampled_page_view_scan() {
        assert_lightweight_page_view_sample(PAGE_FLOW_SQL);
    }

    #[test]
    fn report_sql_page_engagement_uses_one_indexed_sampled_page_view_scan() {
        assert_lightweight_page_view_sample(PAGE_ENGAGEMENT_SQL);
        assert!(PAGE_ENGAGEMENT_SQL.contains("analytics_page_engagements engagement"));
        assert!(PAGE_ENGAGEMENT_SQL.contains("stats.page_view_id = engagement.page_view_id"));
    }
}
