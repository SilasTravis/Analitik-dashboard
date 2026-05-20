use serde::{Deserialize, Serialize};
use tokio_postgres::config::{Config, SslMode};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbCredentials {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    #[serde(default)]
    pub ssl: bool,
    /// When true, skip TLS certificate validation. Required for self-signed
    /// certificates or certs whose validity exceeds macOS's 398-day limit.
    #[serde(default, rename = "acceptInvalidCerts")]
    pub accept_invalid_certs: bool,
}

impl DbCredentials {
    /// Build a tokio-postgres Config. Uses the builder API so the password
    /// (or any field) can contain `=`, spaces, quotes, etc. without breaking.
    pub fn to_config(&self) -> Config {
        let mut cfg = Config::new();
        cfg.host(&self.host)
            .port(self.port)
            .user(&self.user)
            .password(&self.password)
            .dbname(&self.database)
            .ssl_mode(if self.ssl { SslMode::Require } else { SslMode::Prefer });
        cfg
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicCredentials {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub database: String,
    pub ssl: bool,
    #[serde(rename = "acceptInvalidCerts")]
    pub accept_invalid_certs: bool,
}

impl From<&DbCredentials> for PublicCredentials {
    fn from(c: &DbCredentials) -> Self {
        Self {
            host: c.host.clone(),
            port: c.port,
            user: c.user.clone(),
            database: c.database.clone(),
            ssl: c.ssl,
            accept_invalid_certs: c.accept_invalid_certs,
        }
    }
}
