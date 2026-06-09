import { Box, Stack } from "@mui/material";
import { Sidebar } from "@widgets/sidebar";
import { Header } from "@widgets/header";
import { DateRangePicker } from "@features/date-range-picker";
import { PerfDeviceToggle } from "@features/perf-device-toggle";
import { PerformanceVitals } from "@widgets/performance-vitals";
import { PerformanceTrend } from "@widgets/performance-trend";
import { PagePerformance } from "@widgets/page-performance";

export function PerformancePage() {
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
          title="Performance"
          subtitle="Core Web Vitals and page load timing, measured at the 75th percentile"
          actions={
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <PerfDeviceToggle />
              <DateRangePicker />
            </Stack>
          }
        />
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            gap: 4,
            display: "flex",
            flexDirection: "column",
            p: 4,
            position: "relative",
            backgroundColor: (t) => t.palette.background.default,
            "& > *": { flexShrink: 0 },
          }}
        >
          <PerformanceVitals />
          <PerformanceTrend />
          <PagePerformance />
        </Box>
      </Box>
    </Box>
  );
}
