import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";
import { useConversionFilterStore } from "./store";

/** Statuses that look "completed/paid" — used to seed a sensible default. */
const COMPLETED_RE = /complet|paid|deliver|success|done|fulfil|finish|shipped/i;

/**
 * Loads the distinct order statuses for the current range and, the first time
 * they arrive, seeds the filter with the ones that look like completed
 * conversions (falling back to all statuses if none match).
 */
export function useOrderStatuses() {
  const range = useDateRangeStore((s) => s.range);
  const initialized = useConversionFilterStore((s) => s.initialized);
  const initStatuses = useConversionFilterStore((s) => s.initStatuses);

  const query = useQuery({
    queryKey: analyticsKeys.orderStatuses(range),
    queryFn: () => analyticsApi.getOrderStatuses(range),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!query.data || initialized) return;
    const all = query.data.map((r) => r.status);
    const guess = all.filter((s) => COMPLETED_RE.test(s));
    initStatuses(guess.length > 0 ? guess : all);
  }, [query.data, initialized, initStatuses]);

  return query;
}
