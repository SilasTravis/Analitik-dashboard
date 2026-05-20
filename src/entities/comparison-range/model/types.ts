export type Granularity = "week" | "month" | "year";

export type ComparisonRange = {
  granularity: Granularity;
  count: number;
};

export const GRANULARITY_OPTIONS: { id: Granularity; label: string }[] = [
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "year", label: "Yearly" },
];

export const COUNT_OPTIONS: Record<Granularity, number[]> = {
  week: [4, 8, 12, 26, 52],
  month: [3, 6, 12, 24],
  year: [2, 3, 5],
};
