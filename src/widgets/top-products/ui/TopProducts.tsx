import {
  Alert,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatNumber, formatUZS } from "@shared/lib/format";
import { useTopProducts } from "../model/use-top-products";

export function TopProducts() {
  const { data, isLoading, error } = useTopProducts();

  return (
    <Section title="Top products" subtitle="By units purchased">
      {isLoading ? <PageSpinner /> : null}
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {data ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell align="right">Units</TableCell>
              <TableCell align="right">Revenue</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.sap_code} hover>
                <TableCell>
                  <Stack>
                    <Typography variant="body2" fontWeight={500}>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      SAP {p.sap_code}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right">{formatNumber(p.purchases)}</TableCell>
                <TableCell align="right">{formatUZS(p.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </Section>
  );
}
