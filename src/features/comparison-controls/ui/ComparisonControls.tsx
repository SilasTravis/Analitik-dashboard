import {
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  COUNT_OPTIONS,
  GRANULARITY_OPTIONS,
  useComparisonRangeStore,
  type Granularity,
} from "@entities/comparison-range";

const COUNT_LABEL: Record<Granularity, string> = {
  week: "weeks",
  month: "months",
  year: "years",
};

export function ComparisonControls() {
  const granularity = useComparisonRangeStore((s) => s.granularity);
  const count = useComparisonRangeStore((s) => s.count);
  const setGranularity = useComparisonRangeStore((s) => s.setGranularity);
  const setCount = useComparisonRangeStore((s) => s.setCount);
  const counts = COUNT_OPTIONS[granularity];

  return (
    <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
      <ToggleButtonGroup
        exclusive
        size="small"
        value={granularity}
        onChange={(_, v) => v && setGranularity(v as Granularity)}
        sx={{
          backgroundColor: (t) => t.palette.action.hover,
          borderRadius: 999,
          p: 0.5,
          gap: 0.5,
          "& .MuiToggleButton-root": {
            border: 0,
            borderRadius: 999,
            px: 2,
            textTransform: "none",
            fontWeight: 500,
            color: (t) => t.palette.text.secondary,
          },
          "& .Mui-selected": {
            backgroundColor: (t) => `${t.palette.background.paper} !important`,
            color: (t) => `${t.palette.primary.main} !important`,
            boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
          },
        }}
      >
        {GRANULARITY_OPTIONS.map((o) => (
          <ToggleButton key={o.id} value={o.id}>
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="body2" color="text.secondary">
          Last
        </Typography>
        <Select
          size="small"
          value={counts.includes(count) ? count : counts[0]}
          onChange={(e) => setCount(Number(e.target.value))}
          sx={{ borderRadius: 999, minWidth: 80, ".MuiSelect-select": { py: 0.75 } }}
        >
          {counts.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </Select>
        <Typography variant="body2" color="text.secondary">
          {COUNT_LABEL[granularity]}
        </Typography>
      </Stack>
    </Stack>
  );
}
