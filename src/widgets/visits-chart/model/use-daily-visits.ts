import {
  mergeDailyTraffic,
  useDashboardSessions,
  useDashboardTraffic,
} from "@entities/analytics";

export function useDailyTraffic() {
  const traffic = useDashboardTraffic();
  const sessions = useDashboardSessions();
  const data = traffic.data && sessions.data
    ? mergeDailyTraffic(traffic.data, sessions.data)
    : undefined;
  const error = traffic.error ?? sessions.error;
  return {
    ...traffic,
    data,
    error,
    isError: Boolean(error),
    isSuccess: Boolean(data),
    isLoading: traffic.isLoading || sessions.isLoading,
    isPending: traffic.isPending || sessions.isPending,
    isFetching: traffic.isFetching || sessions.isFetching,
    status: error ? "error" as const : data ? "success" as const : "pending" as const,
  };
}
