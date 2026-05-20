import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";

export function useDailyRevenue() {
  const range = useDateRangeStore((s) => s.range);
  return useQuery({
    queryKey: analyticsKeys.dailyRevenue(range),
    queryFn: () => analyticsApi.getDailyRevenue(range),
  });
}
