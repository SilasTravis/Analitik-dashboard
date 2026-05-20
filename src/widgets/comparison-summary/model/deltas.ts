import { METRICS, type MetricFormat, type MetricKey, type PeriodMetrics } from "@entities/analytics";

export type Delta = {
  key: MetricKey;
  label: string;
  current: number;
  previous: number;
  /** Signed percentage change, e.g. 0.123 = +12.3 %, -0.04 = -4 %. */
  change: number | null;
  formatAs: MetricFormat;
};

export function computeDeltas(periods: PeriodMetrics[]): Delta[] {
  const n = periods.length;
  const current = n > 0 ? periods[n - 1] : null;
  const previous = n > 1 ? periods[n - 2] : null;

  return METRICS.map((m) => {
    const cur = current ? Number(current[m.key]) : 0;
    const prev = previous ? Number(previous[m.key]) : 0;
    let change: number | null = null;
    if (previous) {
      change = prev === 0 ? (cur === 0 ? 0 : 1) : (cur - prev) / prev;
    }
    return { key: m.key, label: m.label, current: cur, previous: prev, change, formatAs: m.formatAs };
  });
}
