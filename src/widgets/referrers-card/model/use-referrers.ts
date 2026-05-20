import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";

export function useReferrersData() {
  const range = useDateRangeStore((s) => s.range);
  return useQuery({
    queryKey: analyticsKeys.referrers(range),
    queryFn: () => analyticsApi.getReferrersReport(range),
  });
}
