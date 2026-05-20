import type { ReactNode } from "react";
import { useSessionBootstrap } from "@entities/session";
import { PageSpinner } from "@shared/ui/page-spinner";

/**
 * Bootstraps the database session on launch or page refresh.
 * Uses the headless `useSessionBootstrap` hook to handle background reconnection
 * and avoid blocking page render when a cached session is found in localStorage.
 */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const { ready } = useSessionBootstrap();

  if (!ready) return <PageSpinner />;
  return <>{children}</>;
}

