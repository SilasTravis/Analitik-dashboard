import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { useSessionStore } from "@entities/session";
import { useReconnect } from "../model/use-reconnect";

/**
 * Shown on the login screen when we have saved credentials but couldn't
 * reconnect on launch. Gives the user a one-click retry instead of forcing
 * them to re-enter everything.
 */
export function ReconnectBanner() {
  const reconnectError = useSessionStore((s) => s.reconnectError);
  const clearError = useSessionStore((s) => s.setReconnectError);
  const reconnect = useReconnect();

  if (!reconnectError) return null;

  return (
    <Alert
      severity="warning"
      onClose={() => clearError(null)}
      sx={{ borderRadius: 2, alignItems: "flex-start" }}
    >
      <Stack spacing={1}>
        <Box>
          <Typography variant="body2" fontWeight={600}>
            Couldn't reconnect with saved credentials
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {reconnectError}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            disabled={reconnect.isPending}
            onClick={() => reconnect.mutate()}
            sx={{ textTransform: "none" }}
          >
            {reconnect.isPending ? "Retrying…" : "Try again"}
          </Button>
        </Stack>
      </Stack>
    </Alert>
  );
}
