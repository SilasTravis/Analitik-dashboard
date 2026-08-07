import { Box } from "@mui/material";
import { Sidebar } from "@widgets/sidebar";
import { Header } from "@widgets/header";
import { LiveOrdersChart } from "@widgets/live-orders-chart";
import { DaySelector } from "@features/live-orders-controls";

export function LiveOrdersPage() {
  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        <Header
          title="Live Orders"
          subtitle="Hourly order volume by source for a selected day"
          actions={<DaySelector />}
        />
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            p: 4,
            position: "relative",
            background: (t) =>
              t.palette.mode === "light"
                ? "radial-gradient(1200px 600px at 15% -10%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(1000px 500px at 100% 0%, rgba(34,197,94,0.08), transparent 55%), " +
                  t.palette.background.default
                : "radial-gradient(1200px 600px at 15% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(1000px 500px at 100% 0%, rgba(34,197,94,0.12), transparent 55%), " +
                  t.palette.background.default,
            "& .MuiCard-root": {
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
            },
          }}
        >
          <LiveOrdersChart />
        </Box>
      </Box>
    </Box>
  );
}
