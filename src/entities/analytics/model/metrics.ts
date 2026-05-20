export type MetricKey = "visits" | "sessions" | "orders" | "revenue";
export type MetricFormat = "number" | "currency";

export type MetricDef = {
  key: MetricKey;
  label: string;
  formatAs: MetricFormat;
};

export const METRICS: MetricDef[] = [
  { key: "visits", label: "Visits", formatAs: "number" },
  { key: "sessions", label: "Sessions", formatAs: "number" },
  { key: "orders", label: "Orders", formatAs: "number" },
  { key: "revenue", label: "Revenue", formatAs: "currency" },
];
