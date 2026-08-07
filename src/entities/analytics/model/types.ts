import type { DateRange } from "@entities/date-range";

export type RangeArgs = DateRange;

export type KpiOverview = {
  visits: number;
  sessions: number;
  orders: number;
  revenue: number;
  avg_order_value: number;
  conversion_rate: number;
};

export type DailyTraffic = {
  date: string;
  visits: number;
  sessions: number;
};

export type DailyRevenue = {
  date: string;
  orders: number;
  revenue: number;
};

export type DeviceBucket = {
  device: string;
  count: number;
};

export type BrowserBucket = {
  browser: string;
  count: number;
};

export type ProductRow = {
  sap_code: string;
  name: string;
  purchases: number;
  revenue: number;
};

export type SourceRow = {
  source: string;
  orders: number;
  revenue: number;
};

export type UtmRow = {
  source: string;
  visits: number;
};

export type GeoRow = {
  country: string;
  city: string;
  visits: number;
};

export type GeoHeatmapArgs = RangeArgs & {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type GeoHeatPoint = [
  longitude: number,
  latitude: number,
  weight: number,
];

export type GeoHeatmapResponse = {
  points: GeoHeatPoint[];
};

export type DailyVisits = {
  date: string;
  visits: number;
};

export type DailySessions = {
  date: string;
  sessions: number;
};

export type DashboardTraffic = {
  visits: number;
  dailyVisits: DailyVisits[];
};

export type DashboardSessions = {
  sessions: number;
  dailySessions: DailySessions[];
  devices: DeviceBucket[];
};

export type DashboardCommerce = {
  orders: number;
  revenue: number;
  dailyRevenue: DailyRevenue[];
  orderSources: SourceRow[];
  topProducts: ProductRow[];
};

export type ComparisonArgs = {
  granularity: "week" | "month" | "year";
  count: number;
};

export type PeriodMetrics = {
  period_start: string;
  label: string;
  visits: number;
  sessions: number;
  orders: number;
  revenue: number;
};

export type CampaignRow = {
  campaign: string;
  page_views: number;
  sessions: number;
  baskets: number;
  orders: number;
  revenue: number;
};

export type ReferrerRow = {
  referrer: string;
  page_views: number;
  sessions: number;
};

export type FlowLink = {
  source: string;
  target: string;
  volume: number;
};

export type PageFlowReport = {
  links: FlowLink[];
};

export type PageEngagementRow = {
  page_type: string;
  views_count: number;
  avg_duration_seconds: number;
  avg_scroll_depth: number;
  avg_click_count: number;
};

export type DeviceFilter = "all" | "mobile" | "desktop";

export type PerfArgs = RangeArgs & {
  device: DeviceFilter;
};

export type PerformanceOverview = {
  total_views: number;
  measured_views: number;
  ttfb_p75: number | null;
  fcp_p75: number | null;
  lcp_p75: number | null;
  cls_p75: number | null;
  fid_p75: number | null;
  dom_complete_p75: number | null;
  full_load_p75: number | null;
};

export type PerformanceTrendPoint = {
  date: string;
  lcp_p75: number | null;
  fcp_p75: number | null;
  full_load_p75: number | null;
};

export type PagePerformanceRow = {
  page_type: string;
  views_count: number;
  measured_views: number;
  lcp_p75: number | null;
  cls_p75: number | null;
  fid_p75: number | null;
  full_load_p75: number | null;
};

export type OrderStatusRow = {
  status: string;
  orders: number;
};

export type ConversionArgs = RangeArgs & {
  device: DeviceFilter;
  /** Order statuses that count as a completed conversion. */
  statuses: string[];
};

export type ConversionFunnel = {
  sessions: number;
  viewed_product: number;
  added_basket: number;
  order_placed: number;
  order_completed: number;
};

export type HourlyOrderPoint = {
  /** 0-23, Uzbekistan wall-clock hour (server buckets by a fixed UTC+5). */
  hour: number;
  total: number;
  bySource: Record<string, number>;
};

export type LiveOrderStats = {
  totalOrders: number;
  /** Distinct orders.source values seen, ordered by volume descending. */
  sources: string[];
  /** 24 entries, index 0 = 00:00 Uzbekistan time. */
  hourly: HourlyOrderPoint[];
};

export type LiveOrderStatsArgs = {
  /** Uzbekistan calendar day, `YYYY-MM-DD` — not a UTC instant. The backend
   * converts `created_at` into Uzbekistan wall-clock time itself. */
  day: string;
};

export type ConversionKpis = {
  sessions: number;
  basket_sessions: number;
  ordering_sessions: number;
  completed_sessions: number;
  orders_placed: number;
  orders_completed: number;
  revenue_placed: number;
  revenue_completed: number;
  attributed_orders: number;
  total_orders: number;
  session_to_basket_rate: number;
  basket_to_order_rate: number;
  session_to_order_rate: number;
  cart_abandonment_rate: number;
  avg_order_value: number;
  revenue_per_session: number;
  attributed_pct: number;
};
