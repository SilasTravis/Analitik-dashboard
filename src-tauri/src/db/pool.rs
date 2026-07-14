use std::sync::Arc;

use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use tokio::sync::{Mutex, MutexGuard};
use tokio_postgres::Client;

use super::credentials::DbCredentials;
use super::error::{AppError, AppResult};

#[derive(Default)]
pub struct ConnectionState {
    inner: Arc<Mutex<Option<Arc<Client>>>>,
    dashboard_query_lock: Arc<Mutex<()>>,
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
    /// Serializes dashboard commands that temporarily change connection-level
    /// settings such as `statement_timeout` on the shared PostgreSQL client.
    pub async fn dashboard_query_guard(&self) -> MutexGuard<'_, ()> {
        self.dashboard_query_lock.lock().await
    }

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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::ConnectionState;

    #[tokio::test]
    async fn dashboard_query_guard_serializes_session_setting_sequences() {
        let state = ConnectionState::default();
        let first = state.dashboard_query_guard().await;

        assert!(
            tokio::time::timeout(Duration::from_millis(10), state.dashboard_query_guard(),)
                .await
                .is_err()
        );

        drop(first);

        assert!(
            tokio::time::timeout(Duration::from_millis(50), state.dashboard_query_guard(),)
                .await
                .is_ok()
        );
    }
}
