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
