import { Alert } from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import { formatCompact, formatUZS } from "@shared/lib/format";
import { useOrderSources } from "../model/use-utm-sources";

export function UtmSources() {
  const { data, isLoading, error } = useOrderSources();

  return (
    <Section title="Revenue by source" subtitle="Order attribution">
      {isLoading ? <PageSpinner /> : null}
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {data ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="#eef0f4" />
            <XAxis
              dataKey="source"
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={50}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCompact(Number(v))}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === "Revenue") return [formatUZS(Number(value)), name];
                return [Number(value).toLocaleString(), name];
              }}
              contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
            />
            <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </Section>
  );
}
