# Progressive Dashboard Query Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement the independent backend bundles and review each bundle before integration. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace seven slow home-dashboard requests with three progressively rendered, independently cached domain bundles that preserve `occurred_at` filtering and the existing UI.

**Architecture:** Traffic, sessions, and commerce are separate Tauri commands and TanStack queries. Each command scans its main dataset once; existing widget hooks select or merge domain results while every widget UI component remains untouched.

**Tech Stack:** Rust, Tauri 2, tokio-postgres, chrono, serde, React 18, TypeScript, TanStack Query 5.

## Global Constraints

- Do not create, alter, or remove database objects.
- Work directly on `main`; the user explicitly approved this.
- Keep every dashboard page and widget UI source file unchanged.
- Keep `occurred_at` as the final page-view and session inclusion predicate.
- Keep the existing five-minute TanStack Query cache behavior.
- Preserve all existing metric definitions and response field naming.
- The first domain must render within five seconds and all three seven-day bundles must finish within 15 seconds in the current production environment.

---

### Task 1: Traffic bundle

**Files:**
- Create: `src-tauri/src/commands/dashboard_traffic.rs`

**Interfaces:**
- Consumes: `RangeArgs` and `GeoRow` from `commands::analytics`, `ConnectionState`, and `AppResult`.
- Produces: `DashboardTraffic { visits, daily_visits, geo }` and Tauri command `get_dashboard_traffic`.

- [ ] Write failing tests asserting the query contains the 48-hour `received_at` candidate range, exact `occurred_at BETWEEN $1 AND $2`, and a KPI helper preserves zero and nonzero counts.
- [ ] Run `cargo test dashboard_traffic --manifest-path src-tauri/Cargo.toml` and confirm RED because the constants/helpers are missing.
- [ ] Implement a single materialized candidate CTE that returns tagged total, daily, and top-10 geography rows. Fill missing days with zero visits.
- [ ] Guarantee `statement_timeout = '15s'` is reset after success or failure.
- [ ] Run focused tests, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, and report exact results. Do not edit shared module registration files and do not commit.

Required SQL predicate:

```sql
WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours')
                      AND ($2::timestamptz + interval '48 hours')
  AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
```

---

### Task 2: Sessions bundle

**Files:**
- Create: `src-tauri/src/commands/dashboard_sessions.rs`

**Interfaces:**
- Consumes: `RangeArgs` and `DeviceBucket` from `commands::analytics`, `ConnectionState`, and `AppResult`.
- Produces: `DashboardSessions { sessions, daily_sessions, devices }` and Tauri command `get_dashboard_sessions`.

- [ ] Write failing tests asserting dynamic source discovery, the five-minute registered-time candidate range, exact `occurred_at BETWEEN $1 AND $2`, and no hard-coded source values.
- [ ] Run `cargo test dashboard_sessions --manifest-path src-tauri/Cargo.toml` and confirm RED.
- [ ] Implement a recursive loose-index scan for non-null source types, then one materialized candidate query using `source_type = ANY($3::text[]) OR source_type IS NULL`.
- [ ] Return tagged total, daily, and device rows; fill missing days with zero sessions; preserve null `is_mobile` as Desktop to match the legacy `CASE WHEN` behavior.
- [ ] Guarantee `statement_timeout = '15s'` is reset after success or failure.
- [ ] Run focused tests, formatting check, and report exact results. Do not edit shared module registration files and do not commit.

Required SQL predicates:

```sql
WHERE (source_type = ANY($3::text[]) OR source_type IS NULL)
  AND session_registered_at BETWEEN
      (($1::timestamptz - interval '5 minutes') AT TIME ZONE 'UTC') AND
      (($2::timestamptz + interval '5 minutes') AT TIME ZONE 'UTC')
  AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
```

---

### Task 3: Commerce bundle

**Files:**
- Create: `src-tauri/src/commands/dashboard_commerce.rs`

