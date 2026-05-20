import { useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdaterState =
  | { type: "idle" }
  | { type: "checking" }
  | { type: "upToDate"; version: string }
  | { type: "available"; update: Update; notes?: string }
  | { type: "downloading"; progress: number }
  | { type: "error"; message: string };

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({ type: "idle" });

  const checkForUpdate = async () => {
    setState({ type: "checking" });
    try {
      const currentVersion = await getVersion();
      const update = await check();
      
      if (update && update.available) {
        setState({
          type: "available",
          update,
          notes: update.body || undefined,
        });
      } else {
        setState({ type: "upToDate", version: currentVersion });
      }
    } catch (err) {
      setState({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const installUpdate = async (update: Update) => {
    setState({ type: "downloading", progress: 0 });
    try {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            const pct = contentLength ? Math.round((downloaded / contentLength) * 100) : 0;
            setState({ type: "downloading", progress: pct });
            break;
          case "Finished":
            break;
        }
      });

      // Relaunch app
      await relaunch();
    } catch (err) {
      setState({
        type: "error",
        message: `Failed to install update: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  return { state, checkForUpdate, installUpdate };
}
