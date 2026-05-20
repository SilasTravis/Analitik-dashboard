import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";
import { QueryProvider } from "./QueryProvider";
import { SessionBootstrap } from "./SessionBootstrap";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SessionBootstrap>{children}</SessionBootstrap>
      </QueryProvider>
    </ThemeProvider>
  );
}