**Interfaces:**
- Consumes: `RangeArgs`, `DailyRevenue`, `ProductRow`, and `SourceRow` from `commands::analytics`, `ConnectionState`, and `AppResult`.
- Produces: `DashboardCommerce { orders, revenue, daily_revenue, order_sources, top_products }` and Tauri command `get_dashboard_commerce`.

- [ ] Write failing tests asserting one bounded materialized order set powers totals, daily revenue, and sources, and top products join only bounded non-deleted orders.
- [ ] Run `cargo test dashboard_commerce --manifest-path src-tauri/Cargo.toml` and confirm RED.
- [ ] Implement the bundled order aggregate and top-products query while preserving legacy grouping, names, ordering, and limits.
- [ ] Fill missing days with zero orders and revenue and guarantee `statement_timeout = '15s'` is reset.
- [ ] Run focused tests, formatting check, and report exact results. Do not edit shared module registration files and do not commit.

Required order predicate:

```sql
WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
  AND deleted_at IS NULL
```

---

### Task 4: Shared registration and progressive frontend hooks

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/entities/analytics/model/types.ts`
- Modify: `src/entities/analytics/model/query-keys.ts`
- Modify: `src/entities/analytics/api/analytics.api.ts`
- Create: `src/entities/analytics/model/use-dashboard-domains.ts`
- Modify: `src/entities/analytics/index.ts`
- Modify: the seven home widget model hooks only.

**Interfaces:**
- Consumes: the three backend commands from Tasks 1-3.
- Produces: three query keys/API methods/domain hooks and the unchanged public result shapes of all seven widget hooks.

- [ ] Change `use-kpi.ts` first to import the wished-for domain hooks and run `npm run typecheck`; confirm RED due to missing exports.
- [ ] Register the three Rust modules and commands.
- [ ] Add TypeScript contracts `DashboardTraffic`, `DashboardSessions`, `DashboardCommerce`, `DailyVisits`, and `DailySessions` with camel-case collection fields matching Rust serialization.
- [ ] Add `dashboardTraffic`, `dashboardSessions`, and `dashboardCommerce` query keys and API methods.
- [ ] Implement three domain hooks. Initiate commerce first from `useKpi`, then traffic and sessions, so the cheapest domain is queued first on the existing single database connection.
- [ ] Implement pure merge helpers: KPI derives AOV and conversion; daily traffic merges dates with missing values as zero.
- [ ] Migrate seven widget hooks without editing any widget UI component.
- [ ] Run `npm run typecheck`, `npm run build`, Rust formatting, and all non-ignored Rust tests.
- [ ] Commit all reviewed backend and frontend implementation files with `git commit -m "perf: stream optimized dashboard domains"`.

Expected hook mapping:

```text
useKpi -> commerce + traffic + sessions
useDailyTraffic -> traffic + sessions
useDailyRevenue -> commerce
useDevices -> sessions
useTopProducts -> commerce
useOrderSources -> commerce
useGeoBreakdown -> traffic
```

---

### Task 5: Live performance, parity, and UI-source verification

**Files:**
- Verify unchanged: `src/pages/dashboard/ui/DashboardPage.tsx` and all seven widget UI directories.
- Modify implementation files only when a failing regression test demonstrates a defect.

- [ ] Confirm no UI-source diff from commit `790a8cc`.
- [ ] Benchmark the three optimized commands read-only for the default seven-day range with saved credentials hidden from output.
- [ ] Compare every optimized total, daily bucket, device bucket, source bucket, product row, and geo row against the legacy queries. Count candidate-boundary exclusions explicitly.
- [ ] Stop for a product decision if optimized values differ from legacy values because of rows outside approved margins.
- [ ] Run `npm run typecheck`, `npm run build`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `git diff --check`.
- [ ] Launch the dashboard and confirm progressive widget completion, date-range changes, Refresh, labels, charts, spinners, errors, and layout remain unchanged.
- [ ] Request broad final code review, fix every Critical or Important finding with a regression test, and re-run affected checks.
