# GEO Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the discarded Client Geography/Leaflet draft with one production `/geo` page using a compact viewport-filtered Tauri contract, MapLibre, and a deck.gl GPU heatmap.

**Architecture:** PostgreSQL returns only bounded `[longitude, latitude, weight]` tuples through an async Tauri command. A React Query hook caches expanded, quantized viewport requests, while MapLibre owns camera interaction and a deck.gl `HeatmapLayer` renders zoom-tuned density without IPC calls during animation.

**Tech Stack:** Rust, Tauri 2, tokio-postgres, React 18, TypeScript, React Query, MUI, MapLibre GL JS, deck.gl.

## Global Constraints

- The sidebar label is exactly `GEO` and the authenticated route is exactly `/geo`.
- Preserve unrelated AI, authentication, database, and security edits in the dirty checkout.
- Remove Leaflet, `leaflet.heat`, `@svg-maps/uzbekistan`, the region choropleth, and old GEO preview experiments.
- Use `analytics_sessions.geo`, the indexed `session_registered_at` candidate range, and authoritative `occurred_at` filtering.
- Treat every returned valid session coordinate as unit weight.
- Keep a five-second SQL timeout, 31-day range cap, viewport validation, and an overflow sentinel.
- Invoke the backend only after debounced pan/zoom completion, never per animation frame.

---

### Task 1: Lock the compact backend contract

**Files:**
- Replace: `src-tauri/src/commands/client_region_geo.rs` with `src-tauri/src/commands/geo_heatmap.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `RangeArgs`-compatible ISO timestamps and `ConnectionState::analytics_client()`.
- Produces: `get_geo_heatmap(args: GeoHeatmapArgs) -> AppResult<GeoHeatmapResponse>`, where `GeoHeatmapResponse.points` serializes tuples as JSON arrays.

- [ ] **Step 1: Write failing Rust tests**

Add tests requiring valid date/bounds acceptance, inverted/overlong date rejection, invalid bounds rejection, SQL use of `analytics_sessions.geo`, `session_registered_at`, `occurred_at`, four viewport predicates, `LIMIT 50001`, and response overflow rejection.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml geo_heatmap --lib`

Expected: FAIL because `geo_heatmap` and its contract do not exist.

- [ ] **Step 3: Implement the command**

Define:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoHeatmapArgs {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub west: f64,
    pub south: f64,
    pub east: f64,
    pub north: f64,
}

#[derive(Debug, Serialize)]
pub struct GeoHeatmapResponse {
    pub points: Vec<(f64, f64, f64)>,
}
```

Normalize the Uzbekistan `geo` array orientation in SQL, filter to bounds, return unit weight, execute under the existing analytics lease and timeout/reset pattern, and reject 50,001 rows.

- [ ] **Step 4: Register and verify the command**

Run: `cargo test --manifest-path src-tauri/Cargo.toml geo_heatmap --lib`

Expected: PASS.

- [ ] **Step 5: Commit the backend contract**

Stage only the new command, command module, and `src-tauri/src/lib.rs`, then commit `feat: add bounded GEO heatmap command`.

### Task 2: Build viewport caching and zoom tuning test-first

**Files:**
- Create: `src/widgets/geo-heatmap/model/viewport.ts`
- Create: `src/widgets/geo-heatmap/model/heat-style.ts`
- Replace: `tests/client-region-geo.test.mjs` with `tests/geo-heatmap.test.mjs`
- Delete: `tests/client-region-focus.test.mjs`

**Interfaces:**
- Produces: `expandBounds`, `containsBounds`, `quantizeBounds`, `geoHeatmapQueryKey`, `getHeatStyle`, and `filterHeatPoints`.
- Consumers: the React Query hook and map component in Tasks 3 and 4.

- [ ] **Step 1: Write failing frontend tests**

Test that expanded bounds include a 25% buffer and remain within Uzbekistan limits, contained viewports reuse the buffer, quantization makes small interactions share a key, invalid tuples are removed, and radius decreases while intensity increases between zoom 5 and zoom 14.

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test tests/geo-heatmap.test.mjs`

Expected: FAIL because the model modules do not exist.

- [ ] **Step 3: Implement pure model functions**

Use this contract:

```ts
export type GeoBounds = { west: number; south: number; east: number; north: number };
export type GeoHeatPoint = [longitude: number, latitude: number, weight: number];
export type GeoHeatStyle = { radiusPixels: number; intensity: number; threshold: number };
```

Clamp bounds to `{ west: 55.9, south: 37.1, east: 73.2, north: 45.7 }`, quantize to 0.1 degrees, and interpolate heat settings across zoom stops.

- [ ] **Step 4: Run the pure tests**

Run: `node --test tests/geo-heatmap.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the frontend model**

Stage only the two model modules and GEO model test, then commit `feat: add GEO viewport cache model`.

### Task 3: Connect the compact Tauri API and React Query cache

**Files:**
- Modify: `src/entities/analytics/model/types.ts`
- Modify: `src/entities/analytics/api/analytics.api.ts`
- Modify: `src/entities/analytics/model/query-keys.ts`
- Modify: `src/entities/analytics/index.ts`
- Create: `src/entities/analytics/model/use-geo-heatmap.ts`
- Delete: `src/entities/analytics/model/use-client-geo-heatmap.ts`
- Delete: `src/entities/analytics/model/use-client-region-geo.ts`

**Interfaces:**
- Consumes: `GeoHeatmapArgs`, `GeoHeatmapResponse`, `GeoBounds`, and `geoHeatmapQueryKey`.
- Produces: `useGeoHeatmap(bounds, enabled)` with five-minute freshness and retained prior data.

- [ ] **Step 1: Add API contract assertions to the frontend test**

Require `analyticsApi.getGeoHeatmap(args)` to invoke `get_geo_heatmap`, require the query key to include dates and quantized bounds, and forbid legacy client-region exports.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL on missing GEO API/hook and remaining legacy exports.

- [ ] **Step 3: Implement types, invocation, key, and hook**

The hook reads the global date range, invokes the backend with the cached expanded bounds, enables placeholder retention, and relies on the existing QueryProvider cache lifetime.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`

