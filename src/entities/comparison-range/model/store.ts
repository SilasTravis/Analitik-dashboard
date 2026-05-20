import { create } from "zustand";
import type { ComparisonRange, Granularity } from "./types";
import { COUNT_OPTIONS } from "./types";

type State = ComparisonRange & {
  setGranularity: (g: Granularity) => void;
  setCount: (n: number) => void;
};

export const useComparisonRangeStore = create<State>((set) => ({
  granularity: "week",
  count: 4,
  setGranularity: (granularity) =>
    set(() => ({
      granularity,
      count: COUNT_OPTIONS[granularity][1] ?? COUNT_OPTIONS[granularity][0],
    })),
  setCount: (count) => set({ count }),
}));
