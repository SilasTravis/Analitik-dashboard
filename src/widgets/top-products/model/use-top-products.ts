import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";

export function useTopProducts() {
  const range = useDateRangeStore((s) => s.range);
  return useQuery({
    queryKey: analyticsKeys.products(range),
    queryFn: () => analyticsApi.getTopProducts(range),
  });
}
