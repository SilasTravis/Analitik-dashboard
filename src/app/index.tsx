import "@app/styles/global.css";
import { AppProviders } from "./providers";
import { AppRouter } from "./routes/AppRouter";

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
