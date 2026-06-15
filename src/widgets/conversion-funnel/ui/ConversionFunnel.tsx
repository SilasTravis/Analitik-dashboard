import { Box, Skeleton, Stack, Typography } from "@mui/material";
import type { ConversionFunnel as FunnelData } from "@entities/analytics";
import { formatNumber, formatPercent } from "@shared/lib/format";
import { useConversionFunnel } from "../model/use-conversion-funnel";

type StageDef = {
  key: keyof FunnelData;
  label: string;
  color: string;
};

const STAGES: StageDef[] = [
  { key: "sessions", label: "Sessions", color: "#6366f1" },
  { key: "viewed_product", label: "Viewed product", color: "#0ea5e9" },
  { key: "added_basket", label: "Added to basket", color: "#14b8a6" },
  { key: "order_placed", label: "Order placed", color: "#f59e0b" },
  { key: "order_completed", label: "Order completed", color: "#22c55e" },
];

// SVG geometry (viewBox units).
const VW = 720;
const VH = 430;
const CX = VW / 2;
const PAD = 16;
const GAP = 12;
const MAX_HW = 188;
const BAND_H = (VH - 2 * PAD - (STAGES.length - 1) * GAP) / STAGES.length;
const MIN_FRAC = 0.045;

const stepColor = (rate: number) =>
  rate >= 0.5 ? "#22c55e" : rate >= 0.2 ? "#f59e0b" : "#ef4444";

const glassCard = {
  p: 3,
  borderRadius: 0,
  border: "none",
  background: (t: any) =>
    t.palette.mode === "light"
      ? "linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(241,245,249,0.3) 100%)"
      : "linear-gradient(135deg, rgba(30,41,59,0.45) 0%, rgba(15,23,42,0.3) 100%)",
  backdropFilter: "blur(24px) saturate(180%)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
} as const;

export function ConversionFunnel() {
  const { data, isLoading } = useConversionFunnel();
  const top = data?.sessions ?? 0;

  // Visual width uses a sqrt scale so a funnel spanning several orders of
  // magnitude still tapers gracefully instead of collapsing to a sliver.
  // The labels always show the true counts and percentages.
  const fracOf = (v: number) => (top > 0 ? Math.max(Math.sqrt(v / top), MIN_FRAC) : 0);

  return (
    <Box sx={glassCard}>
      <Stack mb={1.5}>
        <Typography variant="subtitle1" fontWeight={600}>
          Conversion funnel
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Distinct sessions reaching each stage. Width tapers by share of all sessions; labels show
          true counts, share, and step-to-step conversion.
        </Typography>
      </Stack>

      {isLoading || !data ? (
        <Skeleton variant="rounded" height={360} />
      ) : (
        <Box sx={{ color: "text.primary" }}>
          <svg
            width="100%"
            height={372}
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Conversion funnel chart"
          >
            <defs>
              {STAGES.map((s) => (
                <linearGradient key={s.key} id={`funnel-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.7} />
                </linearGradient>
              ))}
              <style>
                {`@keyframes funnelGrow { from { transform: scaleX(0); opacity: 0 } to { transform: scaleX(1); opacity: 1 } }
                  .funnel-band { transform-box: fill-box; transform-origin: center; animation: funnelGrow .6s cubic-bezier(.25,.8,.25,1) both; }`}
              </style>
            </defs>

            {STAGES.map((stage, i) => {
              const value = data[stage.key];
              const prev = i === 0 ? value : data[STAGES[i - 1].key];
              const topHW = MAX_HW * fracOf(value);
              const botHW = MAX_HW * fracOf(i < STAGES.length - 1 ? data[STAGES[i + 1].key] : value);
              const yTop = PAD + i * (BAND_H + GAP);
              const yBot = yTop + BAND_H;
              const yMid = yTop + BAND_H / 2;
              const overall = top > 0 ? value / top : 0;
              const step = prev > 0 ? value / prev : 0;
              const points = `${CX - topHW},${yTop} ${CX + topHW},${yTop} ${CX + botHW},${yBot} ${CX - botHW},${yBot}`;

              return (
                <g key={stage.key}>
                  <polygon
                    className="funnel-band"
                    points={points}
                    fill={`url(#funnel-${stage.key})`}
                    style={{ animationDelay: `${i * 90}ms`, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.08))" }}
                  />

                  {/* Left: stage name + count */}
                  <text x={CX - MAX_HW - 18} y={yMid - 5} textAnchor="end" fill="currentColor" fontSize={15} fontWeight={600}>
                    {stage.label}
                  </text>
                  <text x={CX - MAX_HW - 18} y={yMid + 15} textAnchor="end" fill="currentColor" opacity={0.55} fontSize={13}>
                    {formatNumber(value)}
                  </text>

                  {/* Right: share of sessions + step conversion */}
                  <text x={CX + MAX_HW + 18} y={yMid - 5} textAnchor="start" fill={stage.color} fontSize={15} fontWeight={700}>
                    {formatPercent(overall)}
                  </text>
                  {i > 0 && (
                    <text x={CX + MAX_HW + 18} y={yMid + 15} textAnchor="start" fill={stepColor(step)} fontSize={12} fontWeight={600}>
                      ↓ {formatPercent(step)} continue
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </Box>
      )}
    </Box>
  );
}
