import { Alert, Box, Paper, Stack, Typography, useTheme } from "@mui/material";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import {
  formatCompact,
  formatNumber,
  formatShortDate,
  formatUZS,
} from "@shared/lib/format";
import { useDailyRevenue } from "../model/use-daily-revenue";

interface CustomTooltipProps {
  active?: boolean;
  payload?: unknown[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  const theme = useTheme();
  if (!active || !payload || !payload.length) return null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 3,
        backgroundColor:
          theme.palette.mode === "light"
            ? "rgba(255, 255, 255, 0.9)"
            : "rgba(15, 23, 42, 0.9)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} mb={1}>
        {label ? formatShortDate(String(label)) : ""}
      </Typography>
      <Stack spacing={0.5}>
        {payload.map((item: any) => (
          <Stack
            key={item.name}
            direction="row"
            alignItems="center"
            spacing={2}
            justifyContent="space-between"
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: item.color || item.stroke,
                }}
              />
              <Typography variant="body2" color="text.secondary">
                {item.name}:
              </Typography>
            </Stack>
            <Typography variant="body2" fontWeight={600}>
              {item.name === "Revenue" ? formatUZS(Number(item.value)) : formatNumber(Number(item.value))}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

interface CustomBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}

function CustomBar({ x, y, width, height, fill }: CustomBarProps) {
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return null;
  }
  if (height <= 0) return null;

  const r = 6; // rounded top corner
  const w = width;
  const h = height;

  const path = `
    M ${x},${y + h}
    L ${x},${y + r}
    Q ${x},${y} ${x + r},${y}
    L ${x + w - r},${y}
    Q ${x + w},${y} ${x + w},${y + r}
    L ${x + w},${y + h}
    Z
  `;

  return (
    <g>
      <path d={path} fill={fill} />
      <path
        d={path}
        fill="url(#glassShine)"
        style={{ mixBlendMode: "overlay", pointerEvents: "none" }}
      />
      <path
        d={`M ${x + r},${y + 1.5} L ${x + w - r},${y + 1.5}`}
        fill="none"
        stroke="rgba(255, 255, 255, 0.45)"
        strokeWidth={1.5}
        pointerEvents="none"
      />
      <path
        d={path}
        fill="none"
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
        pointerEvents="none"
      />
    </g>
  );
}

export function RevenueChart() {
  const { data, isLoading, error } = useDailyRevenue();

  return (
    <Section title="Revenue" subtitle="Daily orders & revenue">
      {isLoading ? <PageSpinner /> : null}
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {data ? (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#4f46e5" />
              </linearGradient>
              <linearGradient id="glassShine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
                <stop offset="25%" stopColor="#ffffff" stopOpacity={0.12} />
                <stop offset="60%" stopColor="#ffffff" stopOpacity={0.0} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#eef0f4" />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCompact(Number(v))}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="revenue"
              name="Revenue"
              fill="url(#revenueGrad)"
              maxBarSize={28}
              shape={<CustomBar />}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="orders"
              name="Orders"
              stroke="#0ea5e9"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0, fill: "#0ea5e9" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : null}
    </Section>
  );
}

