import { IconButton, InputBase, Paper } from "@mui/material";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import type { KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  running?: boolean;
};

export function AiInputBar({ value, onChange, onSubmit, disabled, running }: Props) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const canSend = !disabled && !running && value.trim().length > 0;

  return (
    <Paper
      elevation={0}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 0.5,
        borderRadius: "14px",
        border: (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <InputBase
        fullWidth
        multiline
        maxRows={5}
        placeholder={
          disabled
            ? "Connect Gemini to start…"
            : running
              ? "Analyzing…"
              : "Ask anything about your data…"
        }
        value={value}
        disabled={disabled || running}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        sx={{ fontSize: 15, py: 1 }}
      />
      <IconButton
        color="primary"
        disabled={!canSend}
        onClick={onSubmit}
        sx={{ alignSelf: "flex-end" }}
      >
        <SendRoundedIcon />
      </IconButton>
    </Paper>
  );
}
