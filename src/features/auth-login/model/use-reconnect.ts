import { useMutation } from "@tanstack/react-query";
import { sessionApi, useSessionStore } from "@entities/session";
import type { BackendError } from "@shared/api";

/**
 * Retry connecting using the encrypted vault on disk + Keychain DEK.
 * Used when auto-reconnect failed at launch (e.g. VPN was off).
 */
export function useReconnect() {
  const setSession = useSessionStore((s) => s.setSession);
  const setReconnectError = useSessionStore((s) => s.setReconnectError);

  return useMutation({
    mutationFn: () => sessionApi.connectWithSaved(),
    onSuccess: (creds) => setSession(creds),
    onError: (err) => {
      const e = err as unknown as BackendError;
      setReconnectError(e?.message ?? "Reconnect failed.");
    },
  });
}
