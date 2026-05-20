import { Box, Paper, Stack, Typography } from "@mui/material";
import { LoginForm, ReconnectBanner } from "@features/auth-login";

export function LoginPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #fdf2f8 100%)",
      }}
    >
      <Stack
        justifyContent="center"
        alignItems="flex-start"
        sx={{ display: { xs: "none", md: "flex" }, px: 8, py: 6 }}
      >
        <Typography variant="overline" color="primary" letterSpacing={2}>
          Analitic
        </Typography>
        <Typography variant="h3" fontWeight={700} mt={1}>
          Your numbers, beautifully clear.
        </Typography>
        <Typography variant="body1" color="text.secondary" mt={2} maxWidth={420}>
          Connect your Postgres database and explore visits, sessions, devices, and
          revenue — all in one calm, native macOS dashboard.
        </Typography>
      </Stack>

      <Stack justifyContent="center" alignItems="center" sx={{ p: { xs: 3, md: 6 } }}>
        <Stack spacing={2} sx={{ width: "100%", maxWidth: 440 }}>
          <ReconnectBanner />
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, md: 4 },
              borderRadius: 4,
              boxShadow: "0 30px 60px -30px rgba(15,23,42,0.12)",
            }}
          >
            <LoginForm />
          </Paper>
        </Stack>
      </Stack>
    </Box>
  );
}
