use std::sync::Arc;

use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use tokio::sync::Mutex;
use tokio_postgres::Client;

use super::credentials::DbCredentials;
use super::error::{AppError, AppResult};

#[derive(Default)]
pub struct ConnectionState {
    inner: Arc<Mutex<Option<Arc<Client>>>>,
}

fn make_tls(accept_invalid_certs: bool) -> AppResult<MakeTlsConnector> {
    let mut builder = TlsConnector::builder();
    if accept_invalid_certs {
        // Required for self-signed certs or certs whose validity exceeds
        // macOS's 398-day cap. User opts in via the login form.
        builder.danger_accept_invalid_certs(true);
        builder.danger_accept_invalid_hostnames(true);
    }
    let connector = builder
        .build()
        .map_err(|e| AppError::Message(format!("tls init failed: {e}")))?;
    Ok(MakeTlsConnector::new(connector))
}

impl ConnectionState {
    pub async fn connect(&self, creds: &DbCredentials) -> AppResult<()> {
        let cfg = creds.to_config();
        let tls = make_tls(creds.accept_invalid_certs)?;
        let (client, connection) = cfg.connect(tls).await?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("postgres connection error: {e}");
            }
        });
        let mut guard = self.inner.lock().await;
        *guard = Some(Arc::new(client));
        Ok(())
    }

    pub async fn client(&self) -> AppResult<Arc<Client>> {
        let guard = self.inner.lock().await;
        guard.clone().ok_or(AppError::NotConnected)
    }

    pub async fn disconnect(&self) {
        let mut guard = self.inner.lock().await;
        *guard = None;
    }
}
