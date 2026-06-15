import { Box, Stack } from "@mui/material";
import { Sidebar } from "@widgets/sidebar";
import { Header } from "@widgets/header";
import { DateRangePicker } from "@features/date-range-picker";
import { ConversionFilters } from "@features/conversion-controls";
import { ConversionKpis } from "@widgets/conversion-kpis";
import { ConversionFunnel } from "@widgets/conversion-funnel";

export function ConversionPage() {
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
          title="Conversion"
          subtitle="Session → basket → order funnel, with device and order-status segments"
          actions={
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <ConversionFilters />
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
            background: (t) =>
              t.palette.mode === "light"
                ? "radial-gradient(1200px 600px at 15% -10%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(1000px 500px at 100% 0%, rgba(34,197,94,0.08), transparent 55%), " +
                  t.palette.background.default
                : "radial-gradient(1200px 600px at 15% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(1000px 500px at 100% 0%, rgba(34,197,94,0.12), transparent 55%), " +
                  t.palette.background.default,
            "& > *": { flexShrink: 0 },
          }}
        >
          <ConversionKpis />
          <ConversionFunnel />
        </Box>
      </Box>
    </Box>
  );
}
