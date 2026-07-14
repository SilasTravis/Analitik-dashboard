# Dashboard Query Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seven slow home-dashboard database requests with one shared response that uses existing indexes to narrow candidates while preserving `occurred_at` as the final analytics filter and leaving the UI unchanged.

**Architecture:** Add a focused Rust dashboard command that aggregates page views, sessions, orders, and products into one `DashboardOverview`. The React widget hooks will share one TanStack Query key and select their existing data slices, preserving all widget component interfaces and markup.

**Tech Stack:** Rust, Tauri 2, tokio-postgres, chrono, serde, React 18, TypeScript, TanStack Query 5.

## Global Constraints

- Do not create, alter, or remove database objects.
- Keep every home-dashboard widget, layout, label, loading state, and date-range interaction unchanged.
- Keep `occurred_at` as the final inclusion predicate for analytics rows.
- Keep the existing five-minute TanStack Query cache behavior.
- Preserve the existing metric definitions and snake-case nested response fields.
- The outer `DashboardOverview` response uses camel-case collection fields.
- The default seven-day uncached request must complete within 15 seconds in the current production environment.

---

### Task 1: Indexed candidate query module

**Files:**
- Create: `src-tauri/src/commands/dashboard.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Test: `src-tauri/src/commands/dashboard.rs` (`#[cfg(test)]` module)

**Interfaces:**
- Consumes: `RangeArgs`, `KpiOverview`, `DailyTraffic`, `DailyRevenue`, `DeviceBucket`, `ProductRow`, `SourceRow`, and `GeoRow` from `commands::analytics`.
- Produces: `DashboardOverview`, `get_dashboard_overview`, query constants, `build_kpi`, and row-merging helpers.

- [ ] **Step 1: Write failing SQL-contract and KPI tests**

Declare `pub mod dashboard;` in `src-tauri/src/commands/mod.rs`. Add a `#[cfg(test)]` module to the new file that references the wished-for query constants and helper:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_views_use_indexed_candidates_and_exact_event_time() {
        assert!(PAGE_VIEWS_SQL.contains("received_at BETWEEN ($1::timestamptz - interval '48 hours')"));
        assert!(PAGE_VIEWS_SQL.contains("occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"));
    }

    #[test]
    fn sessions_use_registered_candidates_and_exact_event_time() {
        assert!(SESSIONS_SQL.contains("source_type = ANY($3::text[])"));
        assert!(SESSIONS_SQL.contains("session_registered_at BETWEEN"));
        assert!(SESSIONS_SQL.contains("occurred_at BETWEEN $1::timestamptz AND $2::timestamptz"));
    }

    #[test]
    fn source_types_are_discovered_without_hard_coding_values() {
        assert!(SOURCE_TYPES_SQL.contains("WITH RECURSIVE source_types"));
        assert!(!SESSIONS_SQL.contains("'direct'"));
    }

    #[test]
    fn kpi_rates_are_derived_from_merged_totals() {
        let kpi = build_kpi(120, 40, 10, 1_000.0);
        assert_eq!(kpi.visits, 120);
        assert_eq!(kpi.sessions, 40);
        assert_eq!(kpi.avg_order_value, 100.0);
        assert_eq!(kpi.conversion_rate, 0.25);
    }
}
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `cargo test commands::dashboard::tests --manifest-path src-tauri/Cargo.toml`

Expected: compilation fails because the query constants and `build_kpi` helper do not exist.

- [ ] **Step 3: Implement the dashboard command data contract and query constants**

Create `dashboard.rs` with:

