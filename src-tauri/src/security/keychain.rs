use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use keyring::Entry;

use crate::db::error::{AppError, AppResult};
use crate::security::crypto::KEY_LEN;

const SERVICE: &str = "com.analiticdashboard.app";
const ACCOUNT: &str = "credentials-dek-v1";

fn entry() -> AppResult<Entry> {
    Entry::new(SERVICE, ACCOUNT).map_err(AppError::from)
}

/// Save the 32-byte data-encryption key, base64-encoded, into the macOS Keychain.
pub fn save_key(key: &[u8; KEY_LEN]) -> AppResult<()> {
    let encoded = B64.encode(key);
    entry()?.set_password(&encoded)?;
    Ok(())
}

/// Load the DEK. Returns `Ok(None)` if no key has ever been saved.
pub fn load_key() -> AppResult<Option<[u8; KEY_LEN]>> {
    let raw = match entry()?.get_password() {
        Ok(v) => v,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(e) => return Err(AppError::from(e)),
    };
    let bytes = B64
        .decode(raw.as_bytes())
        .map_err(|e| AppError::Message(format!("base64 decode failed: {e}")))?;
    if bytes.len() != KEY_LEN {
        return Err(AppError::Message(format!(
            "keychain DEK has wrong length: {} (expected {KEY_LEN})",
            bytes.len()
        )));
    }
    let mut out = [0u8; KEY_LEN];
    out.copy_from_slice(&bytes);
    Ok(Some(out))
}

pub fn clear_key() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::from(e)),
    }
}
