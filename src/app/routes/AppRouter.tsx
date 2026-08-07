import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ROUTES } from "@shared/config";
import { LoginPage } from "@pages/login";
import { DashboardPage } from "@pages/dashboard";
import { ComparePage } from "@pages/compare";
import { CampaignsPage } from "@pages/campaigns";
import { UserFlowPage } from "@pages/user-flow";
import { ConversionPage } from "@pages/conversion";
import { LiveOrdersPage } from "@pages/live-orders";
import { PerformancePage } from "@pages/performance";
import { AiScannerPage } from "@pages/ai-scanner";
import { SettingsPage } from "@pages/settings";
import { PageSpinner } from "@shared/ui/page-spinner";
import { RequireAuth } from "./RequireAuth";
// Force Vite HMR resolution
import { RedirectIfAuth } from "./RedirectIfAuth";

const GeoPage = lazy(() =>
  import("@pages/geo").then((module) => ({ default: module.GeoPage })),
);

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
          path={ROUTES.conversion}
          element={
            <RequireAuth>
              <ConversionPage />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.liveOrders}
          element={
            <RequireAuth>
              <LiveOrdersPage />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.performance}
          element={
            <RequireAuth>
              <PerformancePage />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.geo}
          element={
            <RequireAuth>
              <Suspense fallback={<PageSpinner />}>
                <GeoPage />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.aiScanner}
          element={
            <RequireAuth>
              <AiScannerPage />
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
