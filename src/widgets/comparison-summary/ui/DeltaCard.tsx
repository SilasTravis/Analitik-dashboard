import { Card, CardContent, Stack, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import RemoveIcon from "@mui/icons-material/Remove";
import {
  formatCompact,
  formatPercent,
  formatUZS,
} from "@shared/lib/format";
import type { Delta } from "../model/deltas";

type Props = { delta: Delta };

export function DeltaCard({ delta }: Props) {
  const positive = (delta.change ?? 0) > 0;
  const negative = (delta.change ?? 0) < 0;
  const color = positive ? "#10b981" : negative ? "#ef4444" : "#64748b";
  const Icon = positive ? ArrowUpwardIcon : negative ? ArrowDownwardIcon : RemoveIcon;

  const fmt = (n: number) =>
    delta.formatAs === "currency" ? formatUZS(n) : formatCompact(n);

  return (
    <Card elevation={0} sx={{ borderRadius: 3, height: "100%" }}>
      <CardContent>
        <Typography variant="overline" color="text.secondary" letterSpacing={1}>
          {delta.label}
        </Typography>
        <Typography variant="h4" fontWeight={600} mt={0.5}>
          {fmt(delta.current)}
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5} mt={0.75}>
          {delta.change !== null ? (
            <>
              <Icon sx={{ fontSize: 16, color }} />
              <Typography variant="body2" sx={{ color, fontWeight: 600 }}>
                {formatPercent(Math.abs(delta.change))}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                vs {fmt(delta.previous)}
              </Typography>
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              No previous period
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