```rust
use chrono::{Duration, NaiveDate};
use serde::Serialize;
use tauri::State;
use tokio_postgres::types::ToSql;

use super::analytics::{
    DailyRevenue, DailyTraffic, DeviceBucket, GeoRow, KpiOverview, ProductRow,
    RangeArgs, SourceRow,
};
use crate::db::error::AppResult;
use crate::db::pool::ConnectionState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardOverview {
    pub kpi: KpiOverview,
    pub daily_traffic: Vec<DailyTraffic>,
    pub daily_revenue: Vec<DailyRevenue>,
    pub devices: Vec<DeviceBucket>,
    pub top_products: Vec<ProductRow>,
    pub order_sources: Vec<SourceRow>,
    pub geo: Vec<GeoRow>,
}

const SOURCE_TYPES_SQL: &str = r#"
WITH RECURSIVE source_types(source_type) AS (
    SELECT MIN(source_type) FROM analytics_sessions
    UNION ALL
    SELECT (
        SELECT MIN(s.source_type)
        FROM analytics_sessions s
        WHERE s.source_type > source_types.source_type
    )
    FROM source_types
    WHERE source_types.source_type IS NOT NULL
)
SELECT source_type FROM source_types WHERE source_type IS NOT NULL
"#;

const PAGE_VIEWS_SQL: &str = r#"
WITH filtered AS MATERIALIZED (
    SELECT occurred_at, viewer_country, viewer_city
    FROM analytics_page_views
    WHERE received_at BETWEEN ($1::timestamptz - interval '48 hours')
                          AND ($2::timestamptz + interval '48 hours')
      AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
), daily AS (
    SELECT date_trunc('day', occurred_at)::date AS day, COUNT(*)::bigint AS visits
    FROM filtered GROUP BY 1
), geo AS (
    SELECT COALESCE(NULLIF(viewer_country, ''), 'Unknown') AS country,
           COALESCE(NULLIF(viewer_city, ''), '—') AS city,
           COUNT(*)::bigint AS visits
    FROM filtered GROUP BY 1, 2 ORDER BY visits DESC LIMIT 10
)
SELECT 'total' AS kind, NULL::date AS day, NULL::text AS country,
       NULL::text AS city, COUNT(*)::bigint AS value
FROM filtered
UNION ALL
SELECT 'daily', day, NULL, NULL, visits FROM daily
UNION ALL
SELECT 'geo', NULL, country, city, visits FROM geo
"#;

const SESSIONS_SQL: &str = r#"
WITH filtered AS MATERIALIZED (
    SELECT session_id, occurred_at, is_mobile
    FROM analytics_sessions
    WHERE (source_type = ANY($3::text[]) OR source_type IS NULL)
      AND session_registered_at BETWEEN
          (($1::timestamptz - interval '5 minutes') AT TIME ZONE 'UTC') AND
          (($2::timestamptz + interval '5 minutes') AT TIME ZONE 'UTC')
      AND occurred_at BETWEEN $1::timestamptz AND $2::timestamptz
), daily AS (
    SELECT date_trunc('day', occurred_at)::date AS day,
           COUNT(DISTINCT session_id)::bigint AS sessions
    FROM filtered GROUP BY 1
), devices AS (
    SELECT CASE WHEN is_mobile THEN 'Mobile' ELSE 'Desktop' END AS device,
           COUNT(DISTINCT session_id)::bigint AS sessions
    FROM filtered GROUP BY 1
)
SELECT 'total' AS kind, NULL::date AS day, NULL::text AS device,
       COUNT(DISTINCT session_id)::bigint AS value
FROM filtered
UNION ALL
SELECT 'daily', day, NULL, sessions FROM daily
UNION ALL
SELECT 'device', NULL, device, sessions FROM devices
"#;

const ORDERS_SQL: &str = r#"
WITH filtered AS MATERIALIZED (
    SELECT created_at, total_price, order_source_type
    FROM orders
    WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
      AND deleted_at IS NULL
), daily AS (
    SELECT date_trunc('day', created_at)::date AS day,
           COUNT(*)::bigint AS orders,
           COALESCE(SUM(total_price), 0)::float8 AS revenue
    FROM filtered GROUP BY 1
), sources AS (
    SELECT COALESCE(NULLIF(order_source_type, ''), 'direct') AS source,
           COUNT(*)::bigint AS orders,
           COALESCE(SUM(total_price), 0)::float8 AS revenue
    FROM filtered GROUP BY 1 ORDER BY revenue DESC LIMIT 10
)
SELECT 'total' AS kind, NULL::date AS day, NULL::text AS source,
       COUNT(*)::bigint AS orders, COALESCE(SUM(total_price), 0)::float8 AS revenue
FROM filtered
UNION ALL
SELECT 'daily', day, NULL, orders, revenue FROM daily
UNION ALL
SELECT 'source', NULL, source, orders, revenue FROM sources
"#;

fn build_kpi(visits: i64, sessions: i64, orders: i64, revenue: f64) -> KpiOverview {
    KpiOverview {
        visits,
        sessions,
        orders,
        revenue,
        avg_order_value: if orders == 0 { 0.0 } else { revenue / orders as f64 },
        conversion_rate: if sessions == 0 { 0.0 } else { orders as f64 / sessions as f64 },
    }
}
```

