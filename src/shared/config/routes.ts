export const ROUTES = {
  login: "/login",
  dashboard: "/",
  compare: "/compare",
  campaigns: "/campaigns",
  userFlow: "/user-flow",
  performance: "/performance",
  settings: "/settings",
} as const;

export type RouteKey = keyof typeof ROUTES;