Expected: PASS for the implemented API layer; map component imports may remain pending only if not yet introduced.

- [ ] **Step 5: Commit the API layer**

Stage only analytics entity files and commit `feat: connect GEO heatmap cache`.

### Task 4: Implement the MapLibre and deck.gl heatmap page

**Files:**
- Create: `src/widgets/geo-heatmap/ui/GeoHeatmap.tsx`
- Create: `src/widgets/geo-heatmap/index.ts`
- Create: `src/pages/geo/ui/GeoPage.tsx`
- Create: `src/pages/geo/index.ts`
- Modify: `src/app/routes/AppRouter.tsx`
- Modify: `src/shared/config/routes.ts`
- Modify: `src/widgets/sidebar/ui/Sidebar.tsx`
- Modify: `src/app/styles/global.css`

**Interfaces:**
- Consumes: `useGeoHeatmap`, `DateRangePicker`, viewport helpers, heat-style helpers, `MapboxOverlay`, and `HeatmapLayer`.
- Produces: authenticated `/geo` page and sidebar label `GEO`.

- [ ] **Step 1: Add source-level page assertions**

Require `/geo`, exact `GEO` label, MapLibre construction, one `MapboxOverlay`, `HeatmapLayer`, a debounced `moveend` fetch path, floating date control, intensity slider, gradient legend, and loading/empty/error copy.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because the GEO page and widget do not exist.

- [ ] **Step 3: Implement the map lifecycle**

Create one MapLibre map on mount, add navigation controls and one deck overlay, debounce `moveend` by 300 ms, request an expanded viewport only when it escapes the cached request, update deck props when points/zoom/intensity change, and finalize both map and overlay on unmount.

- [ ] **Step 4: Implement controls and states**

Place `DateRangePicker` and a MUI slider in the floating panel; add transparent-yellow-orange-red legend, first-load progress, background loading bar, empty result overlay, and error alert while keeping stale data visible.

- [ ] **Step 5: Wire route and sidebar**

Replace the client-geography route/import/item with `ROUTES.geo = "/geo"`, `GeoPage`, and label `GEO`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the page**

Stage only the GEO widget/page, route, sidebar, and scoped global CSS, then commit `feat: add MapLibre GEO heatmap page`.

### Task 5: Replace dependencies and remove discarded experiments

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `src/pages/client-geography/`
- Delete: `src/widgets/client-region-map/`
- Delete: `src/preview/client-geography.tsx`
- Delete: `src/types/leaflet.heat.d.ts`
- Delete: `geo-preview.html`
- Delete: obsolete untracked client-geo design and plan files except the approved GEO design and this plan.

**Interfaces:**
- Produces: a dependency graph containing MapLibre/deck.gl and no Leaflet/svg-map packages.

- [ ] **Step 1: Replace packages**

Remove `leaflet`, `leaflet.heat`, `@types/leaflet`, `@svg-maps/uzbekistan`, and `@types/svg-maps__common`. Add compatible current versions of `maplibre-gl`, `@deck.gl/core`, `@deck.gl/aggregation-layers`, and `@deck.gl/mapbox`.

- [ ] **Step 2: Remove only obsolete GEO artifacts**

Delete the old page, widgets, preview, Leaflet declaration, preview HTML, obsolete region tests, and superseded client-geo specs/plans. Preserve all unrelated dirty files.

- [ ] **Step 3: Verify package and import cleanup**

Run: `rg -n 'leaflet|svg-maps|client-region|clientGeography|ClientGeography' package.json src src-tauri tests`

Expected: no matches.

- [ ] **Step 4: Run frontend verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit dependency cleanup**

Stage only dependency files and deleted GEO experiments, then commit `chore: replace GEO mapping stack`.

### Task 6: Full verification and runtime QA

**Files:**
- Verify all files changed by Tasks 1-5.

**Interfaces:**
- Produces: evidence that the GEO feature is ready without claiming unperformed live database validation.

- [ ] **Step 1: Run the frontend gate**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 2: Run the Rust gate**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --skip test_db_schema`

Expected: PASS apart from explicitly credential-dependent ignored tests.

- [ ] **Step 3: Run formatting and diff checks**

Run scoped `cargo fmt --manifest-path src-tauri/Cargo.toml --check -- src/commands/geo_heatmap.rs src/commands/mod.rs src/lib.rs`, then `git diff --check`.

Expected: PASS.

- [ ] **Step 4: Run local visual QA**

Start the Vite app, open `/geo` in the browser where authentication/runtime constraints permit, and verify map sizing, controls, heat gradient, loading, and empty states. If browser-only mode cannot invoke Tauri or authenticated database credentials are unavailable, report that boundary explicitly.

- [ ] **Step 5: Review final scope**

Confirm `git status --short` shows unrelated pre-existing changes untouched and no obsolete GEO artifact remains.
