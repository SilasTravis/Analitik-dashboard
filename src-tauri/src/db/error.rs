use serde::Serialize;
use std::error::Error as StdError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] tokio_postgres::Error),
    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("not connected: connect first")]
    NotConnected,
    #[error("no saved credentials")]
    NoCredentials,
    #[error("{0}")]
    Message(String),
}

#[derive(Serialize)]
pub struct SerializedError {
    pub code: String,
    pub message: String,
}

/// Walk the std::error::Error source chain so callers see the real cause
/// instead of opaque labels like "db error".
fn full_message(err: &(dyn StdError + 'static)) -> String {
    let mut out = err.to_string();
    let mut cur = err.source();
    while let Some(src) = cur {
        let s = src.to_string();
        if !out.contains(&s) {
            out.push_str(": ");
            out.push_str(&s);
        }
        cur = src.source();
    }
    out
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let code = match self {
            AppError::Db(_) => "db",
            AppError::Keyring(_) => "keyring",
            AppError::Serde(_) => "serde",
            AppError::NotConnected => "not_connected",
            AppError::NoCredentials => "no_credentials",
            AppError::Message(_) => "message",
        };
        SerializedError {
            code: code.into(),
            message: full_message(self),
        }
        .serialize(s)
    }
}

pub type AppResult<T> = Result<T, AppError>;
