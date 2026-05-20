import { Box, Stack, Typography } from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import CampaignIcon from "@mui/icons-material/Campaign";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import SettingsIcon from "@mui/icons-material/Settings";
import { NavLink } from "react-router-dom";
import { ROUTES } from "@shared/config";

const items = [
  { to: ROUTES.dashboard, label: "Overview", icon: <InsightsIcon fontSize="small" /> },
  { to: ROUTES.compare, label: "Comparison", icon: <CompareArrowsIcon fontSize="small" /> },
  { to: ROUTES.campaigns, label: "Campaigns", icon: <CampaignIcon fontSize="small" /> },
  { to: ROUTES.userFlow, label: "User Flow", icon: <AltRouteIcon fontSize="small" /> },
  { to: ROUTES.settings, label: "Settings", icon: <SettingsIcon fontSize="small" /> },
];

export function Sidebar() {
  return (
    <Box
      sx={{
        width: 232,
        height: "100%",
        px: 2.5,
        py: 3,
        borderRight: (t) => `1px solid ${t.palette.divider}`,
        backgroundColor: (t) => t.palette.background.default,
      }}
    >
      <Stack spacing={3}>
        <Typography variant="h6" fontWeight={700}>
          Analitic
        </Typography>
        <Stack spacing={0.5}>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              style={{ textDecoration: "none" }}
            >
              {({ isActive }) => (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    color: (t) =>
                      isActive ? t.palette.primary.main : t.palette.text.secondary,
                    backgroundColor: (t) =>
                      isActive ? t.palette.action.selected : "transparent",
                    cursor: "pointer",
                    transition: "background-color 150ms ease, color 150ms ease",
                    "&:hover": {
                      backgroundColor: (t) => t.palette.action.hover,
                    },
                  }}
                >
                  {item.icon}
                  <Typography variant="body2" fontWeight={isActive ? 600 : 500}>
                    {item.label}
                  </Typography>
                </Stack>
              )}
            </NavLink>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
