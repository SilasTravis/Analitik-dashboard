import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

const buildClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // Analytics queries are expensive — keep cached results fresh for 5 min.
        // The Refresh button explicitly invalidates when the user wants new data.
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(buildClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
