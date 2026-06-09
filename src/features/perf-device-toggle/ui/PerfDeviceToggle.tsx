import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import DevicesIcon from "@mui/icons-material/Devices";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import type { DeviceFilter } from "@entities/analytics";
import { usePerfDeviceStore } from "../model/store";

export function PerfDeviceToggle() {
  const device = usePerfDeviceStore((s) => s.device);
  const setDevice = usePerfDeviceStore((s) => s.setDevice);

  return (
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
  );
}
