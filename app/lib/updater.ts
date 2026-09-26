// In-app updates: check GitHub Releases (the endpoint is in tauri.conf.json) once after boot
// and on demand from Settings; install only when the user clicks. The plugin verifies the
// bundle's signature against the public key in the config before installing.
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface AvailableUpdate {
  version: string;
  /** The plugin's handle; opaque to the UI. */
  handle: Pick<Update, "version" | "downloadAndInstall">;
}

export interface Progress {
  received: number;
  /** Bytes expected, or null when the server didn't say. */
  total: number | null;
}

export type StripPhase =
  | { phase: "idle" }
  | { phase: "dismissed" }
  | { phase: "downloading"; received: number; total: number | null }
  | { phase: "error"; message: string };

export type StripState =
  | { kind: "hidden" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "error"; version: string; message: string };

/** What the strip shows for a given update + phase. Pure. */
export function updateStripState(
  update: { version: string } | null,
  phase: StripPhase,
): StripState {
  if (!update || phase.phase === "dismissed") return { kind: "hidden" };
  switch (phase.phase) {
    case "idle":
      return { kind: "available", version: update.version };
    case "downloading":
      return {
        kind: "downloading",
        version: update.version,
        percent: phase.total ? Math.floor((phase.received / phase.total) * 100) : null,
      };
    case "error":
      return { kind: "error", version: update.version, message: phase.message };
  }
}

/** Resolves null when the running version is current. Rejects on network/manifest errors. */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const u = await check();
  return u ? { version: u.version, handle: u } : null;
}

/** Download, verify, install, then relaunch into the new version. */
export async function installUpdate(
  update: AvailableUpdate,
  onProgress: (p: Progress) => void,
): Promise<void> {
  let received = 0;
  let total: number | null = null;
  await update.handle.downloadAndInstall((e) => {
    if (e.event === "Started") {
      total = e.data.contentLength ?? null;
      onProgress({ received, total });
    } else if (e.event === "Progress") {
      received += e.data.chunkLength;
      onProgress({ received, total });
    }
  });
  await relaunch();
}
