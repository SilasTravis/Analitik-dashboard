export type ThemeMode = "light" | "dark";

/**
 * Validated categorical hues (skip slot 1 — reserved for the bold "Total"
 * area, which already uses the app's indigo). Adjacent-pair colorblind-safe
 * ordering per the dataviz palette; slot 1 kept in the list so indices stay
 * stable if Total ever needs to borrow it back.
 */
const HUES_LIGHT = [
  "#2a78d6", // 1 blue (reserved)
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];

const HUES_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

const OTHER_HUE: Record<ThemeMode, string> = {
  light: "#94a3b8",
  dark: "#64748b",
};

/** Colors for up to 7 per-source series (slots 2-8), skipping slot 1. */
export function seriesColor(index: number, mode: ThemeMode): string {
  const hues = mode === "dark" ? HUES_DARK : HUES_LIGHT;
  return hues[(index % (hues.length - 1)) + 1];
}

export function otherColor(mode: ThemeMode): string {
  return OTHER_HUE[mode];
}
