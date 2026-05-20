import { Box, Stack } from "@mui/material";
import { Sidebar } from "@widgets/sidebar";
import { Header } from "@widgets/header";
import { CampaignsCharts } from "@widgets/campaigns-charts";
import { CampaignsTable } from "@widgets/campaigns-table";
import { ReferrersCard } from "@widgets/referrers-card";
import { DateRangePicker } from "@features/date-range-picker";

export function CampaignsPage() {
  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Sidebar />
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Header
          title="Campaigns"
          subtitle="UTM attribution and referrer performance analysis"
          actions={<DateRangePicker />}
        />
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            gap: 4,
            spacing: 4,
            display: "flex",
            flexDirection: "column",
            p: 4,
            position: "relative",
            backgroundColor: (t) => t.palette.background.default,
            // Native macOS Tahoe translucent glass styling
            "& .MuiPaper-root": {
              borderRadius: "16px",
              background: (t) =>
                t.palette.mode === "light"
                  ? "linear-gradient(135deg, rgba(248, 250, 252, 0.55) 0%, rgba(241, 245, 249, 0.35) 100%)"
                  : "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.3) 100%)",
              backdropFilter: "blur(24px) saturate(190%)",
              border: (t) =>
                t.palette.mode === "light"
                  ? "1px solid rgba(255, 255, 255, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: (t) =>
                t.palette.mode === "light"
                  ? "0 4px 30px rgba(0, 0, 0, 0.02), inset 0 1px 1px rgba(255, 255, 255, 0.8)"
                  : "0 4px 30px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
              transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
              position: "relative",
              overflow: "hidden",
              "&::after": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background:
                  "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.12), transparent 50%)",
                pointerEvents: "none",
              },
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: (t) =>
                  t.palette.mode === "light"
                    ? "0 12px 35px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.9)"
                    : "0 12px 35px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
                borderColor: (t) =>
                  t.palette.mode === "light"
                    ? "rgba(255, 255, 255, 0.7)"
                    : "rgba(255, 255, 255, 0.18)",
              },
            },
          }}
        >
          <CampaignsCharts />
          <ReferrersCard />
          <Stack spacing={4} sx={{ position: "relative", zIndex: 1 }}>
            {/* Tabular numeric breakdown */}
            <CampaignsTable />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
