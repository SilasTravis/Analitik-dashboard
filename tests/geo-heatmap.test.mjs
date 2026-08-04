import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
  );
}

test("expanded viewport adds a 25 percent cache buffer and clamps to Uzbekistan", async () => {
  const { expandBounds } = await loadTypeScriptModule(
    "../src/widgets/geo-heatmap/model/viewport.ts",
  );

  assert.deepEqual(
    expandBounds({ west: 68, south: 40, east: 70, north: 42 }),
    { west: 67.5, south: 39.5, east: 70.5, north: 42.5 },
  );
  assert.deepEqual(
    expandBounds({ west: 55.9, south: 37.1, east: 73.2, north: 45.7 }),
    { west: 55.9, south: 37.1, east: 73.2, north: 45.7 },
  );
});

test("viewport containment detects whether cached overscan still covers the map", async () => {
  const { containsBounds } = await loadTypeScriptModule(
    "../src/widgets/geo-heatmap/model/viewport.ts",
  );
  const cached = { west: 67.5, south: 39.5, east: 70.5, north: 42.5 };

  assert.equal(
    containsBounds(cached, { west: 68.2, south: 40, east: 70, north: 42 }),
    true,
  );
  assert.equal(
    containsBounds(cached, { west: 67.4, south: 40, east: 70, north: 42 }),
    false,
  );
});

test("quantized bounds make minor interactions share a stable query key", async () => {
  const { geoHeatmapQueryKey, quantizeBounds } = await loadTypeScriptModule(
    "../src/widgets/geo-heatmap/model/viewport.ts",
  );
  const first = { west: 67.51, south: 39.51, east: 70.49, north: 42.49 };
  const second = { west: 67.54, south: 39.54, east: 70.46, north: 42.46 };

  assert.deepEqual(quantizeBounds(first), {
    west: 67.5,
    south: 39.5,
    east: 70.5,
    north: 42.5,
  });
  assert.deepEqual(
    geoHeatmapQueryKey("2026-08-01", "2026-08-04", first),
    geoHeatmapQueryKey("2026-08-01", "2026-08-04", second),
  );
});

test("GEO request payload and analytics key use the compact Rust contract", async () => {
  const { buildGeoHeatmapArgs } = await loadTypeScriptModule(
    "../src/widgets/geo-heatmap/model/viewport.ts",
  );
  const { analyticsKeys } = await loadTypeScriptModule(
    "../src/entities/analytics/model/query-keys.ts",
  );
  const args = buildGeoHeatmapArgs(
    { from: "2026-08-01T00:00:00Z", to: "2026-08-04T23:59:59Z" },
    { west: 67.51, south: 39.51, east: 70.49, north: 42.49 },
  );

  assert.deepEqual(args, {
    from: "2026-08-01T00:00:00Z",
    to: "2026-08-04T23:59:59Z",
    west: 67.5,
    south: 39.5,
    east: 70.5,
    north: 42.5,
  });
  assert.deepEqual(analyticsKeys.geoHeatmap(args), [
    "analytics",
    "geo-heatmap",
    "2026-08-01T00:00:00Z",
    "2026-08-04T23:59:59Z",
    67.5,
    39.5,
    70.5,
    42.5,
  ]);
});

test("compact heat tuples reject invalid coordinates and weights", async () => {
  const { filterHeatPoints } = await loadTypeScriptModule(
    "../src/widgets/geo-heatmap/model/heat-style.ts",
  );
  const points = [
    [69.2401, 41.2995, 1],
    [66.9597, 39.6542, 2],
    [54, 41, 1],
    [69, 50, 1],
    [69, 41, 0],
    [Number.NaN, 41, 1],
  ];

  assert.deepEqual(filterHeatPoints(points), [
    [69.2401, 41.2995, 1],
    [66.9597, 39.6542, 2],
  ]);
});

test("heat kernel tightens and brightens from country to city zoom", async () => {
  const { getHeatStyle } = await loadTypeScriptModule(
    "../src/widgets/geo-heatmap/model/heat-style.ts",
  );

  assert.deepEqual(getHeatStyle(5), {
    radiusPixels: 48,
    intensity: 0.75,
    threshold: 0.12,
  });
  assert.deepEqual(getHeatStyle(14), {
    radiusPixels: 24,
    intensity: 1.6,
    threshold: 0.04,
  });
  assert.ok(getHeatStyle(9).radiusPixels < getHeatStyle(5).radiusPixels);
  assert.ok(getHeatStyle(9).intensity > getHeatStyle(5).intensity);
});
