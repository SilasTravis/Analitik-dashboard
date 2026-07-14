import { useDashboardCommerce } from "@entities/analytics";

export function useDailyRevenue() {
  const query = useDashboardCommerce();
  return { ...query, data: query.data?.dailyRevenue };
}
