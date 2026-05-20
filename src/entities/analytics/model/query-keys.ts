import type { ComparisonArgs, RangeArgs } from "./types";

export const analyticsKeys = {
  all: ["analytics"] as const,
  kpi: (r: RangeArgs) => ["analytics", "kpi", r.from, r.to] as const,
  dailyTraffic: (r: RangeArgs) => ["analytics", "daily-traffic", r.from, r.to] as const,
  dailyRevenue: (r: RangeArgs) => ["analytics", "daily-revenue", r.from, r.to] as const,
  devices: (r: RangeArgs) => ["analytics", "devices", r.from, r.to] as const,
  browsers: (r: RangeArgs) => ["analytics", "browsers", r.from, r.to] as const,
  products: (r: RangeArgs) => ["analytics", "products", r.from, r.to] as const,
  orderSources: (r: RangeArgs) => ["analytics", "order-sources", r.from, r.to] as const,
  utm: (r: RangeArgs) => ["analytics", "utm", r.from, r.to] as const,
  geo: (r: RangeArgs) => ["analytics", "geo", r.from, r.to] as const,
  comparison: (a: ComparisonArgs) =>
    ["analytics", "comparison", a.granularity, a.count] as const,
  campaigns: (r: RangeArgs) => ["analytics", "campaigns", r.from, r.to] as const,
  referrers: (r: RangeArgs) => ["analytics", "referrers", r.from, r.to] as const,
  flowMap: (r: RangeArgs) => ["analytics", "flow-map", r.from, r.to] as const,
  flowEngagement: (r: RangeArgs) => ["analytics", "flow-engagement", r.from, r.to] as const,
};
