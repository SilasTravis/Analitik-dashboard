mod commands;
mod db;
mod security;

use db::pool::ConnectionState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ConnectionState::default())
        .invoke_handler(tauri::generate_handler![
            commands::auth::test_connection,
            commands::auth::save_credentials,
            commands::auth::load_credentials,
            commands::auth::clear_credentials,
            commands::auth::connect_with_saved,
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
}
