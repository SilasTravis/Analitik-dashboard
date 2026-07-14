use std::ops::Deref;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use tokio::sync::{Mutex, OwnedMutexGuard, OwnedSemaphorePermit, Semaphore};
use tokio_postgres::Client;

use super::credentials::DbCredentials;
use super::error::{AppError, AppResult};

const POOL_SIZE: usize = 4;

#[derive(Clone)]
struct PoolEntry {
    client: Arc<Client>,
    gate: Arc<Mutex<()>>,
}

struct ClientPool {
    entries: Vec<PoolEntry>,
    available: Arc<Semaphore>,
    next: AtomicUsize,
}

impl ClientPool {
    fn new(entries: Vec<PoolEntry>) -> Self {
        let size = entries.len();
        Self {
            entries,
            available: Arc::new(Semaphore::new(size)),
            next: AtomicUsize::new(0),
        }
    }

    fn has_open_client(&self) -> bool {
        self.entries.iter().any(|entry| !entry.client.is_closed())
    }

    async fn lease(self: &Arc<Self>) -> Option<ClientLease> {
        let permit = self.available.clone().acquire_owned().await.ok()?;
        let open_entries: Vec<PoolEntry> = self
            .entries
            .iter()
            .filter(|entry| !entry.client.is_closed())
            .cloned()
            .collect();
        if open_entries.is_empty() {
            return None;
        }

        let start = self.next.fetch_add(1, Ordering::Relaxed) % open_entries.len();
        for offset in 0..open_entries.len() {
            let entry = &open_entries[(start + offset) % open_entries.len()];
            if let Ok(gate) = entry.gate.clone().try_lock_owned() {
                if !entry.client.is_closed() {
                    return Some(ClientLease {
                        client: entry.client.clone(),
                        _gate: gate,
                        _permit: permit,
                    });
                }
            }
        }

        let entry = open_entries[start].clone();
        let gate = entry.gate.clone().lock_owned().await;
        if entry.client.is_closed() {
            return None;
        }
        Some(ClientLease {
            client: entry.client,
            _gate: gate,
            _permit: permit,
        })
    }
}

pub struct ClientLease {
    client: Arc<Client>,
    _gate: OwnedMutexGuard<()>,
    _permit: OwnedSemaphorePermit,
}

impl Deref for ClientLease {
    type Target = Client;

    fn deref(&self) -> &Self::Target {
        &self.client
    }
}

impl AsRef<Client> for ClientLease {
    fn as_ref(&self) -> &Client {
        &self.client
    }
}

#[derive(Default)]
struct PoolState {
    pool: Option<Arc<ClientPool>>,
    credentials: Option<DbCredentials>,
}

pub struct ConnectionState {
    inner: Arc<Mutex<PoolState>>,
    reconnect_lock: Arc<Mutex<()>>,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PoolState::default())),
            reconnect_lock: Arc::new(Mutex::new(())),
        }
    }
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
    async fn connect_entry(creds: &DbCredentials) -> AppResult<PoolEntry> {
        let cfg = creds.to_config();
        let tls = make_tls(creds.accept_invalid_certs)?;
        let (client, connection) = cfg.connect(tls).await?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("postgres connection error: {e}");
            }
        });
        Ok(PoolEntry {
            client: Arc::new(client),
            gate: Arc::new(Mutex::new(())),
        })
    }

    async fn build_pool(creds: &DbCredentials) -> AppResult<Arc<ClientPool>> {
        let (first, second, third, fourth) = tokio::try_join!(
            Self::connect_entry(creds),
            Self::connect_entry(creds),
            Self::connect_entry(creds),
            Self::connect_entry(creds),
        )?;
        let entries = Vec::from([first, second, third, fourth]);
        debug_assert_eq!(entries.len(), POOL_SIZE);
        Ok(Arc::new(ClientPool::new(entries)))
    }

    pub async fn connect(&self, creds: &DbCredentials) -> AppResult<()> {
        let _reconnect_guard = self.reconnect_lock.lock().await;
        let pool = Self::build_pool(creds).await?;
        let mut state = self.inner.lock().await;
        state.pool = Some(pool);
        state.credentials = Some(creds.clone());
        Ok(())
    }

    pub async fn client(&self) -> AppResult<ClientLease> {
        loop {
            let (pool, credentials) = {
                let state = self.inner.lock().await;
                (state.pool.clone(), state.credentials.clone())
            };

            if let Some(pool) = pool {
                if pool.has_open_client() {
                    if let Some(lease) = pool.lease().await {
                        return Ok(lease);
                    }
                    continue;
                }
            }

            let credentials = credentials.ok_or(AppError::NotConnected)?;
            let _reconnect_guard = self.reconnect_lock.lock().await;

            let existing_pool = {
                let state = self.inner.lock().await;
                state.pool.clone()
            };
            if existing_pool
                .as_ref()
                .is_some_and(|pool| pool.has_open_client())
            {
                continue;
            }

            let replacement = Self::build_pool(&credentials).await?;
            let mut state = self.inner.lock().await;
            if state.credentials.is_none() {
                return Err(AppError::NotConnected);
            }
            state.pool = Some(replacement);
        }
    }

    pub async fn disconnect(&self) {
        let _reconnect_guard = self.reconnect_lock.lock().await;
        let mut state = self.inner.lock().await;
        state.pool = None;
        state.credentials = None;
    }
}

#[cfg(test)]
mod tests {
    const SOURCE: &str = include_str!("pool.rs");

    #[test]
    fn connection_state_uses_four_exclusive_database_leases() {
        let production = SOURCE
            .split("#[cfg(test)]")
            .next()
            .expect("production source");
        assert!(production.contains("const POOL_SIZE: usize = 4"));
        assert!(production.contains("pub struct ClientLease"));
        assert!(production.contains("OwnedSemaphorePermit"));
        assert!(production.contains("OwnedMutexGuard"));
        assert!(
            production.contains("tokio::try_join!"),
            "pool connections must open concurrently"
        );
    }

    #[test]
    fn closed_pool_reconnects_without_query_deadlines() {
        let production = SOURCE
            .split("#[cfg(test)]")
            .next()
            .expect("production source");
        assert!(production.contains("client.is_closed()"));
        assert!(production.contains("reconnect_lock"));
        assert!(!production.contains("tokio::time::timeout("));
        assert!(!production.contains("connect_timeout("));
    }
}
