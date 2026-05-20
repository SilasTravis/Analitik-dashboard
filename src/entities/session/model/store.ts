import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Session, PublicCredentials } from "./types";

type SessionState = {
  session: Session | null;
  reconnectError: string | null;
  _hasHydrated: boolean;
  setSession: (creds: PublicCredentials) => void;
  clearSession: () => void;
  setReconnectError: (message: string | null) => void;
  setHasHydrated: (state: boolean) => void;
};

/**
 * Only the non-sensitive `session` slice is persisted to localStorage so the
 * app can render the dashboard instantly on refresh instead of bouncing to
 * /login while the Tauri backend re-establishes the DB connection. The
 * password lives only inside the AES-256-GCM encrypted vault on disk — it is
 * never written to localStorage.
 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      reconnectError: null,
      _hasHydrated: false,
      setSession: (credentials) => set({ session: { credentials }, reconnectError: null }),
      clearSession: () => set({ session: null, reconnectError: null }),
      setReconnectError: (message) => set({ reconnectError: message }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "analitic.session",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ session: s.session }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export const selectIsAuthenticated = (s: SessionState): boolean => s.session !== null;

