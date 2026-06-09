import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";
import { usePerfDeviceStore } from "@features/perf-device-toggle";

export function usePagePerformance() {
  const range = useDateRangeStore((s) => s.range);
  const device = usePerfDeviceStore((s) => s.device);
  const args = { ...range, device };
  return useQuery({
    queryKey: analyticsKeys.pagePerf(args),
    queryFn: () => analyticsApi.getPagePerformance(args),
  });
}
