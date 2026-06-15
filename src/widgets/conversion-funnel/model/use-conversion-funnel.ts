import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useConversionArgs } from "@features/conversion-controls";

export function useConversionFunnel() {
  const args = useConversionArgs();
  return useQuery({
    queryKey: analyticsKeys.conversionFunnel(args),
    queryFn: () => analyticsApi.getConversionFunnel(args),
    staleTime: 5 * 60 * 1000,
  });
}
