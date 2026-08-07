import { Button, IconButton, Stack, Tooltip } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import { FormField } from "@shared/ui/form-field";
import { TODAY_LOCAL_DATE, useLiveOrdersStore } from "../model/store";

export function DaySelector() {
  const day = useLiveOrdersStore((s) => s.day);
  const setDay = useLiveOrdersStore((s) => s.setDay);
  const shiftDay = useLiveOrdersStore((s) => s.shiftDay);
  const goToday = useLiveOrdersStore((s) => s.goToday);

  const isToday = day === TODAY_LOCAL_DATE;

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Tooltip title="Previous day" arrow>
        <IconButton
          size="small"
          onClick={() => shiftDay(-1)}
          sx={{ border: (t) => `1px solid ${t.palette.divider}` }}
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <FormField
        type="date"
        variant="outlined"
        size="small"
        value={day}
        onChange={(e) => e.target.value && setDay(e.target.value)}
        inputProps={{ max: TODAY_LOCAL_DATE }}
        sx={{ width: 168 }}
      />

      <Tooltip title="Next day" arrow>
        <span>
          <IconButton
            size="small"
            onClick={() => shiftDay(1)}
            disabled={isToday}
            sx={{ border: (t) => `1px solid ${t.palette.divider}` }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {!isToday ? (
        <Button
          size="small"
          variant="outlined"
          startIcon={<TodayIcon fontSize="small" />}
          onClick={goToday}
          sx={{ textTransform: "none", borderRadius: 999, whiteSpace: "nowrap" }}
        >
          Today
        </Button>
      ) : null}
    </Stack>
  );
}
