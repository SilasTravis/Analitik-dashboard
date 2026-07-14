import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import {
  useConversionArgs,
  useConversionFilterStore,
} from "@features/conversion-controls";

export function useConversionFunnel() {
  const args = useConversionArgs();
  const initialized = useConversionFilterStore((state) => state.initialized);
  return useQuery({
    queryKey: analyticsKeys.conversionFunnel(args),
    queryFn: () => analyticsApi.getConversionFunnel(args),
    enabled: initialized,
    staleTime: 5 * 60 * 1000,
  });
}
