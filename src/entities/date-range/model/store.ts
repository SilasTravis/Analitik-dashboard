import { create } from "zustand";
import type { DateRange } from "./types";
import { DEFAULT_PRESET_ID, RANGE_PRESETS, rangeFromDays } from "./presets";

type RangeState = {
  range: DateRange;
  presetId: string | null;
  setRange: (range: DateRange) => void;
  applyPreset: (id: string) => void;
};

const initialPreset = RANGE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;

export const useDateRangeStore = create<RangeState>((set) => ({
  range: rangeFromDays(initialPreset.days),
  presetId: initialPreset.id,
  setRange: (range) => set({ range, presetId: null }),
  applyPreset: (id) => {
    const preset = RANGE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    set({ range: rangeFromDays(preset.days), presetId: preset.id });
  },
}));
