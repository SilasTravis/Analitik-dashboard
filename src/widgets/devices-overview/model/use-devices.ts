import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";

export function useDevices() {
  const range = useDateRangeStore((s) => s.range);
  return useQuery({
    queryKey: analyticsKeys.devices(range),
    queryFn: () => analyticsApi.getDevicesOverview(range),
  });
}
