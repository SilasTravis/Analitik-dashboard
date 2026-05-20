import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { selectIsAuthenticated, useSessionStore } from "@entities/session";
import { ROUTES } from "@shared/config";

export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthed = useSessionStore(selectIsAuthenticated);
  if (!isAuthed) return <Navigate to={ROUTES.login} replace />;
  return <>{children}</>;
}
