import { useQuery } from "@tanstack/react-query";
import { analyticsApi, analyticsKeys } from "@entities/analytics";
import { useConversionArgs } from "@features/conversion-controls";

export function useConversionKpis() {
  const args = useConversionArgs();
  return useQuery({
    queryKey: analyticsKeys.conversionKpis(args),
    queryFn: () => analyticsApi.getConversionKpis(args),
    staleTime: 5 * 60 * 1000,
  });
}
