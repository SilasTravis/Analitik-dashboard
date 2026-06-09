import { Alert, Box, Card, CardContent, Paper, Stack, Typography, useTheme } from "@mui/material";
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
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatShortDate } from "@shared/lib/format";
import { formatMs } from "@shared/lib/web-vitals";
import { usePerformanceTrend } from "../model/use-performance-trend";

interface TooltipProps {
  active?: boolean;
  payload?: unknown[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  const theme = useTheme();
  if (!active || !payload || !payload.length) return null;
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 3,
        backgroundColor:
          theme.palette.mode === "light" ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.9)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} mb={1}>
        {label ? formatShortDate(String(label)) : ""}
      </Typography>
      <Stack spacing={0.5}>
        {payload.map((item: any) => (
          <Stack key={item.name} direction="row" alignItems="center" spacing={2} justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: item.color || item.stroke }} />
              <Typography variant="body2" color="text.secondary">
                {item.name}:
              </Typography>
            </Stack>
            <Typography variant="body2" fontWeight={600}>
              {item.value == null ? "—" : formatMs(Number(item.value))}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

export function PerformanceTrend() {
  const { data, isLoading, error } = usePerformanceTrend();

  return (
    <Card elevation={0} sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Load-time trend
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Daily p75 of key timing metrics (ms)
          </Typography>
        </Box>

        {isLoading ? <PageSpinner /> : null}
        {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
        {data ? (
        <Box sx={{ width: "100%", height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="lcpFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="fcpFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="fullLoadFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="#eef0f4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={["dataMin - 300", "dataMax + 300"]}
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v) => formatMs(Number(v))}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Area type="monotone" dataKey="lcp_p75" name="LCP" stroke="#6366f1" strokeWidth={3} fill="url(#lcpFill)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
              <Area type="monotone" dataKey="fcp_p75" name="FCP" stroke="#22d3ee" strokeWidth={3} fill="url(#fcpFill)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
              <Area type="monotone" dataKey="full_load_p75" name="Full Load" stroke="#f59e0b" strokeWidth={3} fill="url(#fullLoadFill)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}
