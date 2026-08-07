import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useLiveOrdersStore } from "@features/live-orders-controls";

/** Real per-source series shown before the rest fold into "Other". Keeps the
 * chart legible even when the DB has a dozen+ distinct source types. */
export const MAX_SERIES = 7;
export const OTHER_KEY = "__other__";

export type LiveOrdersChartPoint = {
  hour: number;
  hourLabel: string;
  total: number;
  [source: string]: number | string;
};

export type LiveOrdersSeriesMeta = {
  key: string;
  total: number;
};

export function useLiveOrderStats() {
  const day = useLiveOrdersStore((s) => s.day);
  const args = useMemo(() => ({ day }), [day]);

  const query = useQuery({
    queryKey: analyticsKeys.liveOrderStats(args),
    queryFn: () => analyticsApi.getLiveOrderStats(args),
  });

  const derived = useMemo(() => {
    const stats = query.data;
    if (!stats) {
      return {
        chartData: [] as LiveOrdersChartPoint[],
        series: [] as LiveOrdersSeriesMeta[],
        hasOther: false,
        peakHour: null as number | null,
      };
    }

    const topSources = stats.sources.slice(0, MAX_SERIES);
    const hasOther = stats.sources.length > MAX_SERIES;
    const sourceTotals = new Map<string, number>();

    const chartData: LiveOrdersChartPoint[] = stats.hourly.map((point) => {
      const row: LiveOrdersChartPoint = {
        hour: point.hour,
        hourLabel: `${String(point.hour).padStart(2, "0")}:00`,
        total: point.total,
      };
      let otherTotal = 0;
      for (const source of topSources) row[source] = 0;
      for (const [source, count] of Object.entries(point.bySource)) {
        if (topSources.includes(source)) {
          row[source] = count;
          sourceTotals.set(source, (sourceTotals.get(source) ?? 0) + count);
        } else {
          otherTotal += count;
        }
      }
      if (hasOther) {
        row[OTHER_KEY] = otherTotal;
        sourceTotals.set(OTHER_KEY, (sourceTotals.get(OTHER_KEY) ?? 0) + otherTotal);
      }
      return row;
    });

    const series: LiveOrdersSeriesMeta[] = [
      ...topSources.map((key) => ({ key, total: sourceTotals.get(key) ?? 0 })),
      ...(hasOther ? [{ key: OTHER_KEY, total: sourceTotals.get(OTHER_KEY) ?? 0 }] : []),
    ];

    let peakHour: number | null = null;
    let peakTotal = -1;
    for (const point of stats.hourly) {
      if (point.total > peakTotal) {
        peakTotal = point.total;
        peakHour = point.hour;
      }
    }

    return { chartData, series, hasOther, peakHour };
  }, [query.data]);

  return {
    ...query,
    day,
    totalOrders: query.data?.totalOrders ?? 0,
    topSource: query.data?.sources[0],
    ...derived,
  };
}
