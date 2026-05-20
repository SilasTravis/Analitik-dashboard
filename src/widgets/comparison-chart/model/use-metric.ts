import { useState } from "react";
import type { MetricKey } from "@entities/analytics";

export function useSelectedMetric(initial: MetricKey = "revenue") {
  return useState<MetricKey>(initial);
}
