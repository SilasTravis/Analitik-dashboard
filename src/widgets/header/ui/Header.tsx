import { Avatar, Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useSessionStore } from "@entities/session";
import { LogoutButton } from "@features/auth-logout";
import { RefreshButton } from "@features/refresh-data";
import { ReconnectBanner } from "@features/auth-login";

type Props = {
  title: string;
  subtitle?: string;
  /** Renders between the refresh button and the connection chip. */
  actions?: ReactNode;
};

export function Header({ title, subtitle, actions }: Props) {
  const session = useSessionStore((s) => s.session);
  const reconnectError = useSessionStore((s) => s.reconnectError);
  const user = session?.credentials.user ?? "";
  const connection = session
    ? `${session.credentials.user}@${session.credentials.host}/${session.credentials.database}`
    : "";

  return (
    <Stack
      sx={{
        borderBottom: (t) => `1px solid ${t.palette.divider}`,
        backgroundColor: (t) => t.palette.background.default,
      }}
    >
      <Box
        sx={{
          px: 4,
          py: 2.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Stack>
          <Typography variant="h5" fontWeight={700}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {actions}
          <RefreshButton />
          {user ? (
            <Tooltip title={connection} arrow>
              <Chip
                avatar={
                  <Avatar sx={{ textTransform: "uppercase", fontWeight: 700 }}>
                    {user.charAt(0)}
                  </Avatar>
                }
                label={user}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600, maxWidth: 180 }}
              />
            </Tooltip>
          ) : null}
          <LogoutButton />
        </Stack>
      </Box>
      {reconnectError ? (
        <Box sx={{ px: 4, pb: 2.5 }}>
          <ReconnectBanner />
        </Box>
      ) : null}
    </Stack>
  );
}

