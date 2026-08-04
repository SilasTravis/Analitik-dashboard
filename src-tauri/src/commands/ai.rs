use tauri::{AppHandle, State};

use crate::ai::{self, AiAnalyzeResult, AiState};
use crate::db::error::{AppError, AppResult};
use crate::db::pool::ConnectionState;
use crate::security::ai_settings::{self, AiSettings, PublicAiSettings};

#[tauri::command]
pub async fn save_ai_settings(settings: AiSettings) -> AppResult<PublicAiSettings> {
    // An empty key means "keep the stored key, only update provider/model".
    let merged = if settings.api_key.is_empty() {
        let existing = ai_settings::load()?
            .ok_or_else(|| AppError::Message("API key required".into()))?;
        AiSettings {
            provider: settings.provider,
            api_key: existing.api_key,
            model: settings.model,
        }
    } else {
        settings
    };
    let public = PublicAiSettings::from(&merged);
    ai_settings::save(&merged)?;
    Ok(public)
}

#[tauri::command]
pub async fn load_ai_settings() -> AppResult<Option<PublicAiSettings>> {
    let opt = ai_settings::load()?;
    Ok(opt.as_ref().map(PublicAiSettings::from))
}

#[tauri::command]
pub async fn clear_ai_settings() -> AppResult<()> {
    ai_settings::clear()
}

#[tauri::command]
pub async fn list_ai_models(provider: String, api_key: Option<String>) -> AppResult<Vec<String>> {
    let key = match api_key {
        Some(k) if !k.trim().is_empty() => k,
        _ => ai_settings::require()?.api_key,
    };
    list_models_for(&provider, &key).await
}

async fn list_models_for(provider: &str, api_key: &str) -> AppResult<Vec<String>> {
    match provider {
        "anthropic" => ai::anthropic::list_models(api_key).await,
        "gemini" => ai::gemini::list_models(api_key).await,
        "openai" => ai::openai::list_models(api_key).await,
        other => Err(AppError::Message(format!("unknown AI provider: {other}"))),
    }
}

#[tauri::command]
pub async fn ai_chat(
    app: AppHandle,
    conn: State<'_, ConnectionState>,
    ai_state: State<'_, AiState>,
    intent: String,
    question: Option<String>,
) -> AppResult<AiAnalyzeResult> {
    let client = conn.client().await?;
    let settings = ai_settings::require()?;
    let provider = ai::build_provider(&settings)?;
    let schema = ai_state.schema(&client).await?;
    ai::chat(
        &app,
        &client,
        ai_state.inner(),
        provider.as_ref(),
        &schema,
        &intent,
        question.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn ai_reset_chat(ai_state: State<'_, AiState>) -> AppResult<()> {
    ai_state.reset().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::list_models_for;

    #[tokio::test]
    async fn model_list_routing_uses_the_anthropic_adapter() {
        let error = list_models_for("anthropic", "")
            .await
            .expect_err("empty Anthropic key must fail before a request");

        assert_eq!(error.to_string(), "Anthropic API key is not set");
    }
}
