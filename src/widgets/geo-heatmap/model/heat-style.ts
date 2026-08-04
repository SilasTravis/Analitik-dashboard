export type GeoHeatPoint = [
  longitude: number,
  latitude: number,
  weight: number,
];

export type GeoHeatStyle = {
  radiusPixels: number;
  intensity: number;
  threshold: number;
};

const UZBEKISTAN_BOUNDS = {
  west: 55.9,
  south: 37.1,
  east: 73.2,
  north: 45.7,
};

export const HEAT_COLOR_RANGE = [
  [255, 234, 0, 0],
  [255, 234, 0, 96],
  [255, 193, 7, 176],
  [255, 128, 0, 218],
  [244, 67, 54, 238],
  [198, 40, 40, 255],
] as const;

function isHeatPoint(value: unknown): value is GeoHeatPoint {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const [longitude, latitude, weight] = value;
  return (
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= UZBEKISTAN_BOUNDS.west &&
    longitude <= UZBEKISTAN_BOUNDS.east &&
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= UZBEKISTAN_BOUNDS.south &&
    latitude <= UZBEKISTAN_BOUNDS.north &&
    typeof weight === "number" &&
    Number.isFinite(weight) &&
    weight > 0
  );
}

export function filterHeatPoints(points: unknown[]): GeoHeatPoint[] {
  return points.filter(isHeatPoint);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function getHeatStyle(zoom: number): GeoHeatStyle {
  const progress = Math.min(1, Math.max(0, (zoom - 5) / 9));

  return {
    radiusPixels: Math.round(48 - 24 * progress),
    intensity: round(0.75 + 0.85 * progress),
    threshold: round(0.12 - 0.08 * progress),
  };
}
