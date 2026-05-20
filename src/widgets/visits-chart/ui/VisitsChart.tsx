import { Alert, Box, Paper, Stack, Typography, useTheme } from "@mui/material";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatCompact, formatNumber, formatShortDate } from "@shared/lib/format";
import { useDailyTraffic } from "../model/use-daily-visits";

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
              {formatNumber(Number(item.value))}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

export function VisitsChart() {
  const { data, isLoading, error } = useDailyTraffic();

  return (
    <Section title="Traffic" subtitle="Visits & sessions per day">
      {isLoading ? <PageSpinner /> : null}
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {data ? (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="sessionsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.01} />
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
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCompact(Number(v))}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Area
              type="monotone"
              dataKey="visits"
              name="Visits"
              stroke="#6366f1"
              strokeWidth={3}
              fill="url(#visitsFill)"
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0, fill: "#6366f1" }}
            />
            <Area
              type="monotone"
              dataKey="sessions"
              name="Sessions"
              stroke="#22d3ee"
              strokeWidth={3}
              fill="url(#sessionsFill)"
              dot={false}
              activeDot={{ r: 6, strokeWidth: 0, fill: "#22d3ee" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </Section>
  );
}

