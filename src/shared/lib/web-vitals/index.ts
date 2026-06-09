export type VitalRating = "good" | "needs-improvement" | "poor";

export type VitalKey =
  | "ttfb"
  | "fcp"
  | "lcp"
  | "cls"
  | "fid"
  | "dom_complete"
  | "full_load";

type Threshold = { good: number; poor: number };

/**
 * Good/poor cutoffs per metric. LCP/CLS/FID/FCP/TTFB follow Google's Core Web
 * Vitals thresholds; dom_complete/full_load have no official standard, so these
 * are pragmatic load-time heuristics.
 */
const THRESHOLDS: Record<VitalKey, Threshold> = {
  ttfb: { good: 800, poor: 1800 },
  fcp: { good: 1800, poor: 3000 },
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  fid: { good: 100, poor: 300 },
  dom_complete: { good: 2500, poor: 4000 },
  full_load: { good: 3000, poor: 6000 },
};

export function rateVital(key: VitalKey, value: number | null): VitalRating | null {
  if (value == null) return null;
  const t = THRESHOLDS[key];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

/** MUI palette color name for a rating. */
export function ratingColor(rating: VitalRating | null): "success" | "warning" | "error" | "inherit" {
  switch (rating) {
    case "good":
      return "success";
    case "needs-improvement":
      return "warning";
    case "poor":
      return "error";
    default:
      return "inherit";
  }
}

export const RATING_LABEL: Record<VitalRating, string> = {
  good: "Good",
  "needs-improvement": "Needs work",
  poor: "Poor",
};

/** Format a millisecond timing: <1000ms as "450 ms", otherwise "1.24 s". */
export function formatMs(value: number | null): string {
  if (value == null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

/** CLS is a unitless score shown to 3 decimals. */
export function formatCls(value: number | null): string {
  if (value == null) return "—";
  return value.toFixed(3);
}
