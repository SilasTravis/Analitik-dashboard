import { create } from "zustand";
import type { DeviceFilter } from "@entities/analytics";

type PerfDeviceState = {
  device: DeviceFilter;
  setDevice: (device: DeviceFilter) => void;
};

export const usePerfDeviceStore = create<PerfDeviceState>((set) => ({
  device: "all",
  setDevice: (device) => set({ device }),
}));
