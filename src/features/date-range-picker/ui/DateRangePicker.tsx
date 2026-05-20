import { useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import {
  RANGE_PRESETS,
  isoFromLocalDate,
  localDateFromIso,
  useDateRangeStore,
} from "@entities/date-range";
import { FormField } from "@shared/ui/form-field";
import { formatShortDate } from "@shared/lib/format";

export function DateRangePicker() {
  const range = useDateRangeStore((s) => s.range);
  const presetId = useDateRangeStore((s) => s.presetId);
  const applyPreset = useDateRangeStore((s) => s.applyPreset);
  const setRange = useDateRangeStore((s) => s.setRange);

  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const [draftFrom, setDraftFrom] = useState(localDateFromIso(range.from));
  const [draftTo, setDraftTo] = useState(localDateFromIso(range.to));

  const handleOpen = () => {
    setDraftFrom(localDateFromIso(range.from));
    setDraftTo(localDateFromIso(range.to));
    setOpen(true);
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo) return;
    setRange({
      from: isoFromLocalDate(draftFrom, "start"),
      to: isoFromLocalDate(draftTo, "end"),
    });
    setOpen(false);
  };

  const label = presetId
    ? RANGE_PRESETS.find((p) => p.id === presetId)?.label ?? "Custom"
    : `${formatShortDate(range.from)} – ${formatShortDate(range.to)}`;

  return (
    <>
      <Button
        ref={anchorRef}
        onClick={handleOpen}
        size="small"
        variant="outlined"
        startIcon={<CalendarMonthIcon fontSize="small" />}
        endIcon={<KeyboardArrowDownIcon fontSize="small" />}
        sx={{
          textTransform: "none",
          borderRadius: 999,
          color: "text.primary",
          borderColor: "divider",
          backgroundColor: "background.paper",
          fontWeight: 500,
        }}
      >
        {label}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1, borderRadius: 3, p: 2.5, width: 320 } } }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="overline" color="text.secondary" letterSpacing={1}>
              Quick range
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} mt={0.75}>
              {RANGE_PRESETS.map((p) => {
                const active = p.id === presetId;
                return (
                  <Button
                    key={p.id}
                    size="small"
                    variant={active ? "contained" : "outlined"}
                    onClick={() => {
                      applyPreset(p.id);
                      setOpen(false);
                    }}
                    sx={{
                      textTransform: "none",
                      borderRadius: 999,
                      px: 1.5,
                      borderColor: active ? "primary.main" : "divider",
                    }}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>

          <Divider flexItem />

          <Box>
            <Typography variant="overline" color="text.secondary" letterSpacing={1}>
              Custom range
            </Typography>
            <Stack direction="row" spacing={1.5} mt={1}>
              <FormField
                type="date"
                label="From"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
              <FormField
                type="date"
                label="To"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </Stack>
            <Button
              variant="contained"
              fullWidth
              sx={{ mt: 2, textTransform: "none", borderRadius: 2 }}
              disabled={!draftFrom || !draftTo || draftFrom > draftTo}
              onClick={applyCustom}
            >
              Apply
            </Button>
          </Box>
        </Stack>
      </Popover>
    </>
  );
}
