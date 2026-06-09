import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";
import { usePerfDeviceStore } from "@features/perf-device-toggle";

export function usePerformanceTrend() {
  const range = useDateRangeStore((s) => s.range);
  const device = usePerfDeviceStore((s) => s.device);
  const args = { ...range, device };
  return useQuery({
    queryKey: analyticsKeys.perfTrend(args),
    queryFn: () => analyticsApi.getPerformanceTrend(args),
  });
}
