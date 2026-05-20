import type { DateRange, RangePreset } from "./types";

export const RANGE_PRESETS: RangePreset[] = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "14d", label: "Last 14 days", days: 14 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

export const DEFAULT_PRESET_ID = "7d";

/** UTC midnight today → end of today, minus N-1 days. */
export function rangeFromDays(days: number): DateRange {
  const now = new Date();
  const to = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999,
  ));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Local YYYY-MM-DD string → ISO. `kind` controls start vs end of day. */
export function isoFromLocalDate(local: string, kind: "start" | "end"): string {
  const [y, m, d] = local.split("-").map(Number);
  const date = kind === "start"
    ? new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0))
    : new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return date.toISOString();
}

/** ISO → YYYY-MM-DD for a `<input type="date">`. */
export function localDateFromIso(iso: string): string {
  return iso.slice(0, 10);
}
