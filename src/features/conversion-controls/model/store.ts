import { create } from "zustand";
import type { DeviceFilter } from "@entities/analytics";

type ConversionFilterState = {
  device: DeviceFilter;
  /** Statuses counted as a completed conversion. */
  statuses: string[];
  /** Whether the default status selection has been seeded from the DB yet. */
  initialized: boolean;
  setDevice: (device: DeviceFilter) => void;
  setStatuses: (statuses: string[]) => void;
  /** Seed the default selection once, the first time statuses load. */
  initStatuses: (statuses: string[]) => void;
};

export const useConversionFilterStore = create<ConversionFilterState>((set) => ({
  device: "all",
  statuses: [],
  initialized: false,
  setDevice: (device) => set({ device }),
  setStatuses: (statuses) => set({ statuses, initialized: true }),
  initStatuses: (statuses) =>
    set((s) => (s.initialized ? s : { statuses, initialized: true })),
}));
