import {
  Alert,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatNumber } from "@shared/lib/format";
import {
  formatCls,
  formatMs,
  rateVital,
  ratingColor,
  type VitalKey,
} from "@shared/lib/web-vitals";
import type { PagePerformanceRow } from "@entities/analytics";
import { usePagePerformance } from "../model/use-page-performance";

const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  search: "Search Results",
  other: "Other",
  product_category: "Category",
  product_view: "Product Details",
  basket: "Basket",
  checkout: "Checkout",
  categories_index: "Categories Index",
  discount_details: "Discount Details",
  my_orders: "My Orders",
  brand_view: "Brand",
  profile_dashboard: "Profile",
  fortuna: "Fortuna",
  order_details: "Order Details",
  our_shops_list: "Shops List",
};

function MetricCell({ vkey, value }: { vkey: VitalKey; value: number | null }) {
  const rating = rateVital(vkey, value);
  const color = ratingColor(rating);
  const display = vkey === "cls" ? formatCls(value) : formatMs(value);
  return (
    <TableCell align="right">
      <Typography
        variant="body2"
        fontWeight={600}
        color={color === "inherit" ? "text.secondary" : `${color}.main`}
      >
        {display}
      </Typography>
    </TableCell>
  );
}

export function PagePerformance() {
  const { data, isLoading, error } = usePagePerformance();

  return (
    <Card elevation={0} sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Performance by page type
          </Typography>
          <Typography variant="body2" color="text.secondary">
            p75 of each metric, by page type. Color reflects Google&apos;s Core Web Vitals thresholds.
          </Typography>
        </Box>

        {isLoading ? <PageSpinner /> : null}
        {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}

        {data ? (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 720 }} size="medium">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, color: "text.secondary" }}>Page Type</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>Views</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>LCP</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>CLS</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>FID</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "text.secondary" }}>Full Load</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row: PagePerformanceRow) => {
                  const label = PAGE_LABELS[row.page_type] || row.page_type;
                  return (
                    <TableRow
                      key={row.page_type}
                      sx={{
                        "&:hover": { backgroundColor: (t) => t.palette.action.hover },
                        "&:last-child td, &:last-child th": { border: 0 },
                      }}
                    >
                      <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                        {label}
                      </TableCell>
                      <TableCell align="right">{formatNumber(row.views_count)}</TableCell>
                      <MetricCell vkey="lcp" value={row.lcp_p75} />
                      <MetricCell vkey="cls" value={row.cls_p75} />
                      <MetricCell vkey="fid" value={row.fid_p75} />
                      <MetricCell vkey="full_load" value={row.full_load_p75} />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </CardContent>
    </Card>
  );
}
