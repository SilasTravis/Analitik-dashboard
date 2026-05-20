import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionApi, useSessionStore } from "@entities/session";

export function useLogout() {
  const clearSession = useSessionStore((s) => s.clearSession);
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => sessionApi.clearCredentials(),
    onSuccess: () => {
      clearSession();
      qc.clear();
    },
  });
}
