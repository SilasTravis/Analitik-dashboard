import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";
import { usePerfDeviceStore } from "@features/perf-device-toggle";

export function usePerformanceOverview() {
  const range = useDateRangeStore((s) => s.range);
  const device = usePerfDeviceStore((s) => s.device);
  const args = { ...range, device };
  return useQuery({
    queryKey: analyticsKeys.perfOverview(args),
    queryFn: () => analyticsApi.getPerformanceOverview(args),
  });
}