Implement focused private functions that execute each SQL statement, parse its tagged rows, fill missing dates from `args.from.date_naive()` through `args.to.date_naive()` with zero values, merge page-view and session daily rows, and reuse the existing top-products SQL inside the command. Set `statement_timeout` to 15 seconds before loading the dashboard and guarantee `RESET statement_timeout` runs after either success or failure before returning.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run: `cargo test commands::dashboard::tests --manifest-path src-tauri/Cargo.toml`

Expected: four tests pass and no focused test fails.

- [ ] **Step 5: Run Rust formatting and the full Rust suite**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check && cargo test --manifest-path src-tauri/Cargo.toml`

Expected: formatting check exits 0 and all non-ignored tests pass.

- [ ] **Step 6: Commit the backend command**

```bash
git add src-tauri/src/commands/dashboard.rs src-tauri/src/commands/mod.rs
git commit -m "perf: aggregate home dashboard queries"
```

---

### Task 2: Register the command and share one frontend query

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/entities/analytics/model/types.ts`
- Modify: `src/entities/analytics/model/query-keys.ts`
- Modify: `src/entities/analytics/api/analytics.api.ts`
- Create: `src/entities/analytics/model/use-dashboard-overview.ts`
- Modify: `src/entities/analytics/index.ts`
- Modify: `src/widgets/kpi-overview/model/use-kpi.ts`
- Modify: `src/widgets/visits-chart/model/use-daily-visits.ts`
- Modify: `src/widgets/revenue-chart/model/use-daily-revenue.ts`
- Modify: `src/widgets/devices-overview/model/use-devices.ts`
- Modify: `src/widgets/top-products/model/use-top-products.ts`
- Modify: `src/widgets/utm-sources/model/use-utm-sources.ts`
- Modify: `src/widgets/geo-breakdown/model/use-geo.ts`

**Interfaces:**
- Consumes: Tauri command `get_dashboard_overview(args: RangeArgs)` and existing widget hook call sites.
- Produces: `DashboardOverview`, `analyticsKeys.dashboard`, `analyticsApi.getDashboardOverview`, and generic `useDashboardOverview(select)`.

- [ ] **Step 1: Migrate one hook to the wished-for shared API**

Replace `use-kpi.ts` with:

```ts
import { useDashboardOverview } from "@entities/analytics";

export function useKpi() {
  return useDashboardOverview((dashboard) => dashboard.kpi);
}
```

- [ ] **Step 2: Run type checking and confirm RED**

Run: `npm run typecheck`

Expected: type checking fails because `useDashboardOverview` is not exported yet.

- [ ] **Step 3: Add the frontend contract, register the command, and migrate all seven hooks**

Add to `types.ts`:

```ts
export type DashboardOverview = {
  kpi: KpiOverview;
  dailyTraffic: DailyTraffic[];
  dailyRevenue: DailyRevenue[];
  devices: DeviceBucket[];
  topProducts: ProductRow[];
  orderSources: SourceRow[];
  geo: GeoRow[];
};
```

Add `dashboard(range)` to `analyticsKeys`, add `getDashboardOverview(args)` to `analyticsApi`, export the type/hook through `entities/analytics/index.ts`, and create:

