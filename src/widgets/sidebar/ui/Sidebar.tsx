import { Box, Stack, Typography } from "@mui/material";
import InsightsIcon from "@mui/icons-material/Insights";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import CampaignIcon from "@mui/icons-material/Campaign";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import SpeedIcon from "@mui/icons-material/Speed";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SettingsIcon from "@mui/icons-material/Settings";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { MouseEvent } from "react";
import { useMemo } from "react";
import { ROUTES } from "@shared/config";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { NavigationCoordinator } from "../model/navigation-coordinator";

const items = [
  { to: ROUTES.dashboard, label: "Overview", icon: <InsightsIcon fontSize="small" /> },
  { to: ROUTES.compare, label: "Comparison", icon: <CompareArrowsIcon fontSize="small" /> },
  { to: ROUTES.campaigns, label: "Campaigns", icon: <CampaignIcon fontSize="small" /> },
  { to: ROUTES.userFlow, label: "User Flow", icon: <AltRouteIcon fontSize="small" /> },
  { to: ROUTES.conversion, label: "Conversion", icon: <FilterAltIcon fontSize="small" /> },
  { to: ROUTES.performance, label: "Performance", icon: <SpeedIcon fontSize="small" /> },
  { to: ROUTES.geo, label: "GEO", icon: <MapOutlinedIcon fontSize="small" /> },
  { to: ROUTES.aiScanner, label: "AI Scanner", icon: <AutoAwesomeIcon fontSize="small" /> },
  { to: ROUTES.settings, label: "Settings", icon: <SettingsIcon fontSize="small" /> },
];

export function Sidebar() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useMemo(
    () =>
      new NavigationCoordinator(
        async () => {
          try {
            await queryClient.cancelQueries({ queryKey: analyticsKeys.all });
            await analyticsApi.cancelObsoleteQueries();
          } catch (error) {
            console.warn("Failed to cancel queries from the previous page", error);
          }
        },
        navigate,
        () =>
          queryClient.invalidateQueries({
            queryKey: analyticsKeys.all,
            refetchType: "active",
          }),
      ),
    [navigate, queryClient],
  );

  const handleNavigation = async (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    await navigation.request(to, location.pathname);
  };

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
              onClick={(event) => void handleNavigation(event, item.to)}
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
