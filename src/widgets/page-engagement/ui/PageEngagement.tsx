import {
  Card,
  CardContent,
  CircularProgress,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  LinearProgress,
  useTheme,
} from "@mui/material";
import { useEngagementReport } from "../model/use-engagement";

function formatDuration(seconds: number): string {
  if (seconds < 1) return "< 1s";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

const PAGE_LABELS: Record<string, string> = {
  home: "Home Page",
  search: "Search Results",
  other: "Other Pages",
  product_category: "Category Pages",
  product_view: "Product Details",
  basket: "Shopping Basket",
  checkout: "Checkout Page",
};

export function PageEngagement() {
  const theme = useTheme();
  const { data, isLoading, error } = useEngagementReport();

  if (isLoading) {
    return (
      <Card sx={{ height: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card sx={{ height: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography color="error">Failed to load page engagement metrics.</Typography>
      </Card>
    );
  }

  // Sort and filter for valid visual rows
  const sortedData = [...data].sort((a, b) => b.views_count - a.views_count);
  const maxViews = Math.max(...sortedData.map((d) => d.views_count), 1);
  const maxDuration = Math.max(...sortedData.map((d) => d.avg_duration_seconds), 1);

  return (
    <Card
      sx={{
        flexShrink: 0,
        background: theme.palette.background.paper,
        backdropFilter: "blur(20px)",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 4,
        boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.08)",
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" fontWeight={700}>
            Page Engagement & Behavior
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Deep dive into user attention spans, interaction rates, and vertical scrolling percentages by page type.
          </Typography>
        </Box>

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={{ minWidth: 650 }} size="medium">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>Page Type</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>Est. Views</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>Avg. Time Spent</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>Avg. Scroll Depth</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>Avg. Interaction</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData.map((row) => {
                const label = PAGE_LABELS[row.page_type] || row.page_type;
                const viewPercentage = (row.views_count / maxViews) * 100;
                const durationPercentage = (row.avg_duration_seconds / maxDuration) * 100;

                return (
                  <TableRow
                    key={row.page_type}
                    sx={{
                      transition: "background-color 150ms ease",
                      "&:hover": {
                        backgroundColor: (t) => t.palette.action.hover,
                      },
                      "&:last-child td, &:last-child th": { border: 0 },
                    }}
                  >
                    <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                      {label}
                    </TableCell>
                    
                    {/* Est. Views */}
                    <TableCell align="right">
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <Typography variant="body2" fontWeight={600}>
                          {row.views_count.toLocaleString()}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={viewPercentage}
                          sx={{
                            width: 80,
                            height: 4,
                            borderRadius: 2,
                            mt: 0.5,
                            backgroundColor: (t) => t.palette.action.selected,
                          }}
                        />
                      </Box>
                    </TableCell>

                    {/* Avg. Time Spent */}
                    <TableCell align="right">
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <Typography variant="body2" fontWeight={600}>
                          {formatDuration(row.avg_duration_seconds)}
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={durationPercentage}
                          color="secondary"
                          sx={{
                            width: 80,
                            height: 4,
                            borderRadius: 2,
                            mt: 0.5,
                            backgroundColor: (t) => t.palette.action.selected,
                          }}
                        />
                      </Box>
                    </TableCell>

                    {/* Avg Scroll Depth */}
                    <TableCell align="right">
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <Typography variant="body2" fontWeight={600} color="primary.main">
                          {row.avg_scroll_depth.toFixed(1)}%
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={row.avg_scroll_depth}
                          color="primary"
                          sx={{
                            width: 80,
                            height: 4,
                            borderRadius: 2,
                            mt: 0.5,
                            backgroundColor: (t) => t.palette.action.selected,
                          }}
                        />
                      </Box>
                    </TableCell>

                    {/* Avg Interaction */}
                    <TableCell align="right">
                      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <Typography variant="body2" fontWeight={600} color="success.main">
                          {row.avg_click_count.toFixed(1)} clicks
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                          per view
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
