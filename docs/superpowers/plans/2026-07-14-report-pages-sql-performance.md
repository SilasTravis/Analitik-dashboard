# Report Pages SQL Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite SQL for Comparison, Campaigns, User Flow, and Performance to use existing production indexes while preserving all UI-facing contracts.

**Architecture:** Keep every existing Tauri command and response type. Introduce focused SQL constants and shared query-shape helpers inside the existing Rust command modules, use indexed candidate sets with exact final event-time predicates, and prove the rewrite with unit and live read-only checks.

**Tech Stack:** Rust, Tauri 2, tokio-postgres, PostgreSQL 14+, chrono, serde, React 18, TypeScript.

## Global Constraints

- Do not change UI source, command names, arguments, serialized response fields, or metric definitions.
- Do not create, alter, or remove database objects.
- Keep `occurred_at` as the exact final inclusion predicate for analytics data.
- Use existing page-view `received_at`, session `(source_type, session_registered_at)`, session ID, engagement page-view ID, basket session/time, and order indexes.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Regression tests for query shapes

**Files:**
- Modify: `src-tauri/src/commands/analytics.rs`
- Modify: `src-tauri/src/commands/user_flow.rs`
- Modify: `src-tauri/src/commands/performance.rs`

**Interfaces:**
- Consumes: existing SQL embedded in the four page commands.
- Produces: unit tests that specify indexed candidate bounds and forbid legacy full-table query shapes.

- [ ] Add tests that require one materialized page-view range for campaigns, bounded page-view and session candidates for comparison, sampled-session joins for User Flow, and indexed device probes for Performance.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml --lib report_sql` and confirm RED because the production SQL constants and required predicates do not exist.

### Task 2: Comparison and Campaign SQL

**Files:**
- Modify: `src-tauri/src/commands/analytics.rs`

**Interfaces:**
- Consumes: `ComparisonArgs`, `RangeArgs`, the existing production indexes, and dynamic session source values.
- Produces: unchanged `Vec<PeriodMetrics>` and `Vec<CampaignRow>`.

- [ ] Extract allowlisted comparison SQL construction and session source discovery.
- [ ] Bound page views by `received_at` plus 48 hours and sessions by `session_registered_at` plus five minutes, then apply exact half-open event bounds.
- [ ] Materialize the Campaign page-view range once and reuse it for page views and session attribution.
- [ ] Run the focused tests and confirm GREEN.

### Task 3: User Flow SQL

**Files:**
- Modify: `src-tauri/src/commands/user_flow.rs`

**Interfaces:**
- Consumes: `RangeArgs`, dynamic session source values, and existing session/page-view/engagement indexes.
- Produces: unchanged `PageFlowReport` and `Vec<PageEngagementRow>`.

- [ ] Add an indexed session candidate query with the existing deterministic ten-percent sample.
- [ ] Materialize distinct sampled sessions and join page views by session ID in both reports.
- [ ] Preserve transition, exit, duration, scroll, click, scale, and ordering semantics.
- [ ] Run focused tests and confirm GREEN.

### Task 4: Performance SQL

**Files:**
- Modify: `src-tauri/src/commands/performance.rs`

**Interfaces:**
- Consumes: `PerfArgs` and existing page-view received-time/session-ID indexes.
- Produces: unchanged `PerformanceOverview`, `Vec<PerformanceTrendPoint>`, and `Vec<PagePerformanceRow>`.

- [ ] Replace the full-session `GROUP BY` device subqueries with indexed mobile and desktop existence predicates.
- [ ] Add page-view candidate bounds to all three queries while retaining exact `occurred_at` inclusion.
- [ ] Preserve all percentile, coverage, daily fill, grouping, order, and limit semantics.
- [ ] Run focused tests and confirm GREEN.

### Task 5: Live parity and full verification

**Files:**
- Verify unchanged: `src/pages/comparison`, `src/pages/campaigns`, `src/pages/user-flow`, `src/pages/performance`, and their widget UI files.
- Remove temporary diagnostics that are not reusable regression coverage.

**Interfaces:**
- Consumes: legacy and optimized read-only SQL against saved production credentials.
- Produces: parity evidence, execution timing, plans, and a clean verified worktree delta.

- [ ] Compare optimized and legacy results over the default seven-day range.
- [ ] Capture execution timing and confirm the plans use bounded/indexed access paths.
- [ ] Run `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- [ ] Confirm no requested-page UI files changed and summarize exact performance evidence.
