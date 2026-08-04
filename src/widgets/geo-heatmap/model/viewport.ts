export type GeoBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export const UZBEKISTAN_BOUNDS: GeoBounds = {
  west: 55.9,
  south: 37.1,
  east: 73.2,
  north: 45.7,
};

const QUERY_GRID_DEGREES = 0.1;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function floorToGrid(value: number) {
  return Math.round(
    Math.floor(value / QUERY_GRID_DEGREES) * QUERY_GRID_DEGREES * 10,
  ) / 10;
}

function ceilToGrid(value: number) {
  return Math.round(
    Math.ceil(value / QUERY_GRID_DEGREES) * QUERY_GRID_DEGREES * 10,
  ) / 10;
}

export function expandBounds(bounds: GeoBounds, ratio = 0.25): GeoBounds {
  const longitudeBuffer = (bounds.east - bounds.west) * ratio;
  const latitudeBuffer = (bounds.north - bounds.south) * ratio;

  return {
    west: clamp(
      bounds.west - longitudeBuffer,
      UZBEKISTAN_BOUNDS.west,
      UZBEKISTAN_BOUNDS.east,
    ),
    south: clamp(
      bounds.south - latitudeBuffer,
      UZBEKISTAN_BOUNDS.south,
      UZBEKISTAN_BOUNDS.north,
    ),
    east: clamp(
      bounds.east + longitudeBuffer,
      UZBEKISTAN_BOUNDS.west,
      UZBEKISTAN_BOUNDS.east,
    ),
    north: clamp(
      bounds.north + latitudeBuffer,
      UZBEKISTAN_BOUNDS.south,
      UZBEKISTAN_BOUNDS.north,
    ),
  };
}

export function containsBounds(container: GeoBounds, candidate: GeoBounds) {
  return (
    container.west <= candidate.west &&
    container.south <= candidate.south &&
    container.east >= candidate.east &&
    container.north >= candidate.north
  );
}

export function quantizeBounds(bounds: GeoBounds): GeoBounds {
  return {
    west: clamp(
      floorToGrid(bounds.west),
      UZBEKISTAN_BOUNDS.west,
      UZBEKISTAN_BOUNDS.east,
    ),
    south: clamp(
      floorToGrid(bounds.south),
      UZBEKISTAN_BOUNDS.south,
      UZBEKISTAN_BOUNDS.north,
    ),
    east: clamp(
      ceilToGrid(bounds.east),
      UZBEKISTAN_BOUNDS.west,
      UZBEKISTAN_BOUNDS.east,
    ),
    north: clamp(
      ceilToGrid(bounds.north),
      UZBEKISTAN_BOUNDS.south,
      UZBEKISTAN_BOUNDS.north,
    ),
  };
}

export function geoHeatmapQueryKey(
  from: string,
  to: string,
  bounds: GeoBounds,
) {
  const quantized = quantizeBounds(bounds);
  return [
    "analytics",
    "geo-heatmap",
    from,
    to,
    quantized.west,
    quantized.south,
    quantized.east,
    quantized.north,
  ] as const;
}

export function buildGeoHeatmapArgs(
  range: { from: string; to: string },
  bounds: GeoBounds,
) {
  return {
    ...range,
    ...quantizeBounds(bounds),
  };
}
