import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { selectIsAuthenticated, useSessionStore } from "@entities/session";
import { ROUTES } from "@shared/config";

export function RedirectIfAuth({ children }: { children: ReactNode }) {
  const isAuthed = useSessionStore(selectIsAuthenticated);
  if (isAuthed) return <Navigate to={ROUTES.dashboard} replace />;
  return <>{children}</>;
}
