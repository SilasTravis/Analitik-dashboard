import { Box, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import PercentIcon from "@mui/icons-material/Percent";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import RemoveShoppingCartIcon from "@mui/icons-material/RemoveShoppingCart";
import PaidIcon from "@mui/icons-material/Paid";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import LinkIcon from "@mui/icons-material/Link";
import { formatCompact, formatPercent, formatUZS } from "@shared/lib/format";
import { useConversionKpis } from "../model/use-conversion-kpis";

type CardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  color: string;
  tooltip?: string;
};

function KpiCard({ label, value, hint, icon, color, tooltip }: CardProps) {
  const card = (
    <Box
      sx={{
        position: "relative",
        height: "100%",
        p: 2.5,
        borderRadius: 0,
        overflow: "hidden",
        border: "none",
        background: (t) =>
          t.palette.mode === "light"
            ? `linear-gradient(150deg, ${color}14 0%, rgba(255,255,255,0.5) 60%)`
            : `linear-gradient(150deg, ${color}2e 0%, rgba(30,41,59,0.35) 65%)`,
        backdropFilter: "blur(24px) saturate(180%)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
        transition: "transform .25s cubic-bezier(.25,.8,.25,1), box-shadow .25s",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: `0 16px 36px ${color}33`,
        },
        "&::after": {
          content: '""',
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}55)`,
        },
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
        <Typography
          variant="overline"
          color="text.secondary"
          letterSpacing={0.8}
          lineHeight={1.3}
        >
          {label}
        </Typography>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 2.5,
            color,
            background: `${color}1f`,
            "& svg": { fontSize: 20 },
          }}
        >
          {icon}
        </Box>
      </Stack>
      <Typography variant="h4" fontWeight={700} lineHeight={1.1}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="body2" color="text.secondary" mt={0.5}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );

  return tooltip ? (
    <Tooltip title={tooltip} arrow>
      <Box sx={{ height: "100%" }}>{card}</Box>
    </Tooltip>
  ) : (
    card
  );
}

export function ConversionKpis() {
  const { data } = useConversionKpis();
  const v = (n: (d: NonNullable<typeof data>) => ReactNode) => (data ? n(data) : "—");

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
      <KpiCard
        label="Conversion rate"
        color="#6366f1"
        icon={<PercentIcon />}
        value={v((d) => formatPercent(d.session_to_order_rate))}
        hint="Sessions → completed order"
      />
      <KpiCard
        label="Session → basket"
        color="#14b8a6"
        icon={<ShoppingCartIcon />}
        value={v((d) => formatPercent(d.session_to_basket_rate))}
        hint="Sessions that added to cart"
      />
      <KpiCard
        label="Basket → order"
        color="#0ea5e9"
        icon={<TrendingUpIcon />}
        value={v((d) => formatPercent(d.basket_to_order_rate))}
        hint="Checkout completion"
      />
      <KpiCard
        label="Cart abandonment"
        color="#ef4444"
        icon={<RemoveShoppingCartIcon />}
        value={v((d) => formatPercent(d.cart_abandonment_rate))}
        hint="Added but never ordered"
      />
      <KpiCard
        label="Avg order value"
        color="#22c55e"
        icon={<PaidIcon />}
        value={v((d) => formatCompact(d.avg_order_value))}
        hint={data ? formatUZS(data.avg_order_value) : undefined}
      />
      <KpiCard
        label="Attributed"
        color="#a855f7"
        icon={<LinkIcon />}
        value={v((d) => formatPercent(d.attributed_pct))}
        hint="Orders linked to a session"
        tooltip={
          data
            ? `${data.attributed_orders.toLocaleString()} of ${data.total_orders.toLocaleString()} orders carry a session_id. Unattributed orders (offline/CRM) are excluded from the funnel.`
            : undefined
        }
      />
    </Box>
  );
}
