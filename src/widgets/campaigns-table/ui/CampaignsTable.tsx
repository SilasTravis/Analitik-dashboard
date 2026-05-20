import {
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatNumber, formatUZS } from "@shared/lib/format";
import { useCampaignsTableData } from "../model/use-campaigns-table";

export function CampaignsTable() {
  const { data, isLoading, error } = useCampaignsTableData();
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: 4,
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor:
          theme.palette.mode === "light"
            ? "rgba(255, 255, 255, 0.4)"
            : "rgba(30, 41, 59, 0.2)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.01)",
      }}
    >
      <Typography variant="h6" fontWeight={700} mb={0.5} color="text.primary">
        Campaigns Breakdown
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Full performance metrics by UTM campaign parameter
      </Typography>

      {isLoading ? <PageSpinner /> : null}
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {data ? (
        data.length === 0 ? (
          <Typography variant="body2" color="text.secondary" align="center" py={4}>
            No campaigns tracked during this period.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Campaign</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Page Views</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Sessions</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Baskets</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Orders</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.campaign} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{row.campaign}</TableCell>
                    <TableCell align="right">{formatNumber(row.page_views)}</TableCell>
                    <TableCell align="right">{formatNumber(row.sessions)}</TableCell>
                    <TableCell align="right">{formatNumber(row.baskets)}</TableCell>
                    <TableCell align="right">{formatNumber(row.orders)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: "success.main" }}>
                      {formatUZS(row.revenue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      ) : null}
    </Paper>
  );
}
