import {
  Box,
  Collapse,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useState } from "react";

type Props = {
  acceptInvalidCerts: boolean;
  onChangeAcceptInvalidCerts: (next: boolean) => void;
};

export function AdvancedOptions({
  acceptInvalidCerts,
  onChangeAcceptInvalidCerts,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.5}
        onClick={() => setOpen((v) => !v)}
        sx={{
          cursor: "pointer",
          color: "text.secondary",
          userSelect: "none",
          "&:hover": { color: "text.primary" },
        }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transition: "transform 180ms cubic-bezier(0.4, 0, 0.2, 1)",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
        <Typography variant="body2" fontWeight={500}>
          Advanced
        </Typography>
      </Stack>

      <Collapse in={open} timeout={220} unmountOnExit>
        <Box
          mt={1.5}
          p={2}
          sx={{
            borderRadius: 2,
            backgroundColor: (t) => t.palette.action.hover,
            border: (t) => `1px solid ${t.palette.divider}`,
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={acceptInvalidCerts}
                onChange={(e) => onChangeAcceptInvalidCerts(e.target.checked)}
              />
            }
            label={
              <Stack>
                <Typography variant="body2" fontWeight={500}>
                  Skip TLS certificate verification
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Use only for self-signed certs or hosts whose certificate
                  validity exceeds macOS limits.
                </Typography>
              </Stack>
            }
            sx={{ alignItems: "flex-start", m: 0, gap: 1.5 }}
          />
        </Box>
      </Collapse>
    </Box>
  );
}
