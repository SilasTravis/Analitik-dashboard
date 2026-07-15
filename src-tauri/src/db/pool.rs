use std::future::Future;
use std::ops::Deref;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use tokio::sync::{Mutex, Notify, OwnedMutexGuard, OwnedSemaphorePermit, Semaphore};
use tokio_postgres::Client;

use super::credentials::DbCredentials;
use super::error::{AppError, AppResult};

const POOL_SIZE: usize = 4;
const ANALYTICS_CANCELLATION_COUNT_MASK: u64 = u32::MAX as u64;
const ANALYTICS_GENERATION_SHIFT: u32 = 32;
const CANCEL_RETRY_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LeaseWorkload {
    General,
    Analytics(u64),
}

#[derive(Default)]
struct AnalyticsEpoch {
    state: AtomicU64,
    admission_reopened: Notify,
}

impl AnalyticsEpoch {
    fn admitted_generation(&self) -> AppResult<u64> {
        let state = self.state.load(Ordering::Acquire);
        if state & ANALYTICS_CANCELLATION_COUNT_MASK != 0 {
            return Err(AppError::Cancelled);
        }
        Ok(state >> ANALYTICS_GENERATION_SHIFT)
    }

    fn begin_cancellation(&self) -> u64 {
        let mut observed = self.state.load(Ordering::Acquire);
        loop {
            let generation = (observed >> ANALYTICS_GENERATION_SHIFT)
                .checked_add(1)
                .filter(|generation| *generation <= u32::MAX as u64)
                .expect("analytics generation overflow");
            let active_cancellations = (observed & ANALYTICS_CANCELLATION_COUNT_MASK)
                .checked_add(1)
                .filter(|count| *count <= ANALYTICS_CANCELLATION_COUNT_MASK)
                .expect("analytics cancellation counter overflow");
            let closed = (generation << ANALYTICS_GENERATION_SHIFT) | active_cancellations;
            match self.state.compare_exchange_weak(
                observed,
                closed,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return generation,
                Err(actual) => observed = actual,
            }
        }
    }

    fn finish_cancellation(&self, generation: u64) {
        let mut observed = self.state.load(Ordering::Acquire);
        loop {
            let current_generation = observed >> ANALYTICS_GENERATION_SHIFT;
            let active_cancellations = observed & ANALYTICS_CANCELLATION_COUNT_MASK;
            debug_assert!(generation <= current_generation);
            debug_assert!(active_cancellations > 0);
            if active_cancellations == 0 {
                return;
            }

            let next =
                (current_generation << ANALYTICS_GENERATION_SHIFT) | (active_cancellations - 1);
            match self.state.compare_exchange_weak(
                observed,
                next,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    if active_cancellations == 1 {
                        self.admission_reopened.notify_waiters();
                    }
                    return;
                }
                Err(actual) => observed = actual,
            }
        }
    }

    fn admits(&self, generation: u64) -> bool {
        self.state.load(Ordering::Acquire) == generation << ANALYTICS_GENERATION_SHIFT
    }

    async fn wait_for_general_admission(&self) {
        loop {
            let reopened = self.admission_reopened.notified();
            tokio::pin!(reopened);
            reopened.as_mut().enable();

            if self.state.load(Ordering::Acquire) & ANALYTICS_CANCELLATION_COUNT_MASK == 0 {
                return;
            }

            reopened.await;
        }
    }
}

struct AnalyticsAdmissionClosure {
    epoch: Arc<AnalyticsEpoch>,
    generation: u64,
}

impl Drop for AnalyticsAdmissionClosure {
    fn drop(&mut self) {
        self.epoch.finish_cancellation(self.generation);
    }
}

#[derive(Default)]
struct WorkloadTracker {
    active: StdMutex<Option<LeaseWorkload>>,
}

impl WorkloadTracker {
    fn active(&self) -> std::sync::MutexGuard<'_, Option<LeaseWorkload>> {
        self.active
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn activate(self: Arc<Self>, workload: LeaseWorkload) -> ActiveWorkload {
        *self.active() = Some(workload);
        ActiveWorkload { tracker: self }
    }

    fn is_obsolete_analytics(&self, current_generation: u64) -> bool {
        matches!(
            *self.active(),
            Some(LeaseWorkload::Analytics(generation)) if generation < current_generation
        )
    }
}