```ts
export function useDashboardOverview<TData = DashboardOverview>(
  select?: (data: DashboardOverview) => TData,
) {
  const range = useDateRangeStore((state) => state.range);
  return useQuery({
    queryKey: analyticsKeys.dashboard(range),
    queryFn: () => analyticsApi.getDashboardOverview(range),
    select,
  });
}
```

Register `commands::dashboard::get_dashboard_overview` in `src-tauri/src/lib.rs`. Keep the `useKpi` selector from Step 1 and migrate the remaining hooks to selectors for `dailyTraffic`, `dailyRevenue`, `devices`, `topProducts`, `orderSources`, and `geo`. Do not modify any widget UI file.

- [ ] **Step 4: Run type checking and build to confirm GREEN**

Run: `npm run typecheck && npm run build`

Expected: both commands exit 0 with no TypeScript or Vite build errors.

- [ ] **Step 5: Run Rust checks after command registration**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check && cargo test --manifest-path src-tauri/Cargo.toml`

Expected: formatting check and all non-ignored Rust tests pass.

- [ ] **Step 6: Commit the shared query integration**

```bash
git add src-tauri/src/lib.rs src/entities/analytics src/widgets/*/model
git commit -m "perf: share one home dashboard request"
```

---

### Task 3: Live parity, performance, and UI verification

**Files:**
- Modify only if verification exposes a defect: files from Tasks 1-2.
- Verify unchanged: `src/pages/dashboard/ui/DashboardPage.tsx` and all seven widget UI files.

**Interfaces:**
- Consumes: completed `get_dashboard_overview` command and shared frontend query.
- Produces: measured evidence that values remain compatible, response time is under 15 seconds, and UI source files are unchanged.

- [ ] **Step 1: Verify no UI source changed**

Run:

```bash
git diff 58ceac0 -- src/pages/dashboard/ui/DashboardPage.tsx \
  src/widgets/kpi-overview/ui src/widgets/visits-chart/ui \
  src/widgets/revenue-chart/ui src/widgets/devices-overview/ui \
  src/widgets/top-products/ui src/widgets/utm-sources/ui \
  src/widgets/geo-breakdown/ui
```

Expected: no diff output.

- [ ] **Step 2: Benchmark the combined SQL read-only against the current production database**

Use saved application credentials without printing them. Execute the page-view, session, order, and top-product statements with the default seven-day range in one connection and a 15-second statement timeout. Record each execution time and total wall time.

Expected: every statement finishes before its timeout and total wall time is below 15 seconds.

- [ ] **Step 3: Compare optimized and legacy result values**

Run the legacy queries with a 60-second diagnostic timeout and compare every returned KPI, daily bucket, device bucket, top product, order source, and geo bucket against the optimized response. Candidate-boundary exclusions, if any, must be counted explicitly.

Expected: all fields match; if delayed rows outside the approved margins exist, report the exact difference and stop for a product decision.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
npm run typecheck
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
git status --short
```

Expected: every command exits 0; status shows only intentional implementation and plan files.

- [ ] **Step 5: Launch and smoke-test the dashboard**

Run the Tauri development app, open Overview, switch among 7-day and 30-day ranges, and press Refresh once. Confirm all seven existing widgets, labels, layouts, spinners, charts, and error surfaces are unchanged and that one `get_dashboard_overview` invocation serves the page.

- [ ] **Step 6: Commit verification-driven corrections if needed**

If Steps 1-5 required a correction, commit only that correction and its regression test:

```bash
git add src-tauri/src/commands/dashboard.rs src-tauri/src/lib.rs \
  src/entities/analytics src/widgets/kpi-overview/model/use-kpi.ts \
  src/widgets/visits-chart/model/use-daily-visits.ts \
  src/widgets/revenue-chart/model/use-daily-revenue.ts \
  src/widgets/devices-overview/model/use-devices.ts \
  src/widgets/top-products/model/use-top-products.ts \
  src/widgets/utm-sources/model/use-utm-sources.ts \
  src/widgets/geo-breakdown/model/use-geo.ts
git commit -m "fix: preserve dashboard parity in fast query"
```

If no correction was required, do not create an empty commit.
