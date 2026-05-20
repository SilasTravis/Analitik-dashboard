/** ISO 8601 timestamps in UTC. */
export type DateRange = {
  from: string;
  to: string;
};

export type RangePreset = {
  id: string;
  label: string;
  days: number;
};
