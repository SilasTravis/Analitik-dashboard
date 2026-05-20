import { useState } from "react";
import { Alert, Box, Grid, Paper, Stack, Typography, useTheme } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatCompact, formatNumber } from "@shared/lib/format";
import { useCampaignsReport } from "../model/use-campaigns";
import type { CampaignRow } from "@entities/analytics";

interface ChartCardProps {
  title: string;
  data: CampaignRow[];
  dataKey: "page_views" | "sessions" | "baskets" | "orders" | "revenue";
  palette: string[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  totalAll?: number;
  dataKey?: string;
}

function CustomTooltip({ active, payload, totalAll = 0, dataKey = "" }: CustomTooltipProps) {
  const theme = useTheme();
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const name = data.campaign;
  const val = Number(data[dataKey]);
  const percentage = totalAll > 0 ? (val / totalAll) * 100 : 0;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 2,
        backgroundColor:
          theme.palette.mode === "light"
            ? "#ffffff"
            : "#0f172a",
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
      }}
    >
      <Typography variant="body2" fontWeight={600} mb={0.5}>
        {name}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: payload[0].fill,
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Share:
          </Typography>
        </Stack>
        <Typography variant="caption" fontWeight={600}>
          {formatNumber(val)} ({percentage.toFixed(1)}%)
        </Typography>
      </Stack>
    </Paper>
  );
}

function ChartCard({ title, data, dataKey, palette }: ChartCardProps) {
  const theme = useTheme();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Sort descending by target metric
  const sortedData = [...data].sort((a, b) => Number(b[dataKey]) - Number(a[dataKey]));
  const topData = sortedData.slice(0, 5);
  const totalAll = data.reduce((sum, item) => sum + Number(item[dataKey]), 0);
  const totalTop5 = topData.reduce((sum, item) => sum + Number(item[dataKey]), 0);

  // Group trailing items into "Others"
  const chartData = [...topData];
  if (sortedData.length > 5) {
    const othersValue = totalAll - totalTop5;
    if (othersValue > 0) {
      chartData.push({
        campaign: "Others",
        page_views: 0,
        sessions: 0,
        baskets: 0,
        orders: 0,
        revenue: 0,
        [dataKey]: othersValue,
      } as unknown as CampaignRow);
    }
  }

  const hasData = totalAll > 0;
  const totalFormatted = formatCompact(totalAll);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 4,
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor:
          theme.palette.mode === "light"
            ? "rgba(255, 255, 255, 0.4)"
            : "rgba(30, 41, 59, 0.2)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.01)",
        height: 290,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} mb={1} color="text.primary">
        {title}
      </Typography>

      {!hasData ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No data for this period
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2} sx={{ flex: 1, minHeight: 0, alignItems: "center" }}>
          {/* Doughnut Chart */}
          <Grid item xs={12} sm={6}>
            <Box sx={{ height: 180, width: "100%", position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey={dataKey}
                    nameKey="campaign"
                    innerRadius={50}
                    outerRadius={68}
                    paddingAngle={2}
                    stroke={theme.palette.background.paper}
                    strokeWidth={1.5}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {chartData.map((_, index) => {
                      const isHovered = activeIndex === index;
                      const baseColor = palette[index % palette.length];
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={baseColor}
                          fillOpacity={activeIndex === null || isHovered ? 1 : 0.4}
                          style={{
                            transform: isHovered ? "scale(1.04)" : "scale(1)",
                            transformOrigin: "center",
                            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                            cursor: "pointer",
                          }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip content={<CustomTooltip totalAll={totalAll} dataKey={dataKey} />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Central text overlay */}
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                  pointerEvents: "none",
                }}
              >
                <Typography variant="h5" fontWeight={800} color="text.primary" sx={{ lineHeight: 1.1 }}>
                  {totalFormatted}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  Total
                </Typography>
              </Box>
            </Box>
          </Grid>

          {/* Interactive Legend list */}
          <Grid item xs={12} sm={6}>
            <Stack spacing={1} sx={{ overflowY: "auto", pr: 0.5, maxHeight: 180 }}>
              {chartData.map((item, index) => {
                const val = Number(item[dataKey]);
                const percentage = totalAll > 0 ? (val / totalAll) * 100 : 0;
                const isHovered = activeIndex === index;
                const color = palette[index % palette.length];

                return (
                  <Box
                    key={item.campaign}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      p: 0.5,
                      borderRadius: 1.5,
                      cursor: "pointer",
                      backgroundColor: isHovered ? theme.palette.action.hover : "transparent",
                      transition: "all 0.2s ease",
                      transform: isHovered ? "translateX(4px)" : "none",
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        variant="body2"
                        fontWeight={isHovered ? 600 : 500}
                        noWrap
                        sx={{
                          color: isHovered ? "text.primary" : "text.secondary",
                          maxWidth: 110,
                        }}
                      >
                        {item.campaign}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexShrink: 0 }}>
                      <Typography variant="body2" fontWeight={600} color="text.primary">
                        {formatNumber(val)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {percentage.toFixed(0)}%
                      </Typography>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Grid>
        </Grid>
      )}
    </Paper>
  );
}

const PAGE_VIEWS_PALETTE = ["#6366f1", "#4f46e5", "#818cf8", "#a5b4fc", "#c7d2fe"];
const SESSIONS_PALETTE = ["#06b6d4", "#0891b2", "#22d3ee", "#67e8f9", "#a5f3fc"];
const BASKETS_PALETTE = ["#f59e0b", "#d97706", "#b45309", "#fbbf24", "#fef3c7"];
const ORDERS_PALETTE = ["#10b981", "#059669", "#047857", "#34d399", "#a7f3d0"];

export function CampaignsCharts() {
  const { data, isLoading, error } = useCampaignsReport();

  if (isLoading) return <PageSpinner />;
  if (error) return <Alert severity="error">{(error as Error).message}</Alert>;
  if (!data || data.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 4,
          borderRadius: 4,
          textAlign: "center",
          border: (t) => `1px solid ${t.palette.divider}`,
          backgroundColor: (t) =>
            t.palette.mode === "light"
              ? "rgba(255, 255, 255, 0.4)"
              : "rgba(30, 41, 59, 0.2)",
          backdropFilter: "blur(20px)",
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No campaigns found for the selected date range.
        </Typography>
      </Paper>
    );
  }

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <ChartCard
          title="Page Views by Campaign"
          data={data}
          dataKey="page_views"
          palette={PAGE_VIEWS_PALETTE}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <ChartCard
          title="Sessions by Campaign"
          data={data}
          dataKey="sessions"
          palette={SESSIONS_PALETTE}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <ChartCard
          title="Baskets by Campaign"
          data={data}
          dataKey="baskets"
          palette={BASKETS_PALETTE}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <ChartCard
          title="Orders by Campaign"
          data={data}
          dataKey="orders"
          palette={ORDERS_PALETTE}
        />
      </Grid>
    </Grid>
  );
}
