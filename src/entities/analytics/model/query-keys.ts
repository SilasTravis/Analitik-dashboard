import type { ComparisonArgs, ConversionArgs, PerfArgs, RangeArgs } from "./types";

export const analyticsKeys = {
  all: ["analytics"] as const,
  dashboardTraffic: (r: RangeArgs) => ["analytics", "dashboard-traffic", r.from, r.to] as const,
  dashboardGeo: (r: RangeArgs) => ["analytics", "dashboard-geo", r.from, r.to] as const,
  dashboardSessions: (r: RangeArgs) => ["analytics", "dashboard-sessions", r.from, r.to] as const,
  dashboardCommerce: (r: RangeArgs) => ["analytics", "dashboard-commerce", r.from, r.to] as const,
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
  perfOverview: (a: PerfArgs) => ["analytics", "perf-overview", a.from, a.to, a.device] as const,
  perfTrend: (a: PerfArgs) => ["analytics", "perf-trend", a.from, a.to, a.device] as const,
  pagePerf: (a: PerfArgs) => ["analytics", "page-perf", a.from, a.to, a.device] as const,
  orderStatuses: (r: RangeArgs) => ["analytics", "order-statuses", r.from, r.to] as const,
  conversionKpis: (a: ConversionArgs) =>
    ["analytics", "conversion-kpis", a.from, a.to, a.device, a.statuses.join(",")] as const,
  conversionFunnel: (a: ConversionArgs) =>
    ["analytics", "conversion-funnel", a.from, a.to, a.device, a.statuses.join(",")] as const,
};
