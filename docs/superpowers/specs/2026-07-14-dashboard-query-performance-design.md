# Dashboard Query Performance Design

## Goal

Reduce the first uncached home-dashboard response from minutes to seconds without changing the database schema, changing the existing UI, or replacing `occurred_at` as the authoritative analytics timestamp.

## Constraints

- Do not create, alter, or remove database objects.
- Keep every home-dashboard widget, layout, label, loading state, and date-range interaction unchanged.
- Keep `occurred_at` as the final inclusion predicate for analytics rows.
- Keep the existing five-minute TanStack Query cache behavior.
- Preserve the existing definitions for visits, sessions, orders, revenue, average order value, conversion rate, devices, products, sources, and geography.

## Selected Approach

Add one `get_dashboard_overview` Tauri command and one shared frontend query. The command will replace the seven independently queued home-dashboard commands while leaving commands used by other pages unchanged.

The command will query each major dataset once:

1. Page views: use the existing `received_at` index to select a bounded candidate set, then apply the exact requested `occurred_at` range. The candidate range extends 48 hours before and after the requested range. Current sampled production data showed a maximum observed page-view delivery delay of about 24 hours, so the margin doubles the observed maximum.
2. Sessions: use the existing `(source_type, session_registered_at)` index to select candidates, then apply the exact requested `occurred_at` range. The candidate range extends five minutes before and after the requested range. Current sampled production data showed at most 0.5 seconds between `session_registered_at` and `occurred_at`.
3. Orders: keep the existing indexed `created_at` filters and aggregate KPI, daily-revenue, and order-source data from one bounded order set.
4. Products: retain the current top-products query because it already uses indexed order and product joins and completes independently in about two seconds.

The page-view, session, and order queries will each produce all home-dashboard aggregates needed from that dataset. Rust will merge the results into one serializable `DashboardOverview` response.

## Data Contract

`DashboardOverview` will contain:

- `kpi: KpiOverview`
- `dailyTraffic: DailyTraffic[]`
- `dailyRevenue: DailyRevenue[]`
- `devices: DeviceBucket[]`
- `topProducts: ProductRow[]`
- `orderSources: SourceRow[]`
- `geo: GeoRow[]`

The frontend analytics API will expose `getDashboardOverview(range)`. All seven home widget hooks will share one `analyticsKeys.dashboard(range)` query and use `select` to return only their existing widget data type. TanStack Query will deduplicate the shared request, cache the combined result, and refetch it once when Refresh invalidates analytics queries.

## Query Design

The page-view query will materialize only the columns needed by the home page after applying both predicates:

```sql
WHERE received_at BETWEEN ($1 - interval '48 hours') AND ($2 + interval '48 hours')
  AND occurred_at BETWEEN $1 AND $2
```

It will derive total visits, daily visits, and top geography from that single candidate set.

The session query will discover the known non-null `source_type` values using the existing source index, scan each source's bounded `session_registered_at` range, include the null source bucket, and finally apply:

```sql
WHERE occurred_at BETWEEN $1 AND $2
```

It will derive total distinct sessions, daily distinct sessions, and distinct sessions by device from one candidate set. Source values must not be hard-coded so newly introduced values remain included.

The order query will derive total orders and revenue, daily orders and revenue, and revenue by source from one bounded order set. Top products remains a separate query inside the same Tauri command.

## UI and Loading Behavior

No component markup or styling will change. Existing widget hooks retain their current public return shapes, so the widgets continue rendering their current spinners, errors, charts, and cards.

Because all widgets share one request, they will finish together instead of waiting behind separate database requests. Cached data and manual Refresh behavior remain unchanged.

## Error Handling

- Database errors propagate through the existing `AppResult` and Tauri invocation error path.
- A failed combined request must not partially replace cached dashboard data.
- TanStack Query retains the last successful result during a failed refresh under its existing cache lifecycle.
- The new command will use a finite statement timeout so an unexpected query plan cannot leave the UI waiting for minutes.

## Testing and Verification

Implementation will follow test-first development:

1. Rust unit tests will verify candidate bounds, the mandatory `occurred_at` predicates, dynamic session source handling, and merged KPI calculations.
2. Frontend type checking will verify every widget hook still exposes its existing data type.
3. Existing Rust tests and the production frontend build must pass.
4. A read-only live benchmark for the default seven-day range will compare the combined response against the old query results field by field and record total duration.
5. The dashboard will be opened locally to confirm that layout, labels, charts, loading states, date selection, and Refresh behavior are unchanged.

## Success Criteria

- No database schema or data is changed.
- Every home widget displays the same metric meaning and UI as before.
- The default seven-day uncached dashboard request completes within 15 seconds in the current production environment.
- One home-dashboard refresh produces one frontend analytics request instead of seven.
- All automated checks and the local UI smoke test pass.

## Known Boundary

The indexed candidate strategy assumes a page-view delivery delay no greater than 48 hours and a session registration difference no greater than five minutes. Rows outside those candidate margins cannot be found efficiently without a database index on `occurred_at`. The final inclusion decision inside each candidate set always uses `occurred_at`.
