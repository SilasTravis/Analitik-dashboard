import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import {
  useConversionArgs,
  useConversionFilterStore,
} from "@features/conversion-controls";

export function useConversionKpis() {
  const args = useConversionArgs();
  const initialized = useConversionFilterStore((state) => state.initialized);
  return useQuery({
    queryKey: analyticsKeys.conversionKpis(args),
    queryFn: () => analyticsApi.getConversionKpis(args),
    enabled: initialized,
    staleTime: 5 * 60 * 1000,
  });
}
