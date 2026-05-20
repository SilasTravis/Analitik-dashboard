import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import type { LoginMode } from "../model/types";

type Props = {
  value: LoginMode;
  onChange: (next: LoginMode) => void;
};

export function ModeToggle({ value, onChange }: Props) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_, next) => next && onChange(next as LoginMode)}
      sx={{
        alignSelf: "flex-start",
        backgroundColor: (t) => t.palette.action.hover,
        borderRadius: 999,
        p: 0.5,
        gap: 0.5,
        "& .MuiToggleButton-root": {
          border: 0,
          borderRadius: 999,
          px: 2,
          py: 0.5,
          textTransform: "none",
          fontWeight: 500,
          color: (t) => t.palette.text.secondary,
          transition: "background-color 180ms ease, color 180ms ease",
        },
        "& .Mui-selected": {
          backgroundColor: (t) => `${t.palette.background.paper} !important`,
          color: (t) => `${t.palette.primary.main} !important`,
          boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
        },
      }}
    >
      <ToggleButton value="fields">Form</ToggleButton>
      <ToggleButton value="url">Connection URL</ToggleButton>
    </ToggleButtonGroup>
  );
}
