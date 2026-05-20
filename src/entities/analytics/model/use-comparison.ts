import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics.api";
import { analyticsKeys } from "./query-keys";
import { useComparisonRangeStore } from "@entities/comparison-range";

export function usePeriodComparison() {
  const granularity = useComparisonRangeStore((s) => s.granularity);
  const count = useComparisonRangeStore((s) => s.count);
  const args = { granularity, count };
  return useQuery({
    queryKey: analyticsKeys.comparison(args),
    queryFn: () => analyticsApi.getPeriodComparison(args),
  });
}
