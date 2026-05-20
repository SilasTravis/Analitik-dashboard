use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::rngs::OsRng;
use rand::RngCore;

use crate::db::error::{AppError, AppResult};

pub const KEY_LEN: usize = 32; // 256-bit
pub const NONCE_LEN: usize = 12; // GCM standard

/// Generate a cryptographically secure 256-bit data-encryption key.
pub fn generate_key() -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    OsRng.fill_bytes(&mut key);
    key
}

/// Encrypt with AES-256-GCM. Output format: nonce(12) || ciphertext_with_tag.
pub fn encrypt(plaintext: &[u8], key: &[u8; KEY_LEN]) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| AppError::Message(format!("encrypt failed: {e}")))?;

    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypt an output produced by `encrypt`. Verifies GCM tag — bad key or
/// tampered ciphertext both fail with an error.
pub fn decrypt(blob: &[u8], key: &[u8; KEY_LEN]) -> AppResult<Vec<u8>> {
    if blob.len() <= NONCE_LEN {
        return Err(AppError::Message("ciphertext too short".into()));
    }
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Message("decrypt failed: bad key or tampered data".into()))
}
