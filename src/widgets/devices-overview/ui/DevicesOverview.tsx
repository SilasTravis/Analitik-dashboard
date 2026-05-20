import { Alert } from "@mui/material";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Section } from "@shared/ui/section";
import { PageSpinner } from "@shared/ui/page-spinner";
import { useDevices } from "../model/use-devices";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#a855f7"];

export function DevicesOverview() {
  const { data, isLoading, error } = useDevices();

  return (
    <Section title="Devices" subtitle="Sessions by device">
      {isLoading ? <PageSpinner /> : null}
      {error ? <Alert severity="error">{(error as Error).message}</Alert> : null}
      {data ? (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="device"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : null}
    </Section>
  );
}
