import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";

export function useFlowMap() {
  const range = useDateRangeStore((s) => s.range);
  return useQuery({
    queryKey: analyticsKeys.flowMap(range),
    queryFn: () => analyticsApi.getPageFlowMap(range),
  });
}
