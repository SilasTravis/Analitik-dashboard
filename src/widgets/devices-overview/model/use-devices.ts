import { useDashboardSessions } from "@entities/analytics";

export function useDevices() {
  const query = useDashboardSessions();
  return { ...query, data: query.data?.devices };
}
