import { CssBaseline, ThemeProvider as MuiThemeProvider } from "@mui/material";
import type { ReactNode } from "react";
import { theme } from "@app/styles/theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
