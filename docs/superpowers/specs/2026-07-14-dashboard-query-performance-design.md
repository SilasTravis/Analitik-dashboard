# Dashboard Query Performance Design

## Goal

Reduce the first uncached home-dashboard response from minutes to seconds without changing the database schema, changing the existing UI, or replacing `occurred_at` as the authoritative analytics timestamp. Widgets must render progressively instead of waiting for one monolithic response.

## Constraints

- Do not create, alter, or remove database objects.
- Work on `main`, as explicitly approved by the user.
- Keep every home-dashboard widget, layout, label, loading state, and date-range interaction unchanged.
- Keep `occurred_at` as the final inclusion predicate for analytics rows.
- Keep the existing five-minute TanStack Query cache behavior.
- Preserve the existing definitions for visits, sessions, orders, revenue, average order value, conversion rate, devices, products, sources, and geography.

## Selected Approach

Replace seven independent home queries with four independently cached requests: traffic core, geography, sessions, and commerce. Splitting geography prevents its grouping work, latency, or failure from delaying visits, daily traffic, and KPI rendering.

### Traffic bundle

`get_dashboard_traffic` returns total visits and daily visits. It uses the existing `received_at` index to select a bounded candidate set, then applies the exact requested `occurred_at` range. The candidate range extends 48 hours before and after the requested range.

### Geography request

`get_dashboard_geo` returns the top ten geography rows. It independently applies the same 48-hour `received_at` candidate bound and exact `occurred_at` predicate. Its separate cache isolates geography latency and failures from traffic-core consumers.

### Sessions bundle

`get_dashboard_sessions` returns total distinct sessions, daily distinct sessions, and devices. It discovers non-null `source_type` values through the existing source index, uses the existing `(source_type, session_registered_at)` index to select candidates, includes the null source bucket, and then applies the exact requested `occurred_at` range. The candidate range extends five minutes before and after the requested range. Current sampled production data showed at most 0.5 seconds between `session_registered_at` and `occurred_at`.

### Commerce bundle

`get_dashboard_commerce` returns total orders and revenue, daily orders and revenue, order sources, and top products. It retains the existing indexed `created_at` filters and indexed joins.

## Data Contracts

```text
DashboardTraffic
  visits: number
  dailyVisits: DailyVisits[]

get_dashboard_geo
  returns GeoRow[]

DashboardSessions
  sessions: number
  dailySessions: DailySessions[]
  devices: DeviceBucket[]

DashboardCommerce
  orders: number
  revenue: number
  dailyRevenue: DailyRevenue[]
  orderSources: SourceRow[]
  topProducts: ProductRow[]
```

The frontend exposes four query keys and API methods. Existing widget hooks keep their current public shapes:

- `useKpi` combines all three bundles and derives average order value and conversion rate.
- `useDailyTraffic` combines `dailyVisits` and `dailySessions` by date.
- Revenue, source, and product hooks select the commerce bundle.
- Device selects the sessions bundle.
- Geography uses its own query.

TanStack Query deduplicates each request. Refresh invalidates all analytics keys, causing four requests rather than seven.

## Query Design

The traffic query applies both predicates while aggregating page views directly into daily totals:

```sql
WHERE received_at BETWEEN ($1 - interval '48 hours') AND ($2 + interval '48 hours')
  AND occurred_at BETWEEN $1 AND $2
```

Only the small daily aggregate and zero-filled result are materialized; the total is summed from those rows. This avoids materializing and rescanning roughly 1.5 million raw page views. The geography query groups the bounded page-view stream directly, without materializing raw geography rows.

The session query dynamically discovers source values, applies the indexed `session_registered_at` candidate range, and makes the final inclusion decision with:

```sql
WHERE occurred_at BETWEEN $1 AND $2
```

One `GROUPING SETS` pass derives total distinct sessions, daily distinct sessions, and devices. Only those grouped rows are materialized, and the generated day series still fills missing days with zero. Source values are not hard-coded.

The commerce query uses one `GROUPING SETS` pass for total revenue, daily revenue, and sources, materializing only the grouped rows. The already-fast top-product query separately joins the bounded orders to products.

## Progressive UI Behavior

No component markup or styling changes. Commerce, traffic core, and sessions unlock the existing KPI and chart dependencies. Geography renders from its independent request and may complete later without delaying other traffic widgets.

Existing widget spinners and errors remain in place. A failed bundle affects only widgets that consume that bundle; successful bundles remain visible and cached.

## Error Handling

- Database errors propagate through the existing `AppResult` and Tauri invocation path.
- Each bundle updates its cache atomically.
- TanStack Query retains each bundle's last successful result during a failed refresh under the existing cache lifecycle.
- Each bundle uses a finite statement timeout and guarantees the connection timeout setting is reset.

## Testing and Verification

Implementation follows test-first development:

1. Rust unit tests verify candidate bounds, mandatory `occurred_at` predicates, dynamic session source handling, and aggregate calculations.
2. TypeScript compile-time checks drive the frontend contract migration from a failing missing shared-hook import to a passing implementation.
3. Frontend type checking verifies every widget hook retains its existing data type.
4. Existing Rust tests and the production frontend build must pass.
5. Read-only live benchmarks compare optimized bundle values against legacy results and record each bundle's completion time.
6. Source comparison confirms dashboard and widget UI files remain unchanged.

## Success Criteria

- No database schema or data changes.
- Every home widget displays the same metric meaning and UI as before.
- The first request renders within five seconds and all four default seven-day requests finish within 15 seconds in the current production environment.
- One refresh produces four frontend analytics requests instead of seven.
- Splitting geography reduces traffic-core completion time without materially regressing total database work or all-request completion time.
- All automated checks and the local UI smoke test pass.

## Known Boundary

The indexed candidate strategy assumes a page-view delivery delay no greater than 48 hours and a session registration difference no greater than five minutes. Rows outside those candidate margins cannot be found efficiently without a database index on `occurred_at`. The final inclusion decision inside each candidate set always uses `occurred_at`.
