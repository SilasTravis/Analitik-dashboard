import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDateRangeStore } from "@entities/date-range";
import type { GeoBounds } from "@widgets/geo-heatmap/model/viewport";
import { buildGeoHeatmapArgs } from "@widgets/geo-heatmap/model/viewport";
import { analyticsApi } from "../api/analytics.api";
import { analyticsKeys } from "./query-keys";

export function useGeoHeatmap(bounds: GeoBounds | null, enabled = true) {
  const range = useDateRangeStore((state) => state.range);
  const args = bounds ? buildGeoHeatmapArgs(range, bounds) : null;

  return useQuery({
    queryKey: args
      ? analyticsKeys.geoHeatmap(args)
      : [...analyticsKeys.all, "geo-heatmap", "idle"],
    queryFn: () => analyticsApi.getGeoHeatmap(args!),
    enabled: enabled && args !== null,
    placeholderData: keepPreviousData,
  });
}