struct ActiveWorkload {
    tracker: Arc<WorkloadTracker>,
}

impl Drop for ActiveWorkload {
    fn drop(&mut self) {
        *self.tracker.active() = None;
    }
}

async fn acquire_permit(
    available: Arc<Semaphore>,
    workload: LeaseWorkload,
    analytics_epoch: Arc<AnalyticsEpoch>,
) -> AppResult<OwnedSemaphorePermit> {
    ensure_admitted(workload, &analytics_epoch).await?;
    let permit = available
        .acquire_owned()
        .await
        .map_err(|_| AppError::Message("database pool closed".into()))?;

    ensure_admitted(workload, &analytics_epoch).await?;

    Ok(permit)
}

async fn ensure_admitted(
    workload: LeaseWorkload,
    analytics_epoch: &AnalyticsEpoch,
) -> AppResult<()> {
    match workload {
        LeaseWorkload::General => {
            analytics_epoch.wait_for_general_admission().await;
            Ok(())
        }
        LeaseWorkload::Analytics(generation) if analytics_epoch.admits(generation) => Ok(()),
        LeaseWorkload::Analytics(_) => Err(AppError::Cancelled),
    }
}

async fn drain_cancelled_gate<F, Fut>(gate: Arc<Mutex<()>>, mut retry_cancel: F) -> AppResult<()>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = AppResult<()>>,
{
    let mut first_error = None;
    loop {
        tokio::select! {
            gate = gate.clone().lock_owned() => {
                drop(gate);
                return match first_error {
                    Some(error) => Err(error),
                    None => Ok(()),
                };
            }
            _ = tokio::time::sleep(CANCEL_RETRY_INTERVAL) => {
                if let Err(error) = retry_cancel().await {
                    first_error.get_or_insert(error);
                }
            }
        }
    }
}

#[derive(Clone)]
struct PoolEntry {
    client: Arc<Client>,
    gate: Arc<Mutex<()>>,
    workload: Arc<WorkloadTracker>,
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

    async fn lease(
        self: &Arc<Self>,
        workload: LeaseWorkload,
        analytics_epoch: Arc<AnalyticsEpoch>,
    ) -> AppResult<Option<ClientLease>> {
        let permit =
            acquire_permit(self.available.clone(), workload, analytics_epoch.clone()).await?;
        let open_entries: Vec<PoolEntry> = self
            .entries
            .iter()
            .filter(|entry| !entry.client.is_closed())
            .cloned()
            .collect();
        if open_entries.is_empty() {
            return Ok(None);
        }

        let start = self.next.fetch_add(1, Ordering::Relaxed) % open_entries.len();
        for offset in 0..open_entries.len() {
            let entry = &open_entries[(start + offset) % open_entries.len()];
            if let Ok(gate) = entry.gate.clone().try_lock_owned() {
                if !entry.client.is_closed() {
                    ensure_admitted(workload, &analytics_epoch).await?;
                    let active_workload = entry.workload.clone().activate(workload);
                    ensure_admitted(workload, &analytics_epoch).await?;
                    return Ok(Some(ClientLease {
                        client: entry.client.clone(),
                        _workload: active_workload,
                        _gate: gate,
                        _permit: permit,
                    }));
                }
            }
        }

        let entry = open_entries[start].clone();
        let gate = entry.gate.clone().lock_owned().await;
        if entry.client.is_closed() {
            return Ok(None);
        }
        ensure_admitted(workload, &analytics_epoch).await?;
        let active_workload = entry.workload.clone().activate(workload);
        ensure_admitted(workload, &analytics_epoch).await?;
        Ok(Some(ClientLease {
            client: entry.client,
            _workload: active_workload,
            _gate: gate,
            _permit: permit,
        }))
    }
}

