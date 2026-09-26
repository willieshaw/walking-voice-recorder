// "Download backup" on the desktop: build the zip and let the user pick where it goes.
import { save } from "@tauri-apps/plugin-dialog";
import { buildBackup } from "./backup";
import { writeAbsolute } from "./tauriFs";

const FILTER = [{ name: "Thoughts backup", extensions: ["zip"] }];

/** Resolves null when the user cancels the save dialog. */
export async function exportLibrary(): Promise<{ count: number; filename: string } | null> {
  const { blob, count, filename } = await buildBackup();
  const path = await save({ defaultPath: filename, filters: FILTER });
  if (!path) return null;
  await writeAbsolute(path, new Uint8Array(await blob.arrayBuffer()));
  return { count, filename: path.split("/").pop() ?? filename };
}
