import { Box, Card, CardActionArea, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import type { AiIntent } from "@entities/ai";

type Preset = {
  intent: AiIntent;
  title: string;
  desc: string;
  icon: ReactNode;
  color: string;
};

const PRESETS: Preset[] = [
  { intent: "analiz", title: "Analiz", desc: "General data analysis", icon: <QueryStatsIcon />, color: "#6366f1" },
  { intent: "prognoz", title: "Prognoz", desc: "Forecast & trends", icon: <TrendingUpIcon />, color: "#0ea5e9" },
  { intent: "improve", title: "Improve", desc: "Lift conversion & revenue", icon: <RocketLaunchIcon />, color: "#10b981" },
  { intent: "discomfort", title: "Discomfort", desc: "Friction & pain points", icon: <ReportProblemIcon />, color: "#f43f5e" },
];

type Props = {
  onRun: (intent: AiIntent) => void;
  disabled?: boolean;
};

export function PresetGrid({ onRun, disabled }: Props) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2.5,
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
      }}
    >
      {PRESETS.map((p) => (
        <Card key={p.intent} sx={{ borderRadius: "16px" }}>
          <CardActionArea
            disabled={disabled}
            onClick={() => onRun(p.intent)}
            sx={{ p: 2.5, height: "100%" }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "12px",
                  display: "grid",
                  placeItems: "center",
                  color: p.color,
                  backgroundColor: `${p.color}1f`,
                }}
              >
                {p.icon}
              </Box>
              <Stack spacing={0.25}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {p.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {p.desc}
                </Typography>
              </Stack>
            </Stack>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
