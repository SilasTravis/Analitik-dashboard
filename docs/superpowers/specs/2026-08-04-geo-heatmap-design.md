# GEO Heatmap Design

## Goal

Replace the unfinished Client Geography and Leaflet experiments with one production GEO page. The page renders client-session locations as a smooth Yandex Metrics-inspired heatmap over a MapLibre base map.

## Scope

- Add one authenticated route at `/geo` and one sidebar item labeled `GEO`.
- Remove the unfinished region choropleth, Leaflet heatmap, preview, and their dependencies.
- Preserve unrelated AI, authentication, database, and security work already present in the checkout.
- Use `analytics_sessions.geo` as the location source and `occurred_at` as the authoritative date filter.
- Treat each valid session row as weight `1`; the UI control adjusts visualization intensity.

## Backend contract

The Tauri command accepts a single object containing:

- `from` and `to`: ISO-8601 timestamps.
- `west`, `south`, `east`, and `north`: the requested map bounds.

The response contains:

```ts
type GeoHeatmapResponse = {
  points: Array<[longitude: number, latitude: number, weight: number]>;
};
```

The SQL normalizes the existing longitude/latitude array shape, applies the indexed candidate-time condition already used by analytics queries, applies the authoritative `occurred_at` condition, rejects invalid coordinates, and filters to the requested viewport. It selects only longitude, latitude, and unit weight.

The command uses the analytics connection pool asynchronously, applies a five-second PostgreSQL statement timeout, validates the date range and bounds, limits requests to 31 days, and uses an overflow sentinel rather than returning misleading partial data.

## Frontend architecture

MapLibre GL JS owns the map and navigation controls. A deck.gl `MapboxOverlay` keeps a `HeatmapLayer` synchronized with MapLibre and performs density aggregation on the GPU.

The component fetches only after a debounced map `moveend` event. Each request uses bounds expanded beyond the visible viewport. If a later viewport remains within the cached expanded bounds, the component reuses the existing points. Quantized React Query keys retain responses for revisited areas and date ranges. Rendering and camera animation never invoke Tauri.

The page initially fits Uzbekistan and constrains coordinate normalization to the existing Uzbekistan data contract. The tile style is configurable through `VITE_GEO_MAP_STYLE_URL`, with a public OpenStreetMap-compatible fallback that needs no Yandex resources.

## Visual design

The map fills the content area below the application header. A compact glass-effect panel floats above it and contains the existing date-range controls plus an intensity slider. A second floating element shows a transparent-to-yellow-to-orange-to-red density legend.

The heat layer uses sum aggregation and a transparent low-density color followed by yellow, orange, deep orange, and red. Zoom-dependent settings make distant views wide and soft and close views tighter and brighter:

- Country zoom: larger radius, lower intensity, higher fade threshold.
- Regional zoom: medium radius and balanced intensity.
- City and street zoom: smaller radius, higher intensity, lower threshold.

deck.gl viewport aggregation is debounced, and the aggregation texture is capped at a balanced size to preserve interaction smoothness.

## States and errors

- First load: centered progress treatment without hiding the base map.
- Background refetch: small non-blocking loading indicator.
- Empty viewport: explanatory overlay suggesting a wider date range or different area.
- Backend or tile error: clear inline message; previous cached heat remains visible when available.
- WebGL initialization failure: actionable unsupported-renderer message.

## Verification

- Rust unit tests cover range and bounding-box validation, compact serialization, query bounds, timeout/reset behavior, and overflow protection.
- Frontend tests cover viewport expansion/containment, cache-key quantization, zoom style tuning, and compact tuple filtering.
- Run frontend tests, TypeScript checks, the production build, Rust tests, scoped Rust formatting, and `git diff --check`.
- Perform local browser/runtime QA of the GEO route when the environment permits, while reporting live database or Tauri runtime validation separately if credentials are unavailable.
