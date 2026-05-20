import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ROUTES } from "@shared/config";
import { LoginPage } from "@pages/login";
import { DashboardPage } from "@pages/dashboard";
import { ComparePage } from "@pages/compare";
import { CampaignsPage } from "@pages/campaigns";
import { UserFlowPage } from "@pages/user-flow";
import { SettingsPage } from "@pages/settings";
import { RequireAuth } from "./RequireAuth";
// Force Vite HMR resolution
import { RedirectIfAuth } from "./RedirectIfAuth";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path={ROUTES.login}
          element={
            <RedirectIfAuth>
              <LoginPage />
            </RedirectIfAuth>
          }
        />
        <Route
          path={ROUTES.dashboard}
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.compare}
          element={
            <RequireAuth>
              <ComparePage />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.campaigns}
          element={
            <RequireAuth>
              <CampaignsPage />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.userFlow}
          element={
            <RequireAuth>
              <UserFlowPage />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.settings}
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
