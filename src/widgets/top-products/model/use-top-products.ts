import { useDashboardCommerce } from "@entities/analytics";

export function useTopProducts() {
  const query = useDashboardCommerce();
  return { ...query, data: query.data?.topProducts };
}
