import { Card, CardContent, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
};

export function StatCard({ label, value, hint, icon }: StatCardProps) {
  return (
    <Card elevation={0} sx={{ borderRadius: 3, height: "100%" }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="overline" color="text.secondary" letterSpacing={1}>
            {label}
          </Typography>
          {icon}
        </Stack>
        <Typography variant="h4" fontWeight={600}>
          {value}
        </Typography>
        {hint ? (
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {hint}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}
