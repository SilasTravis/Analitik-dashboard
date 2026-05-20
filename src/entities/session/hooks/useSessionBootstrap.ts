import { useEffect, useState } from "react";
import { sessionApi } from "../api/session.api";
import { useSessionStore } from "../model/store";
import type { BackendError } from "@shared/api";

/**
 * Headless hook to handle authentication bootstrapping on launch or refresh.
 * If cached session metadata is present in localStorage, it immediately permits
 * rendering (ready = true) to prevent UI bouncing. It then establishes the actual
 * database connection in the background.
 */
export function useSessionBootstrap() {
  const setSession = useSessionStore((s) => s.setSession);
  const clearSession = useSessionStore((s) => s.clearSession);
  const setReconnectError = useSessionStore((s) => s.setReconnectError);
  const _hasHydrated = useSessionStore((s) => s._hasHydrated);

  // We are ready to render once the store is hydrated AND either:
  // 1. There is no active session (so we can render /login immediately)
  // 2. We have a session and have completed our connection check/attempt
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Wait until the store is hydrated before doing anything
    if (!_hasHydrated) return;

    let cancelled = false;

    // Read the hydrated session state directly to avoid dependency triggers
    const session = useSessionStore.getState().session;

    // If no session exists, we can immediately render the login page
    if (session === null) {
      setReady(true);
      return;
    }

    async function bootstrap() {
      try {
        const creds = await sessionApi.connectWithSaved();
        if (!cancelled) {
          setSession(creds);
        }
      } catch (err) {
        if (cancelled) return;
        const e = err as unknown as BackendError;
        if (e?.code === "no_credentials") {
          // If no credentials exist on disk, clear any stale localStorage metadata
          // so the router redirects the user back to the login screen.
          clearSession();
        } else {
          // If it is a network failure, VPN failure, or keychain refusal, we keep
          // the session metadata so they stay on the dashboard, but set the error
          // so the app displays the ReconnectBanner.
          setReconnectError(e?.message ?? "Auto-reconnect failed.");
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [_hasHydrated, setSession, clearSession, setReconnectError]);

  return { ready: _hasHydrated && ready };
}
