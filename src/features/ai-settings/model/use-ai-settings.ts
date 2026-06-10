import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi, aiKeys } from "@entities/ai";
import type { PublicAiSettings, SaveAiSettingsInput } from "@entities/ai";
import type { BackendError } from "@shared/api";

export function useAiSettings() {
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: aiKeys.settings,
    queryFn: aiApi.loadSettings,
  });

  const save = useMutation({
    mutationFn: (input: SaveAiSettingsInput) => aiApi.saveSettings(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.settings }),
  });

  const clear = useMutation({
    mutationFn: () => aiApi.clearSettings(),
    onSuccess: () => qc.invalidateQueries({ queryKey: aiKeys.settings }),
  });

  const settings = (settingsQuery.data ?? null) as PublicAiSettings | null;

  return {
    settings,
    isConfigured: !!settings?.has_key,
    loading: settingsQuery.isLoading,
    save: (input: SaveAiSettingsInput) => save.mutateAsync(input),
    saving: save.isPending,
    saveError: save.error as BackendError | null,
    clear: () => clear.mutateAsync(),
    clearing: clear.isPending,
    clearError: clear.error as BackendError | null,
  };
}
