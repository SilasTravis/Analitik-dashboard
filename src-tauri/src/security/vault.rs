use crate::db::credentials::DbCredentials;
use crate::db::error::{AppError, AppResult};
use crate::security::{crypto, keychain, storage};

/// Encrypt credentials with a Keychain-backed AES-256-GCM key and persist
/// the ciphertext to disk. Two storage layers, two OS-protected secrets.
pub fn save(creds: &DbCredentials) -> AppResult<()> {
    let key = match keychain::load_key()? {
        Some(k) => k,
        None => {
            let new_key = crypto::generate_key();
            keychain::save_key(&new_key)?;
            new_key
        }
    };
    let plaintext = serde_json::to_vec(creds)?;
    let blob = crypto::encrypt(&plaintext, &key)?;
    storage::write(&blob)?;
    Ok(())
}

/// Load and decrypt previously saved credentials.
/// Returns `AppError::NoCredentials` when nothing has been saved yet.
pub fn load() -> AppResult<DbCredentials> {
    let key = keychain::load_key()?.ok_or(AppError::NoCredentials)?;
    let blob = storage::read()?.ok_or(AppError::NoCredentials)?;
    let plaintext = crypto::decrypt(&blob, &key)?;
    let creds: DbCredentials = serde_json::from_slice(&plaintext)?;
    Ok(creds)
}

pub fn clear() -> AppResult<()> {
    storage::delete()?;
    keychain::clear_key()?;
    Ok(())
}
