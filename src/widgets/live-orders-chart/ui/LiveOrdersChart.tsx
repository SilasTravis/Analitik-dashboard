import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Paper,
  Stack,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import WhatshotOutlinedIcon from "@mui/icons-material/WhatshotOutlined";
import SourceOutlinedIcon from "@mui/icons-material/SourceOutlined";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import { StatCard } from "@shared/ui/stat-card";
import { formatCompact, formatNumber } from "@shared/lib/format";
import { otherColor, seriesColor } from "../model/colors";
import { formatSourceLabel } from "../model/format";
import { OTHER_KEY, useLiveOrderStats } from "../model/use-live-order-stats";
import type { LiveOrdersChartPoint } from "../model/use-live-order-stats";

const TOTAL_COLOR_LIGHT = "#6366f1";
const TOTAL_COLOR_DARK = "#818cf8";

function formatDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function seriesLabel(key: string): string {
  return key === OTHER_KEY ? "Other" : formatSourceLabel(key);
}

type TooltipProps = {
  active?: boolean;
  label?: string;
  payload?: { dataKey?: string; value?: number; color?: string }[];
  colorByKey: Map<string, string>;
};

function ChartTooltip({ active, label, payload, colorByKey }: TooltipProps) {
  const theme = useTheme();
  if (!active || !payload || payload.length === 0) return null;

  const rows = payload
    .filter((item) => item.dataKey && item.dataKey !== "total")
    .map((item) => ({
      key: item.dataKey as string,
      value: item.value ?? 0,
      color: colorByKey.get(item.dataKey as string) ?? item.color ?? "#999",
    }))
    .sort((a, b) => b.value - a.value);

  const totalItem = payload.find((item) => item.dataKey === "total");

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 3,
        minWidth: 200,
        backgroundColor:
          theme.palette.mode === "light" ? "rgba(255, 255, 255, 0.92)" : "rgba(15, 23, 42, 0.92)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={1}>
        <Typography variant="subtitle2" fontWeight={700}>
          {label}
        </Typography>
        {totalItem ? (
          <Typography variant="subtitle2" fontWeight={700} color="primary.main">
            {formatNumber(Number(totalItem.value))} total
          </Typography>
        ) : null}
      </Stack>
      {rows.length > 0 ? (
        <Stack spacing={0.5}>
          {rows.map((row) => (
            <Stack
              key={row.key}
              direction="row"
              alignItems="center"
              spacing={2}
              justifyContent="space-between"
            >
              <Stack direction="row" alignItems="center" spacing={1}>
                <Box
                  sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: row.color }}
                />
                <Typography variant="body2" color="text.secondary">
                  {seriesLabel(row.key)}
                </Typography>
              </Stack>
              <Typography variant="body2" fontWeight={600}>
                {formatNumber(row.value)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No orders this hour
        </Typography>
      )}
    </Paper>
  );
}

export function LiveOrdersChart() {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const {
    chartData,
    series,
    day,
    totalOrders,
    peakHour,
    topSource,
    isLoading,
    error,
  } = useLiveOrderStats();

  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const colorByKey = useMemo(() => {
    const map = new Map<string, string>();
    series.forEach((s, index) => {
      map.set(s.key, s.key === OTHER_KEY ? otherColor(mode) : seriesColor(index, mode));
    });
    return map;
  }, [series, mode]);

  const totalColor = mode === "dark" ? TOTAL_COLOR_DARK : TOTAL_COLOR_LIGHT;
  const gridColor = mode === "light" ? "#e1e0d9" : "#2c2c2a";
  const tickColor = "#94a3b8";

  const toggleSeries = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const peakHourLabel =
    peakHour !== null ? `${String(peakHour).padStart(2, "0")}:00 – ${String((peakHour + 1) % 24).padStart(2, "0")}:00` : "—";

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "grid", gap: 3, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
        <StatCard
          label="Orders that day"
          value={formatNumber(totalOrders)}
          hint={formatDayLabel(day)}
          icon={<ShoppingBagOutlinedIcon fontSize="small" color="action" />}
        />
        <StatCard
          label="Busiest hour"
          value={peakHourLabel}
          hint="Highest order volume"
          icon={<WhatshotOutlinedIcon fontSize="small" color="action" />}
        />
        <StatCard
          label="Top source"
          value={topSource ? formatSourceLabel(topSource) : "—"}
          hint="Largest order source that day"
          icon={<SourceOutlinedIcon fontSize="small" color="action" />}
        />
      </Box>

      <Section
        title="Orders by source, hour by hour"
        subtitle={`${formatDayLabel(day)} — click a source below to isolate it`}
      >
        {isLoading ? <PageSpinner /> : null}
        {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}

        {!isLoading && !error && totalOrders === 0 ? (
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
            No orders recorded on {formatDayLabel(day)}.
          </Alert>
        ) : null}

        {!isLoading && !error && chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="liveOrdersTotalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={totalColor} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={totalColor} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="hourLabel"
                  tick={{ fontSize: 11, fill: tickColor }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: tickColor }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatCompact(Number(v))}
                  allowDecimals={false}
                />
                <Tooltip
                  content={(props) => (
                    <ChartTooltip
                      active={props.active}
                      label={props.label as string}
                      payload={props.payload as TooltipProps["payload"]}
                      colorByKey={colorByKey}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke={totalColor}
                  strokeWidth={2.5}
                  fill="url(#liveOrdersTotalFill)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0, fill: totalColor }}
                  hide={hidden.has("total")}
                />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={seriesLabel(s.key)}
                    stroke={colorByKey.get(s.key)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    hide={hidden.has(s.key)}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>

            <Stack direction="row" flexWrap="wrap" gap={1} mt={1}>
              <LegendChip
                label="Total"
                color={totalColor}
                total={totalOrders}
                hidden={hidden.has("total")}
                onClick={() => toggleSeries("total")}
              />
              {series.map((s) => (
                <LegendChip
                  key={s.key}
                  label={seriesLabel(s.key)}
                  color={colorByKey.get(s.key) ?? "#999"}
                  total={s.total}
                  hidden={hidden.has(s.key)}
                  onClick={() => toggleSeries(s.key)}
                />
              ))}
            </Stack>
          </>
        ) : null}
      </Section>
    </Stack>
  );
}

type LegendChipProps = {
  label: string;
  color: string;
  total: number;
  hidden: boolean;
  onClick: () => void;
};

function LegendChip({ label, color, total, hidden, onClick }: LegendChipProps) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      onClick={onClick}
      sx={{
        cursor: "pointer",
        userSelect: "none",
        px: 1.25,
        py: 0.5,
        borderRadius: 999,
        border: (t) => `1px solid ${hidden ? t.palette.divider : alpha(color, 0.4)}`,
        backgroundColor: hidden ? "transparent" : alpha(color, 0.1),
        opacity: hidden ? 0.5 : 1,
        transition: "all 150ms ease",
        "&:hover": { backgroundColor: alpha(color, 0.18) },
      }}
    >
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
      <Typography variant="caption" fontWeight={600} noWrap>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {formatCompact(total)}
      </Typography>
    </Stack>
  );
}

export type { LiveOrdersChartPoint };
