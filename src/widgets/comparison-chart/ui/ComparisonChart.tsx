import {
  Alert,
  Box,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  METRICS,
  usePeriodComparison,
  type MetricDef,
  type PeriodMetrics,
} from "@entities/analytics";
import { useComparisonRangeStore } from "@entities/comparison-range";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatCompact, formatNumber, formatUZS } from "@shared/lib/format";

interface Props {}

export function ComparisonChart({}: Props) {
  const { data, isLoading, error } = usePeriodComparison();
  const granularity = useComparisonRangeStore((s) => s.granularity);

  if (isLoading) return <PageSpinner />;
  if (error) return <Alert severity="error">{(error as Error).message}</Alert>;
  if (!data) return null;

  if (data.length === 0) {
    return (
      <Stack alignItems="center" py={4}>
        <Alert severity="info" sx={{ width: "fit-content" }}>
          No data for this range.
        </Alert>
      </Stack>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gap: 3,
        gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
        // Native macOS Tahoe translucent glass styling
        "& .MuiCard-root": {
          borderRadius: "16px",
          background: (t) =>
            t.palette.mode === "light"
              ? "linear-gradient(135deg, rgba(248, 250, 252, 0.55) 0%, rgba(241, 245, 249, 0.35) 100%)"
              : "linear-gradient(135deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.3) 100%)",
          backdropFilter: "blur(24px) saturate(190%)",
          border: (t) =>
            t.palette.mode === "light"
              ? "1px solid rgba(255, 255, 255, 0.5)"
              : "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: (t) =>
            t.palette.mode === "light"
              ? "0 4px 30px rgba(0, 0, 0, 0.02), inset 0 1px 1px rgba(255, 255, 255, 0.8)"
              : "0 4px 30px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
          transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
          position: "relative",
          overflow: "hidden",
          "&::after": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.12), transparent 50%)",
            pointerEvents: "none",
          },
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: (t) =>
              t.palette.mode === "light"
                ? "0 12px 35px rgba(0, 0, 0, 0.05), inset 0 1px 1px rgba(255, 255, 255, 0.9)"
                : "0 12px 35px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
            borderColor: (t) =>
              t.palette.mode === "light"
                ? "rgba(255, 255, 255, 0.7)"
                : "rgba(255, 255, 255, 0.18)",
          }
        }
      }}
    >
      {METRICS.map((m) => (
        <SingleMetricChart
          key={m.key}
          metric={m}
          data={data}
          granularity={granularity}
        />
      ))}
    </Box>
  );
}

interface SingleMetricChartProps {
  metric: MetricDef;
  data: PeriodMetrics[];
  granularity: "week" | "month" | "year";
}

interface ChartDataItem {
  label: string;
  base: number;
  increase: number;
  decrease: number;
  originalValue: number;
  previousValue: number | null;
  percentChange: number;
}

function SingleMetricChart({
  metric,
  data,
  granularity,
}: SingleMetricChartProps) {
  const fmt = (n: number) =>
    metric.formatAs === "currency" ? formatUZS(n) : formatNumber(n);

  const chartData: ChartDataItem[] = data.map((item, index) => {
    const currentVal = item[metric.key];
    const prevVal = index > 0 ? data[index - 1][metric.key] : null;

    let base = currentVal;
    let increase = 0;
    let decrease = 0;
    let percentChange = 0;

    if (prevVal !== null) {
      percentChange = prevVal > 0 ? ((currentVal - prevVal) / prevVal) * 100 : 0;
      if (currentVal >= prevVal) {
        base = prevVal;
        increase = currentVal - prevVal;
      } else {
        base = currentVal;
        decrease = prevVal - currentVal;
      }
    }

    return {
      label: item.label,
      base,
      increase,
      decrease,
      originalValue: currentVal,
      previousValue: prevVal,
      percentChange,
    };
  });

  const lastItem = chartData[chartData.length - 1];
  const lastValFormatted = lastItem ? fmt(lastItem.originalValue) : "";
  const lastPctChange = lastItem ? lastItem.percentChange : 0;
  const hasPrev = lastItem && lastItem.previousValue !== null;

  const subtitle = lastItem
    ? `${lastValFormatted} in last ${granularity} ${
        hasPrev
          ? `(${lastPctChange >= 0 ? "+" : ""}${lastPctChange.toFixed(1)}% vs previous)`
          : ""
      }`
    : "";

  return (
    <Section title={metric.label} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height={290}>
        <BarChart data={chartData} margin={{ top: 24, right: 12, left: -8, bottom: 0 }}>
          <defs>
            {/* Liquid Glass Gradients */}
            <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="increaseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="decreaseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
            {/* Horizontal Glass Shine Specular Highlight */}
            <linearGradient id="glassShine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
              <stop offset="25%" stopColor="#ffffff" stopOpacity={0.12} />
              <stop offset="60%" stopColor="#ffffff" stopOpacity={0.0} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.15} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 6" stroke="#eef0f4" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCompact(Number(v))}
          />
          <Tooltip
            content={<CustomTooltip fmt={fmt} />}
            cursor={{ fill: "rgba(148, 163, 184, 0.04)", radius: 6 }}
          />

          <Bar
            dataKey="base"
            stackId="a"
            fill="url(#baseGrad)"
            maxBarSize={32}
            shape={<CustomBarSegment segmentType="base" />}
          />
          <Bar
            dataKey="increase"
            stackId="a"
            fill="url(#increaseGrad)"
            maxBarSize={32}
            shape={<CustomBarSegment segmentType="increase" />}
          />
          <Bar
            dataKey="decrease"
            stackId="a"
            fill="url(#decreaseGrad)"
            maxBarSize={32}
            shape={<CustomBarSegment segmentType="decrease" />}
          />
        </BarChart>
      </ResponsiveContainer>
    </Section>
  );
}

