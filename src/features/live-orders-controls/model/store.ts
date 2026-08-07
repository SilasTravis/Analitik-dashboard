import { create } from "zustand";

/** Uzbekistan is fixed UTC+5 year-round (no DST) — the Live Orders day
 * always means the Uzbekistan calendar day, regardless of what timezone the
 * machine running the app happens to be set to. */
const UZBEKISTAN_UTC_OFFSET_HOURS = 5;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a `Date`'s UTC fields as `YYYY-MM-DD`. Callers pre-shift the
 * instant so those UTC fields read as Uzbekistan wall-clock — this never
 * touches the machine's own timezone. */
function formatUtcFieldsAsDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function uzbekistanTodayString(): string {
  const shifted = new Date(Date.now() + UZBEKISTAN_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return formatUtcFieldsAsDate(shifted);
}

/** Uzbekistan calendar day the app started on. Fixed at module load, same
 * rationale as the date-range presets: a long-running session doesn't need
 * to roll the default forward while the user is looking at it. */
export const TODAY_LOCAL_DATE = uzbekistanTodayString();

type LiveOrdersState = {
  /** Uzbekistan YYYY-MM-DD — the calendar day whose hourly breakdown is shown. */
  day: string;
  setDay: (day: string) => void;
  shiftDay: (deltaDays: number) => void;
  goToday: () => void;
};

export const useLiveOrdersStore = create<LiveOrdersState>((set, get) => ({
  day: TODAY_LOCAL_DATE,
  setDay: (day) => set({ day }),
  shiftDay: (deltaDays) => {
    const [y, m, d] = get().day.split("-").map(Number);
    // Pure calendar-date arithmetic — `day` is just a YYYY-MM-DD label, not
    // a real instant, so this stays in a UTC-labeled Date purely as a date
    // calculator and never touches the machine's timezone.
    const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
    set({ day: formatUtcFieldsAsDate(next) });
  },
  goToday: () => set({ day: uzbekistanTodayString() }),
}));
