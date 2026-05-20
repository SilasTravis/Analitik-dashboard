import { Box } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PeopleIcon from "@mui/icons-material/People";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import PaidIcon from "@mui/icons-material/Paid";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import PercentIcon from "@mui/icons-material/Percent";
import { StatCard } from "@shared/ui/stat-card";
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatUZS,
} from "@shared/lib/format";
import { useKpi } from "../model/use-kpi";

export function KpiOverview() {
  const { data } = useKpi();

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: {
          xs: "1fr 1fr",
          md: "repeat(3, 1fr)",
          lg: "repeat(6, 1fr)",
        },
      }}
    >
      <StatCard
        label="Visits"
        value={data ? formatCompact(data.visits) : "—"}
        hint={data ? formatNumber(data.visits) : undefined}
        icon={<VisibilityIcon color="primary" />}
      />
      <StatCard
        label="Sessions"
        value={data ? formatCompact(data.sessions) : "—"}
        hint={data ? formatNumber(data.sessions) : undefined}
        icon={<PeopleIcon color="primary" />}
      />
      <StatCard
        label="Orders"
        value={data ? formatNumber(data.orders) : "—"}
        icon={<ShoppingBagIcon color="primary" />}
      />
      <StatCard
        label="Revenue"
        value={data ? formatCompact(data.revenue) : "—"}
        hint={data ? formatUZS(data.revenue) : undefined}
        icon={<PaidIcon color="primary" />}
      />
      <StatCard
        label="Avg order"
        value={data ? formatCompact(data.avg_order_value) : "—"}
        hint={data ? formatUZS(data.avg_order_value) : undefined}
        icon={<TrendingUpIcon color="primary" />}
      />
      <StatCard
        label="Conversion"
        value={data ? formatPercent(data.conversion_rate) : "—"}
        hint="Orders ÷ Sessions"
        icon={<PercentIcon color="primary" />}
      />
    </Box>
  );
}
