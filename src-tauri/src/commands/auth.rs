use tauri::State;

use crate::db::credentials::{DbCredentials, PublicCredentials};
use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;
use crate::security::vault;

#[tauri::command]
pub async fn test_connection(creds: DbCredentials) -> AppResult<()> {
    let probe = ConnectionState::default();
    probe.connect(&creds).await?;
    let client = probe.client().await?;
    client.simple_query("SELECT 1").await?;
    probe.disconnect().await;
    Ok(())
}

#[tauri::command]
pub async fn save_credentials(
    state: State<'_, ConnectionState>,
    creds: DbCredentials,
) -> AppResult<PublicCredentials> {
    state.connect(&creds).await?;
    vault::save(&creds)?;
    Ok(PublicCredentials::from(&creds))
}

#[tauri::command]
pub async fn load_credentials() -> AppResult<PublicCredentials> {
    let creds = vault::load()?;
    Ok(PublicCredentials::from(&creds))
}

#[tauri::command]
pub async fn connect_with_saved(
    state: State<'_, ConnectionState>,
) -> AppResult<PublicCredentials> {
    let creds = vault::load()?;
    state.connect(&creds).await?;
    Ok(PublicCredentials::from(&creds))
}

#[tauri::command]
pub async fn clear_credentials(state: State<'_, ConnectionState>) -> AppResult<()> {
    state.disconnect().await;
    vault::clear()?;
    Ok(())
}
