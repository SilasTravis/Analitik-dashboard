export const ROUTES = {
  login: "/login",
  dashboard: "/",
  compare: "/compare",
  campaigns: "/campaigns",
  userFlow: "/user-flow",
  conversion: "/conversion",
  liveOrders: "/live-orders",
  performance: "/performance",
  geo: "/geo",
  aiScanner: "/ai-scanner",
  settings: "/settings",
} as const;

export type RouteKey = keyof typeof ROUTES;
