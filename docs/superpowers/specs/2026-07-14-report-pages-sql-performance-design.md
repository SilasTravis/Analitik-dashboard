# Report Pages SQL Performance Design

## Goal

Make Comparison, Campaigns, User Flow, and Performance return quickly without changing their Tauri command names, arguments, serialized response fields, metric definitions, or UI source.

## Evidence

The production database currently has about 11.8 million page views, 4.3 million sessions, and 7 million engagement rows. `analytics_page_views.occurred_at` and `analytics_sessions.occurred_at` are not directly indexed. Useful existing indexes include page-view `received_at`, page-view `session_id`, session `(source_type, session_registered_at)`, basket `(session_id, occurred_at)`, engagement `page_view_id`, order `created_at`, and partial order `(session_id, device_id)`.

The existing reports repeatedly scan unindexed `occurred_at` ranges. Performance device filters additionally aggregate every session for each of three requests. Campaign attribution reads the same page-view range twice. User Flow filters page views with `IN` after discovering sampled sessions through an unindexed session scan.

## Considered Approaches

1. Add database indexes or materialized rollups. This would provide the strongest long-term performance but changes production schema, while the requested scope is SQL implementation only.
2. Replace each page's API with one bundled response. This could reduce repeated work, but requires frontend contract migration and increases UI regression risk.
3. Keep current APIs and rewrite their SQL around existing indexes. This is selected because it removes the dominant full-table work while leaving the UI contract untouched.

## Query Design

- Page-view reports first bound candidates with `received_at` from 48 hours before to 48 hours after the requested event-time range, then apply the exact `occurred_at` predicate.
- Session reports discover current non-null `source_type` values with a recursive loose-index scan. They use `(source_type, session_registered_at)` with a five-minute margin, include the null source bucket, then apply exact `occurred_at` inclusion.
- Comparison uses half-open period bounds so future rows and the extra end boundary are excluded.
- Campaigns materializes one page-view candidate set and derives both per-campaign page views and one campaign per session from it. Basket and order attribution join from that bounded session set into existing session-led indexes.
- User Flow materializes distinct sampled sessions from the indexed session candidate set, then joins page views by indexed `session_id`; it no longer asks PostgreSQL to choose an `IN` plan over an unindexed event-time scan.
- Performance uses the page-view `received_at` candidate range. Mobile and desktop filters use indexed `EXISTS`/`NOT EXISTS` probes by session ID rather than grouping the full sessions table. Orphan page views remain excluded for device-specific filters, matching current behavior.

## Contracts and Safety

- Command names and Rust response structs remain unchanged.
- UI and TypeScript files for these four pages remain unchanged.
- Metric calculations, sample rate, device semantics, ordering, limits, and empty-day behavior remain unchanged.
- Candidate margins are optimizations only; `occurred_at` remains the authoritative final predicate.
- All SQL values remain bind parameters. Granularity remains allowlisted before interpolation.

## Verification

- Unit tests assert indexed candidate predicates, one-scan materialization, exact event-time predicates, indexed joins, and absence of the known whole-table patterns.
- Live read-only parity checks compare optimized results to legacy queries for the default range.
- `EXPLAIN (ANALYZE, BUFFERS)` and wall-clock timing validate the production plans.
- Rust tests, formatting, TypeScript type checking, production build, and diff checks must pass.
