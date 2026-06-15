import { useMemo } from "react";
import type { ConversionArgs } from "@entities/analytics";
import { useDateRangeStore } from "@entities/date-range";
import { useConversionFilterStore } from "./store";

/** Composes the global date range with the conversion device + status filters. */
export function useConversionArgs(): ConversionArgs {
  const range = useDateRangeStore((s) => s.range);
  const device = useConversionFilterStore((s) => s.device);
  const statuses = useConversionFilterStore((s) => s.statuses);
  return useMemo(
    () => ({ from: range.from, to: range.to, device, statuses }),
    [range.from, range.to, device, statuses],
  );
}
