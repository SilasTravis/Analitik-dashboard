import { invoke } from "@shared/api";
import type {
  BrowserBucket,
  CampaignRow,
  ComparisonArgs,
  DailyRevenue,
  DailyTraffic,
  DeviceBucket,
  GeoRow,
  KpiOverview,
  PeriodMetrics,
  ProductRow,
  RangeArgs,
  ReferrerRow,
  SourceRow,
  UtmRow,
  PageFlowReport,
  PageEngagementRow,
} from "../model/types";

export const analyticsApi = {
  getKpiOverview: (args: RangeArgs) =>
    invoke<KpiOverview>("get_kpi_overview", { args }),
  getDailyTraffic: (args: RangeArgs) =>
    invoke<DailyTraffic[]>("get_daily_traffic", { args }),
  getDailyRevenue: (args: RangeArgs) =>
    invoke<DailyRevenue[]>("get_daily_revenue", { args }),
  getDevicesOverview: (args: RangeArgs) =>
    invoke<DeviceBucket[]>("get_devices_overview", { args }),
  getBrowsersOverview: (args: RangeArgs) =>
    invoke<BrowserBucket[]>("get_browsers_overview", { args }),
  getTopProducts: (args: RangeArgs) =>
    invoke<ProductRow[]>("get_top_products", { args }),
  getOrderSources: (args: RangeArgs) =>
    invoke<SourceRow[]>("get_order_sources", { args }),
  getUtmSources: (args: RangeArgs) =>
    invoke<UtmRow[]>("get_utm_sources", { args }),
  getGeoBreakdown: (args: RangeArgs) =>
    invoke<GeoRow[]>("get_geo_breakdown", { args }),
  getPeriodComparison: (args: ComparisonArgs) =>
    invoke<PeriodMetrics[]>("get_period_comparison", { args }),
  getCampaignsReport: (args: RangeArgs) =>
    invoke<CampaignRow[]>("get_campaigns_report", { args }),
  getReferrersReport: (args: RangeArgs) =>
    invoke<ReferrerRow[]>("get_referrers_report", { args }),
  getPageFlowMap: (args: RangeArgs) =>
    invoke<PageFlowReport>("get_page_flow_map", { args }),
  getPageEngagementReport: (args: RangeArgs) =>
    invoke<PageEngagementRow[]>("get_page_engagement_report", { args }),
};