pub struct ClientLease {
    client: Arc<Client>,
    _workload: ActiveWorkload,
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
    analytics_epoch: Arc<AnalyticsEpoch>,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PoolState::default())),
            reconnect_lock: Arc::new(Mutex::new(())),
            analytics_epoch: Arc::new(AnalyticsEpoch::default()),
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
            workload: Arc::new(WorkloadTracker::default()),
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
        self.client_for(LeaseWorkload::General).await
    }

    pub async fn analytics_client(&self) -> AppResult<ClientLease> {
        let generation = self.analytics_epoch.admitted_generation()?;
        self.client_for(LeaseWorkload::Analytics(generation)).await
    }

    async fn client_for(&self, workload: LeaseWorkload) -> AppResult<ClientLease> {
        loop {
            let (pool, credentials) = {
                let state = self.inner.lock().await;
                (state.pool.clone(), state.credentials.clone())
            };

            if let Some(pool) = pool {
                if pool.has_open_client() {
                    if let Some(lease) = pool.lease(workload, self.analytics_epoch.clone()).await? {
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

    /// Requests PostgreSQL to stop the statement currently running on each
    /// pooled connection. This deliberately bypasses `client()` so route
    /// changes can free saturated leases instead of queueing behind them.
    pub async fn cancel_obsolete_analytics_queries(&self) -> AppResult<()> {
        let current_generation = self.analytics_epoch.begin_cancellation();
        let _reopen_admission = AnalyticsAdmissionClosure {
            epoch: self.analytics_epoch.clone(),
            generation: current_generation,
        };
        let (selected_entries, accept_invalid_certs) = {
            let state = self.inner.lock().await;
            let pool = state.pool.as_ref().ok_or(AppError::NotConnected)?;
            let credentials = state.credentials.as_ref().ok_or(AppError::NotConnected)?;
            let selected_entries = pool
                .entries
                .iter()
                .filter_map(|entry| {
                    if entry.client.is_closed() {
                        return None;
                    }

                    if entry.workload.is_obsolete_analytics(current_generation) {
                        Some(entry.clone())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();
            (selected_entries, credentials.accept_invalid_certs)
        };

        let mut first_error = None;
        for entry in &selected_entries {
            if let Err(error) = cancel_entry(entry, accept_invalid_certs).await {
                first_error.get_or_insert(error);
            }
        }

        for entry in selected_entries {
            let retry_entry = entry.clone();
            let drain_result = drain_cancelled_gate(entry.gate.clone(), move || {
                let retry_entry = retry_entry.clone();
                async move { cancel_entry(&retry_entry, accept_invalid_certs).await }
            })
            .await;
            if let Err(error) = drain_result {
                first_error.get_or_insert(error);
            }
        }

        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    pub async fn disconnect(&self) {
        let _reconnect_guard = self.reconnect_lock.lock().await;
        let mut state = self.inner.lock().await;
        state.pool = None;
        state.credentials = None;
    }
}

async fn cancel_entry(entry: &PoolEntry, accept_invalid_certs: bool) -> AppResult<()> {
    let tls = make_tls(accept_invalid_certs)?;
    entry
        .client
        .cancel_token()
        .cancel_query(tls)
        .await
        .map_err(AppError::from)
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tokio::sync::{oneshot, Mutex, Semaphore};

    use super::{
        acquire_permit, drain_cancelled_gate, AnalyticsAdmissionClosure, AnalyticsEpoch, AppError,
        LeaseWorkload, WorkloadTracker,
    };

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

    #[test]
    fn obsolete_analytics_queries_can_be_cancelled_without_waiting_for_a_lease() {
        let production = SOURCE
            .split("#[cfg(test)]")
            .next()
            .expect("production source");
        let cancellation = production
            .split("pub async fn cancel_obsolete_analytics_queries")
            .nth(1)
            .expect("connection state must expose analytics-only cancellation");

        assert!(cancellation.contains("cancel_token()"));
        assert!(cancellation.contains("cancel_query("));
        assert!(
            !cancellation.contains("self.client().await"),
            "cancellation must still work while every database lease is occupied"
        );
    }

    #[tokio::test]
    async fn queued_obsolete_analytics_request_is_rejected_before_leasing_freed_capacity() {
        let epoch = Arc::new(AnalyticsEpoch::default());
        let available = Arc::new(Semaphore::new(1));
        let occupied = available.clone().acquire_owned().await.unwrap();
        let old_generation = epoch.admitted_generation().unwrap();

        let waiter = tokio::spawn(acquire_permit(
            available.clone(),
            LeaseWorkload::Analytics(old_generation),
            epoch.clone(),
        ));
        tokio::task::yield_now().await;
        let cancellation = epoch.begin_cancellation();
        drop(occupied);

        assert!(waiter.await.unwrap().is_err());

        epoch.finish_cancellation(cancellation);

        let current = acquire_permit(
            available,
            LeaseWorkload::Analytics(epoch.admitted_generation().unwrap()),
            epoch,
        )
        .await;
        assert!(
            current.is_ok(),
            "new-generation analytics work must proceed"
        );
    }

    #[test]
    fn analytics_admission_stays_closed_until_the_latest_cancellation_finishes() {
        let epoch = AnalyticsEpoch::default();

        let first = epoch.begin_cancellation();
        assert!(epoch.admitted_generation().is_err());

        let second = epoch.begin_cancellation();
        epoch.finish_cancellation(first);
        assert!(
            epoch.admitted_generation().is_err(),
            "an older completion must not reopen a newer cancellation generation"
        );

        epoch.finish_cancellation(second);
        assert_eq!(epoch.admitted_generation().unwrap(), second);

        let third = epoch.begin_cancellation();
        let fourth = epoch.begin_cancellation();
        epoch.finish_cancellation(fourth);
        assert!(
            epoch.admitted_generation().is_err(),
            "a newer completion must wait for every older cancel attempt"
        );

        epoch.finish_cancellation(third);
        assert_eq!(epoch.admitted_generation().unwrap(), fourth);
    }

    #[tokio::test]
    async fn general_admission_waits_for_every_overlapping_cancellation_to_finish() {
        let epoch = Arc::new(AnalyticsEpoch::default());
        let first = epoch.begin_cancellation();
        let second = epoch.begin_cancellation();
        let (admitted_tx, mut admitted_rx) = oneshot::channel();
        let waiter_epoch = epoch.clone();

        tokio::spawn(async move {
            waiter_epoch.wait_for_general_admission().await;
            let _ = admitted_tx.send(());
        });
        tokio::task::yield_now().await;
        assert!(matches!(
            admitted_rx.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));

        epoch.finish_cancellation(second);
        tokio::task::yield_now().await;
        assert!(matches!(
            admitted_rx.try_recv(),
            Err(oneshot::error::TryRecvError::Empty)
        ));

        epoch.finish_cancellation(first);
        admitted_rx.await.unwrap();
    }

    #[tokio::test]
    async fn cancellation_keeps_admission_closed_until_selected_gate_drains_even_on_error() {
        let epoch = Arc::new(AnalyticsEpoch::default());
        let generation = epoch.begin_cancellation();
        let gate = Arc::new(Mutex::new(()));
        let held_gate = gate.clone().lock_owned().await;
        let (retry_tx, retry_rx) = oneshot::channel();
        let mut retry_tx = Some(retry_tx);
        let drain_epoch = epoch.clone();

        let drain = tokio::spawn(async move {
            let _reopen = AnalyticsAdmissionClosure {
                epoch: drain_epoch,
                generation,
            };
            drain_cancelled_gate(gate, move || {
                let retry_tx = retry_tx.take();
                async move {
                    if let Some(retry_tx) = retry_tx {
                        let _ = retry_tx.send(());
                    }
                    Err(AppError::Message("cancel retry failed".into()))
                }
            })
            .await
        });

        retry_rx.await.unwrap();
        assert!(
            epoch.admitted_generation().is_err(),
            "cancel was sent, but selected analytics still holds the gate"
        );

        drop(held_gate);
        assert!(drain.await.unwrap().is_err());
        assert!(epoch.admitted_generation().is_ok());
    }

    #[test]
    fn workload_tracking_never_marks_general_clients_for_analytics_cancellation() {
        let tracker = Arc::new(WorkloadTracker::default());

        let general = tracker.clone().activate(LeaseWorkload::General);
        assert!(!tracker.is_obsolete_analytics(1));
        drop(general);

        let analytics = tracker.clone().activate(LeaseWorkload::Analytics(0));
        assert!(tracker.is_obsolete_analytics(1));
        assert!(!tracker.is_obsolete_analytics(0));
        drop(analytics);

        assert!(!tracker.is_obsolete_analytics(1));
    }
}
