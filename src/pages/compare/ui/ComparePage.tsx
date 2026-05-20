import { Box, Stack } from "@mui/material";
import { Sidebar } from "@widgets/sidebar";
import { Header } from "@widgets/header";
import { ComparisonChart } from "@widgets/comparison-chart";
import { ComparisonControls } from "@features/comparison-controls";

export function ComparePage() {
  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden", position: "relative" }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        <Header
          title="Comparison"
          subtitle="Compare current period against previous"
        />
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            p: 4,
            position: "relative",
            backgroundColor: (t) => t.palette.background.default,
          }}
        >
          {/* Ambient background blur blobs inside the scroll container, directly behind the cards */}
          <Box
            sx={{
              position: "absolute",
              bottom: "10%",
              right: "5%",
              width: "420px",
              height: "420px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(251, 113, 133, 0.2) 0%, rgba(251, 113, 133, 0) 70%)",
              filter: "blur(90px)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          <Stack spacing={3} sx={{ position: "relative", zIndex: 1 }}>
            <ComparisonControls />
            <ComparisonChart />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

