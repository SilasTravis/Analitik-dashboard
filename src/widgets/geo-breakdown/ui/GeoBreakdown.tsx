import {
  Alert,
  Box,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import PlaceIcon from "@mui/icons-material/Place";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatNumber } from "@shared/lib/format";
import { useGeoBreakdown } from "../model/use-geo";

export function GeoBreakdown() {
  const { data, isLoading, error } = useGeoBreakdown();
  const max = data?.length ? Math.max(...data.map((r) => r.visits)) : 1;

  return (
    <Section title="Top locations" subtitle="Visits by country & city">
      {isLoading ? <PageSpinner /> : null}
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {data ? (
        <Stack spacing={1.75}>
          {data.map((r, i) => (
            <Box key={`${r.country}-${r.city}-${i}`}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <PlaceIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  <Typography variant="body2" fontWeight={500}>
                    {r.city}
                    <Typography component="span" variant="body2" color="text.secondary" ml={0.75}>
                      · {r.country}
                    </Typography>
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {formatNumber(r.visits)}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={(r.visits / max) * 100}
                sx={{
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: (t) => t.palette.action.hover,
                  "& .MuiLinearProgress-bar": { borderRadius: 999 },
                }}
              />
            </Box>
          ))}
        </Stack>
      ) : null}
    </Section>
  );
}
