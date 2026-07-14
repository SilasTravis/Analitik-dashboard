mod ai;
mod commands;
mod db;
mod security;

use ai::AiState;
use db::pool::ConnectionState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ConnectionState::default())
        .manage(AiState::default())
        .invoke_handler(tauri::generate_handler![
            commands::auth::test_connection,
            commands::auth::save_credentials,
            commands::auth::load_credentials,
            commands::auth::clear_credentials,
            commands::auth::connect_with_saved,
            commands::dashboard_commerce::get_dashboard_commerce,
            commands::dashboard_geo::get_dashboard_geo,
            commands::dashboard_sessions::get_dashboard_sessions,
            commands::dashboard_traffic::get_dashboard_traffic,
            commands::analytics::get_kpi_overview,
            commands::analytics::get_daily_traffic,
            commands::analytics::get_daily_revenue,
            commands::analytics::get_devices_overview,
            commands::analytics::get_browsers_overview,
            commands::analytics::get_top_products,
            commands::analytics::get_order_sources,
            commands::analytics::get_utm_sources,
            commands::analytics::get_geo_breakdown,
            commands::analytics::get_period_comparison,
            commands::analytics::get_campaigns_report,
            commands::analytics::get_referrers_report,
            commands::user_flow::get_page_flow_map,
            commands::user_flow::get_page_engagement_report,
            commands::conversion::get_order_statuses,
            commands::conversion::get_conversion_funnel,
            commands::conversion::get_conversion_kpis,
            commands::performance::get_performance_overview,
            commands::performance::get_performance_trend,
            commands::performance::get_page_performance,
            commands::ai::ai_chat,
            commands::ai::ai_reset_chat,
            commands::ai::save_ai_settings,
            commands::ai::load_ai_settings,
            commands::ai::clear_ai_settings,
            commands::ai::list_ai_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_db_schema() {
        println!("Checking keychain key...");
        match crate::security::keychain::load_key() {
            Ok(Some(_)) => println!("Keychain key loaded successfully"),
            Ok(None) => println!("Keychain key is None"),
            Err(e) => println!("Keychain key error: {:?}", e),
        }
        println!("Checking storage file...");
        match crate::security::storage::read() {
            Ok(Some(_)) => println!("Storage blob loaded successfully"),
            Ok(None) => println!("Storage blob is None"),
            Err(e) => println!("Storage blob error: {:?}", e),
        }

        let creds = match crate::security::vault::load() {
            Ok(c) => c,
            Err(e) => {
                println!("Failed to load credentials: {:?}", e);
                return;
            }
        };
        let (client, connection) = creds.to_config().connect(tokio_postgres::NoTls).await.unwrap();
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });

        let rows = client.query("
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
        ", &[]).await.unwrap();
        
        println!("---------------- DATABASE SCHEMA ----------------");
        for row in rows {
            let table: String = row.get("table_name");
            let col: String = row.get("column_name");
            let dtype: String = row.get("data_type");
            println!("SCHEMA: {} | {} | {}", table, col, dtype);
        }
        println!("-------------------------------------------------");
        panic!("Forcing failure to show schema output");
    }

    /// Verifies the device segmentation used by the Performance page against
    /// real data. Ignored by default (needs saved DB credentials); run with:
    ///   cargo test diag_device_filter -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn diag_device_filter() {
        let creds = match crate::security::vault::load() {
            Ok(c) => c,
            Err(e) => {
                println!("Failed to load credentials: {:?}", e);
                return;
            }
        };
        let (client, connection) =
            creds.to_config().connect(tokio_postgres::NoTls).await.unwrap();
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });

        let range = "occurred_at >= NOW() - interval '30 days'";
        let mobile_in = "session_id IN (SELECT session_id FROM analytics_sessions \
                         GROUP BY session_id HAVING bool_or(is_mobile))";
        let desktop_in = "session_id IN (SELECT session_id FROM analytics_sessions \
                          GROUP BY session_id HAVING NOT COALESCE(bool_or(is_mobile), FALSE))";

        let count = |sql: String| {
            let client = &client;
            async move {
                let r = client.query_one(&sql, &[]).await.unwrap();
                let c: i64 = r.get("c");
                c
            }
        };

        let total =
            count(format!("SELECT COUNT(*)::bigint AS c FROM analytics_page_views WHERE {range}"))
                .await;
        let mobile = count(format!(
            "SELECT COUNT(*)::bigint AS c FROM analytics_page_views WHERE {range} AND {mobile_in}"
        ))
        .await;
        let desktop = count(format!(
            "SELECT COUNT(*)::bigint AS c FROM analytics_page_views WHERE {range} AND {desktop_in}"
        ))
        .await;
        let orphan = count(format!(
            "SELECT COUNT(*)::bigint AS c FROM analytics_page_views pv WHERE {range} \
             AND NOT EXISTS (SELECT 1 FROM analytics_sessions s WHERE s.session_id = pv.session_id)"
        ))
        .await;

        println!("============== DEVICE FILTER DIAG (last 30d) ==============");
        println!("total page views ........ {total}");
        println!("mobile .................. {mobile}");
        println!("desktop ................. {desktop}");
        println!("mobile + desktop ........ {}", mobile + desktop);
        println!("orphan (no session row) . {orphan}", orphan = orphan);
        println!("m + d + orphan .......... {}", mobile + desktop + orphan);
        println!("=> m+d+orphan should equal total; mobile & desktop must not overlap");
        println!("==========================================================");
    }

    /// Confirms the vocabulary assumptions baked into the Conversion funnel
    /// SQL (`commands/conversion.rs`): the `analytics_basket.action` values,
    /// the `analytics_page_views.page_type` values, the `orders.status` set,
    /// and how many orders carry a `session_id` (attribution coverage).
    /// Ignored by default (needs saved DB credentials); run with:
    ///   cargo test diag_conversion_vocab -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn diag_conversion_vocab() {
        let creds = match crate::security::vault::load() {
            Ok(c) => c,
            Err(e) => {
                println!("Failed to load credentials: {:?}", e);
                return;
            }
        };
        let (client, connection) =
            creds.to_config().connect(tokio_postgres::NoTls).await.unwrap();
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("connection error: {}", e);
            }
        });

        let dump = |title: &'static str, sql: String| {
            let client = &client;
            async move {
                println!("---- {title} ----");
                match client.query(&sql, &[]).await {
                    Ok(rows) => {
                        for r in rows {
                            let label: String = r.get("label");
                            let c: i64 = r.get("c");
                            println!("  {label:<28} {c}");
                        }
                    }
                    Err(e) => println!("  query error: {e}"),
                }
            }
        };

        let win = "occurred_at >= NOW() - interval '30 days'";
        println!("============== CONVERSION VOCAB DIAG (last 30d) ==============");

        dump(
            "analytics_basket.action",
            format!(
                "SELECT COALESCE(NULLIF(action,''),'<null>') AS label, COUNT(*)::bigint AS c \
                 FROM analytics_basket WHERE {win} GROUP BY 1 ORDER BY c DESC"
            ),
        )
        .await;

        dump(
            "analytics_page_views.page_type (top 20)",
            format!(
                "SELECT COALESCE(NULLIF(page_type,''),'<null>') AS label, COUNT(*)::bigint AS c \
                 FROM analytics_page_views WHERE {win} GROUP BY 1 ORDER BY c DESC LIMIT 20"
            ),
        )
        .await;

        dump(
            "orders.status",
            "SELECT COALESCE(NULLIF(status,''),'<null>') AS label, COUNT(*)::bigint AS c \
             FROM orders WHERE created_at >= NOW() - interval '30 days' AND deleted_at IS NULL \
             GROUP BY 1 ORDER BY c DESC"
                .to_string(),
        )
        .await;

        dump(
            "orders attribution coverage",
            "SELECT CASE WHEN session_id IS NOT NULL THEN 'has session_id' \
                         WHEN device_id IS NOT NULL THEN 'device_id only' \
                         ELSE 'unattributed' END AS label, COUNT(*)::bigint AS c \
             FROM orders WHERE created_at >= NOW() - interval '30 days' AND deleted_at IS NULL \
             GROUP BY 1 ORDER BY c DESC"
                .to_string(),
        )
        .await;

        println!("---- funnel sanity (last 30d, all devices, completed=completed+delivered) ----");
        let funnel_sql = "
            WITH sess AS (
                SELECT DISTINCT session_id FROM analytics_sessions
                WHERE occurred_at >= NOW() - interval '30 days'),
            viewed AS (
                SELECT DISTINCT session_id FROM analytics_page_views
                WHERE occurred_at >= NOW() - interval '30 days' AND page_type = 'product_view'
                  AND session_id IN (SELECT session_id FROM sess)),
            basket AS (
                SELECT DISTINCT session_id FROM analytics_basket
                WHERE occurred_at >= NOW() - interval '30 days' AND action = 'BASKET_ACTION_ADD'
                  AND session_id IN (SELECT session_id FROM sess)),
            placed AS (
                SELECT DISTINCT session_id FROM orders
                WHERE created_at >= NOW() - interval '30 days' AND deleted_at IS NULL
                  AND session_id IS NOT NULL AND session_id IN (SELECT session_id FROM sess)),
            completed AS (
                SELECT DISTINCT session_id FROM orders
                WHERE created_at >= NOW() - interval '30 days' AND deleted_at IS NULL
                  AND session_id IS NOT NULL AND status = ANY(ARRAY['completed','delivered'])
                  AND session_id IN (SELECT session_id FROM sess))
            SELECT (SELECT COUNT(*) FROM sess)::bigint AS sessions,
                   (SELECT COUNT(*) FROM viewed)::bigint AS viewed,
                   (SELECT COUNT(*) FROM basket)::bigint AS basket,
                   (SELECT COUNT(*) FROM placed)::bigint AS placed,
                   (SELECT COUNT(*) FROM completed)::bigint AS completed";
        match client.query_one(funnel_sql, &[]).await {
            Ok(r) => {
                let s: i64 = r.get("sessions");
                let v: i64 = r.get("viewed");
                let b: i64 = r.get("basket");
                let p: i64 = r.get("placed");
                let c: i64 = r.get("completed");
                println!("  sessions ........ {s}");
                println!("  viewed_product .. {v}");
                println!("  added_basket .... {b}");
                println!("  order_placed .... {p}");
                println!("  order_completed . {c}");
                println!("  => should be monotonically non-increasing");
            }
            Err(e) => println!("  funnel query error: {e}"),
        }
        println!("=============================================================");
    }
}
