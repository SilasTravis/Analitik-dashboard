import { Alert, Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";
import ImageIcon from "@mui/icons-material/Image";
import ViewQuiltIcon from "@mui/icons-material/ViewQuilt";
import TouchAppIcon from "@mui/icons-material/TouchApp";
import DnsIcon from "@mui/icons-material/Dns";
import BrushIcon from "@mui/icons-material/Brush";
import DescriptionIcon from "@mui/icons-material/Description";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { PerformanceOverview } from "@entities/analytics";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatPercent } from "@shared/lib/format";
import {
  formatCls,
  formatMs,
  rateVital,
  ratingColor,
  RATING_LABEL,
  type VitalKey,
} from "@shared/lib/web-vitals";
import { usePerformanceOverview } from "../model/use-performance-overview";

type CardDef = {
  key: VitalKey;
  label: string;
  hint: string;
  icon: SvgIconComponent;
  color: string;
};

const CORE: CardDef[] = [
  { key: "lcp", label: "LCP", hint: "Largest Contentful Paint", icon: ImageIcon, color: "#6366f1" },
  { key: "cls", label: "CLS", hint: "Cumulative Layout Shift", icon: ViewQuiltIcon, color: "#ec4899" },
  { key: "fid", label: "FID", hint: "First Input Delay", icon: TouchAppIcon, color: "#06b6d4" },
];

const SUPPORTING: CardDef[] = [
  { key: "ttfb", label: "TTFB", hint: "Time to First Byte", icon: DnsIcon, color: "#f59e0b" },
  { key: "fcp", label: "FCP", hint: "First Contentful Paint", icon: BrushIcon, color: "#10b981" },
  { key: "dom_complete", label: "DOM Complete", hint: "DOM ready", icon: DescriptionIcon, color: "#8b5cf6" },
  { key: "full_load", label: "Full Load", hint: "Page fully loaded", icon: CheckCircleIcon, color: "#f97316" },
];

const FIELD: Record<VitalKey, keyof PerformanceOverview> = {
  ttfb: "ttfb_p75",
  fcp: "fcp_p75",
  lcp: "lcp_p75",
  cls: "cls_p75",
  fid: "fid_p75",
  dom_complete: "dom_complete_p75",
  full_load: "full_load_p75",
};

function VitalCard({ def, value }: { def: CardDef; value: number | null }) {
  const rating = rateVital(def.key, value);
  const color = ratingColor(rating);
  const display = def.key === "cls" ? formatCls(value) : formatMs(value);
  const Icon = def.icon;

  return (
    <Card
      elevation={0}
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
        height: "100%",
        background: `linear-gradient(135deg, ${def.color}14 0%, transparent 60%)`,
        borderTop: `3px solid ${def.color}`,
      }}
    >
      {/* Background watermark icon */}
      <Box
        component={Icon}
        sx={{
          position: "absolute",
          right: -12,
          bottom: -12,
          fontSize: 112,
          color: def.color,
          opacity: 0.12,
          pointerEvents: "none",
        }}
      />
      <CardContent sx={{ position: "relative" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Icon sx={{ fontSize: 18, color: def.color }} />
            <Typography variant="overline" sx={{ color: def.color, fontWeight: 700 }} letterSpacing={1}>
              {def.label}
            </Typography>
          </Stack>
          {rating ? (
            <Chip size="small" color={color === "inherit" ? "default" : color} label={RATING_LABEL[rating]} />
          ) : null}
        </Stack>
        <Typography variant="h4" fontWeight={600} color={color === "inherit" ? "text.primary" : `${color}.main`}>
          {display}
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          {def.hint} · p75
        </Typography>
      </CardContent>
    </Card>
  );
}

export function PerformanceVitals() {
  const { data, isLoading, error } = usePerformanceOverview();

  if (isLoading) return <PageSpinner />;
  if (error) return <Alert severity="error">{(error as Error).message}</Alert>;
  if (!data) return null;

  const coverage = data.total_views > 0 ? data.measured_views / data.total_views : 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Typography variant="subtitle1" fontWeight={600}>
          Core Web Vitals
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatPercent(coverage)} of views report vitals · 75th percentile
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
        }}
      >
        {CORE.map((def) => (
          <VitalCard key={def.key} def={def} value={data[FIELD[def.key]] as number | null} />
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
        }}
      >
        {SUPPORTING.map((def) => (
          <VitalCard key={def.key} def={def} value={data[FIELD[def.key]] as number | null} />
        ))}
      </Box>
    </Stack>
  );
}
