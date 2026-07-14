import { useQuery } from "@tanstack/react-query";
import { useDateRangeStore } from "@entities/date-range";
import { analyticsApi } from "../api/analytics.api";
import { analyticsKeys } from "./query-keys";
import type {
  DailyTraffic,
  DashboardCommerce,
  DashboardSessions,
  DashboardTraffic,
  KpiOverview,
} from "./types";

export function useDashboardCommerce() {
  const range = useDateRangeStore((state) => state.range);
  return useQuery({
    queryKey: analyticsKeys.dashboardCommerce(range),
    queryFn: () => analyticsApi.getDashboardCommerce(range),
  });
}

export function useDashboardTraffic() {
  const range = useDateRangeStore((state) => state.range);
  return useQuery({
    queryKey: analyticsKeys.dashboardTraffic(range),
    queryFn: () => analyticsApi.getDashboardTraffic(range),
  });
}

export function useDashboardGeo() {
  const range = useDateRangeStore((state) => state.range);
  return useQuery({
    queryKey: analyticsKeys.dashboardGeo(range),
    queryFn: () => analyticsApi.getDashboardGeo(range),
  });
}

export function useDashboardSessions() {
  const range = useDateRangeStore((state) => state.range);
  return useQuery({
    queryKey: analyticsKeys.dashboardSessions(range),
    queryFn: () => analyticsApi.getDashboardSessions(range),
  });
}

export function useDashboardDomains() {
  // Commerce is intentionally requested first: it is the cheapest bundle and
  // unlocks three widgets while the existing single DB connection queues work.
  const commerce = useDashboardCommerce();
  const traffic = useDashboardTraffic();
  const sessions = useDashboardSessions();
  return { commerce, traffic, sessions };
}

export function mergeKpi(
  traffic: DashboardTraffic,
  sessions: DashboardSessions,
  commerce: DashboardCommerce,
): KpiOverview {
  return {
    visits: traffic.visits,
    sessions: sessions.sessions,
    orders: commerce.orders,
    revenue: commerce.revenue,
    avg_order_value: commerce.orders > 0 ? commerce.revenue / commerce.orders : 0,
    conversion_rate: sessions.sessions > 0 ? commerce.orders / sessions.sessions : 0,
  };
}

export function mergeDailyTraffic(
  traffic: DashboardTraffic,
  sessions: DashboardSessions,
): DailyTraffic[] {
  const byDate = new Map<string, DailyTraffic>();
  for (const row of traffic.dailyVisits) {
    byDate.set(row.date, { date: row.date, visits: row.visits, sessions: 0 });
  }
  for (const row of sessions.dailySessions) {
    const current = byDate.get(row.date);
    byDate.set(row.date, {
      date: row.date,
      visits: current?.visits ?? 0,
      sessions: row.sessions,
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
