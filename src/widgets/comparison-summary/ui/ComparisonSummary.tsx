import { Alert, Box } from "@mui/material";
import { usePeriodComparison } from "@entities/analytics";
import { PageSpinner } from "@shared/ui/page-spinner";
import { computeDeltas } from "../model/deltas";
import { DeltaCard } from "./DeltaCard";

export function ComparisonSummary() {
  const { data, isLoading, error } = usePeriodComparison();

  if (isLoading) return <PageSpinner />;
  if (error) return <Alert severity="error">{(error as Error).message}</Alert>;
  if (!data) return null;

  const deltas = computeDeltas(data);

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
      }}
    >
      {deltas.map((d) => (
        <DeltaCard key={d.key} delta={d} />
      ))}
    </Box>
  );
}
