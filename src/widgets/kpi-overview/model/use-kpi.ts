import { mergeKpi, useDashboardDomains } from "@entities/analytics";

export function useKpi() {
  const { commerce, traffic, sessions } = useDashboardDomains();
  const data = commerce.data && traffic.data && sessions.data
    ? mergeKpi(traffic.data, sessions.data, commerce.data)
    : undefined;
  const error = commerce.error ?? traffic.error ?? sessions.error;
  return {
    ...commerce,
    data,
    error,
    isError: Boolean(error),
    isSuccess: Boolean(data),
    isLoading: commerce.isLoading || traffic.isLoading || sessions.isLoading,
    isPending: commerce.isPending || traffic.isPending || sessions.isPending,
    isFetching: commerce.isFetching || traffic.isFetching || sessions.isFetching,
    status: error ? "error" as const : data ? "success" as const : "pending" as const,
  };
}
