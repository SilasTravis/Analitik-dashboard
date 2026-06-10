use serde::{Deserialize, Serialize};

use crate::db::error::{AppError, AppResult};
use crate::security::{crypto, keychain, storage};

const FILE_NAME: &str = "ai_settings.enc";

/// Persisted AI provider configuration. The API key is encrypted at rest with
/// the same Keychain-backed DEK used for DB credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    /// Provider id: "gemini" (more behind the AiProvider trait later).
    pub provider: String,
    pub api_key: String,
    /// Optional model override, e.g. "gemini-2.0-flash".
    #[serde(default)]
    pub model: Option<String>,
}

/// Key fields safe to return to the frontend — never the raw key.
#[derive(Debug, Serialize)]
pub struct PublicAiSettings {
    pub provider: String,
    pub model: Option<String>,
    pub has_key: bool,
}

impl From<&AiSettings> for PublicAiSettings {
    fn from(s: &AiSettings) -> Self {
        PublicAiSettings {
            provider: s.provider.clone(),
            model: s.model.clone(),
            has_key: !s.api_key.is_empty(),
        }
    }
}

fn dek() -> AppResult<[u8; crypto::KEY_LEN]> {
    match keychain::load_key()? {
        Some(k) => Ok(k),
        None => {
            let new_key = crypto::generate_key();
            keychain::save_key(&new_key)?;
            Ok(new_key)
        }
    }
}

pub fn save(settings: &AiSettings) -> AppResult<()> {
    let key = dek()?;
    let plaintext = serde_json::to_vec(settings)?;
    let blob = crypto::encrypt(&plaintext, &key)?;
    storage::write_file(FILE_NAME, &blob)?;
    Ok(())
}

/// Load saved AI settings, or `Ok(None)` if the user hasn't configured any yet.
pub fn load() -> AppResult<Option<AiSettings>> {
    let key = match keychain::load_key()? {
        Some(k) => k,
        None => return Ok(None),
    };
    let blob = match storage::read_file(FILE_NAME)? {
        Some(b) => b,
        None => return Ok(None),
    };
    let plaintext = crypto::decrypt(&blob, &key)?;
    let settings: AiSettings = serde_json::from_slice(&plaintext)?;
    Ok(Some(settings))
}

pub fn require() -> AppResult<AiSettings> {
    load()?.ok_or_else(|| AppError::Message("AI provider not configured".into()))
}

pub fn clear() -> AppResult<()> {
    storage::delete_file(FILE_NAME)
}
