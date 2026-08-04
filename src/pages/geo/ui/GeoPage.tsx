import { Box } from "@mui/material";
import { Header } from "@widgets/header";
import { Sidebar } from "@widgets/sidebar";
import { GeoHeatmap } from "@widgets/geo-heatmap";

export function GeoPage() {
  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Header
          title="GEO"
          subtitle="Client location density across Uzbekistan"
        />
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <GeoHeatmap />
        </Box>
      </Box>
    </Box>
  );
}
