import {
  Box,
  Checkbox,
  Chip,
  FormControl,
  ListItemText,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import DevicesIcon from "@mui/icons-material/Devices";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import type { DeviceFilter } from "@entities/analytics";
import { formatCompact } from "@shared/lib/format";
import { useConversionFilterStore } from "../model/store";
import { useOrderStatuses } from "../model/use-order-statuses";

export function ConversionFilters() {
  const device = useConversionFilterStore((s) => s.device);
  const setDevice = useConversionFilterStore((s) => s.setDevice);
  const statuses = useConversionFilterStore((s) => s.statuses);
  const setStatuses = useConversionFilterStore((s) => s.setStatuses);

  const { data: statusRows = [] } = useOrderStatuses();

  const handleStatuses = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value;
    setStatuses(typeof value === "string" ? value.split(",") : value);
  };

  return (
    <>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={device}
        onChange={(_, next: DeviceFilter | null) => {
          if (next) setDevice(next);
        }}
        sx={{
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.5,
            gap: 0.5,
            textTransform: "none",
            fontWeight: 600,
            border: (t) => `1px solid ${t.palette.divider}`,
          },
        }}
      >
        <ToggleButton value="all">
          <DevicesIcon fontSize="small" /> All
        </ToggleButton>
        <ToggleButton value="desktop">
          <DesktopWindowsIcon fontSize="small" /> Desktop
        </ToggleButton>
        <ToggleButton value="mobile">
          <PhoneIphoneIcon fontSize="small" /> Mobile
        </ToggleButton>
      </ToggleButtonGroup>

      <FormControl size="small" sx={{ minWidth: 200 }}>
        <Select<string[]>
          multiple
          displayEmpty
          value={statuses}
          onChange={handleStatuses}
          renderValue={(selected) => (
            <Typography variant="body2" fontWeight={600} noWrap>
              {selected.length === 0
                ? "Completed statuses…"
                : `Completed: ${selected.length} status${selected.length > 1 ? "es" : ""}`}
            </Typography>
          )}
          MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
        >
          {statusRows.map((row) => (
            <MenuItem key={row.status} value={row.status} dense>
              <Checkbox size="small" checked={statuses.includes(row.status)} />
              <ListItemText primary={row.status} />
              <Chip
                size="small"
                label={formatCompact(row.orders)}
                sx={{ ml: 1, height: 20 }}
              />
            </MenuItem>
          ))}
          {statusRows.length === 0 && (
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" color="text.secondary">
                No orders in range
              </Typography>
            </Box>
          )}
        </Select>
      </FormControl>
    </>
  );
}
