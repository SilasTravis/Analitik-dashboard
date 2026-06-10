import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { AiTableRow } from "@entities/ai";

const MAX_ROWS = 10;

function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DataTable({ rows }: { rows: AiTableRow[] }) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No rows returned.
      </Typography>
    );
  }

  const columns = Object.keys(rows[0]);
  const visible = rows.slice(0, MAX_ROWS);

  return (
    <>
      <Table size="small" sx={{ "& td, & th": { fontSize: 12.5 } }}>
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                {c}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {visible.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c} sx={{ whiteSpace: "nowrap" }}>
                  {renderCell(row[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > MAX_ROWS ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          +{rows.length - MAX_ROWS} more rows
        </Typography>
      ) : null}
    </>
  );
}
