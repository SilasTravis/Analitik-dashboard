use tauri::State;

use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;

/// Cancels database work owned by the page that is about to unmount.
/// This command must not acquire a pooled client: it is specifically needed
/// when every client is already busy with an obsolete page request.
#[tauri::command]
pub async fn cancel_obsolete_analytics_queries(state: State<'_, ConnectionState>) -> AppResult<()> {
    state.cancel_obsolete_analytics_queries().await
}

#[cfg(test)]
mod tests {
    #[test]
    fn report_commands_use_analytics_leases_while_ai_keeps_general_leases() {
        let reports = [
            ("analytics", include_str!("analytics.rs")),
            ("conversion", include_str!("conversion.rs")),
            ("dashboard commerce", include_str!("dashboard_commerce.rs")),
            ("dashboard geo", include_str!("dashboard_geo.rs")),
            ("dashboard sessions", include_str!("dashboard_sessions.rs")),
            ("dashboard traffic", include_str!("dashboard_traffic.rs")),
            ("performance", include_str!("performance.rs")),
            ("user flow", include_str!("user_flow.rs")),
        ];

        for (name, source) in reports {
            assert!(
                source.contains("analytics_client()"),
                "{name} must tag its database work as analytics"
            );
            assert!(
                !source.contains("state.client().await"),
                "{name} must not use an unscoped general lease"
            );
        }

        let ai = include_str!("ai.rs");
        assert!(ai.contains("conn.client().await"));
        assert!(!ai.contains("analytics_client()"));
    }
}