interface CustomBarSegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: ChartDataItem;
  segmentType: "base" | "increase" | "decrease";
}

function CustomBarSegment({
  x,
  y,
  width,
  height,
  fill,
  payload,
  segmentType,
}: CustomBarSegmentProps) {
  if (x === undefined || y === undefined || width === undefined || height === undefined || !payload) {
    return null;
  }

  // Segment is only visible if its height is greater than 0
  if (height <= 0) return null;

  const isIncreaseActive = payload.increase > 0;
  const isDecreaseActive = payload.decrease > 0;

  // Determine if this is the top-most rendered segment of the bar
  let isTop = false;
  if (segmentType === "increase" && isIncreaseActive) {
    isTop = true;
  } else if (segmentType === "decrease" && isDecreaseActive) {
    isTop = true;
  } else if (segmentType === "base" && !isIncreaseActive && !isDecreaseActive) {
    isTop = true;
  }

  // Rounded corner radius (only applied if it's the top segment of the stack)
  const r = isTop ? 6 : 0;
  const w = width;
  const h = height;

  // Create rounded top path
  const path = `
    M ${x},${y + h}
    L ${x},${y + r}
    ${r > 0 ? `Q ${x},${y} ${x + r},${y}` : ""}
    L ${x + w - r},${y}
    ${r > 0 ? `Q ${x + w},${y} ${x + w},${y + r}` : ""}
    L ${x + w},${y + h}
    Z
  `;

  return (
    <g>
      {/* Base Colored Bar (uses the gradient) */}
      <path d={path} fill={fill} />
      
      {/* Specular glass reflection overlay */}
      <path
        d={path}
        fill="url(#glassShine)"
        style={{ mixBlendMode: "overlay", pointerEvents: "none" }}
      />
      
      {/* Dynamic top highlight line (only on top of the capsule) */}
      {isTop && (
        <path
          d={`M ${x + r},${y + 1.5} L ${x + w - r},${y + 1.5}`}
          fill="none"
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      )}

      {/* Capsule outline stroke */}
      <path
        d={path}
        fill="none"
        stroke="rgba(255, 255, 255, 0.15)"
        strokeWidth={1}
        pointerEvents="none"
      />

      {/* Render comparison percentage badge / label on top of the bar */}
      {isTop && payload.previousValue !== null && (
        <g pointerEvents="none">
          <text
            x={x + w / 2}
            y={y - 8}
            textAnchor="middle"
            style={{
              fontSize: "10px",
              fontWeight: 700,
              fill: payload.percentChange >= 0 ? "#10b981" : "#ef4444",
              fontFamily: "Inter, Roboto, sans-serif",
            }}
          >
            {payload.percentChange >= 0 ? "+" : ""}{payload.percentChange.toFixed(0)}%
          </text>
        </g>
      )}
    </g>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: unknown[];
  label?: string;
  fmt: (n: number) => string;
}

interface TooltipPayloadItem {
  payload: ChartDataItem;
}

function CustomTooltip({ active, payload, label, fmt }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const item = (payload[0] as TooltipPayloadItem).payload;
    const currentVal = item.originalValue;
    const prevVal = item.previousValue;
    const pct = item.percentChange;

    return (
      <Paper
        elevation={4}
        sx={{
          p: 1.75,
          border: "1px solid",
          borderColor: (t) => t.palette.divider,
          borderRadius: 2.5,
          backgroundColor: (t) =>
            t.palette.mode === "light"
              ? "rgba(255, 255, 255, 0.9)"
              : "rgba(30, 41, 59, 0.9)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ display: "block", mb: 1, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {label}
        </Typography>
        <Stack spacing={0.75}>
          <Stack direction="row" justifyContent="space-between" spacing={4} alignItems="center">
            <Typography variant="body2" color="text.secondary">Current:</Typography>
            <Typography variant="body2" fontWeight={700} color="text.primary">
              {fmt(currentVal)}
            </Typography>
          </Stack>
          {prevVal !== null ? (
            <>
              <Stack direction="row" justifyContent="space-between" spacing={4} alignItems="center">
                <Typography variant="body2" color="text.secondary">Previous:</Typography>
                <Typography variant="body2" fontWeight={500} color="text.secondary">
                  {fmt(prevVal)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" spacing={4} alignItems="center">
                <Typography variant="body2" color="text.secondary">Change:</Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={pct >= 0 ? "success.main" : "error.main"}
                >
                  {pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
                </Typography>
              </Stack>
            </>
          ) : null}
        </Stack>
      </Paper>
    );
  }
  return null;
}
