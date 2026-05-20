import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type BackendError = {
  code: string;
  message: string;
};

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (err) {
    if (typeof err === "object" && err && "message" in err) {
      throw err as BackendError;
    }
    throw { code: "unknown", message: String(err) } satisfies BackendError;
  }
}
