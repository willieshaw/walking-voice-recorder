// "Restore from backup" / first-run import: pick a Thoughts zip and merge it in.
import { open } from "@tauri-apps/plugin-dialog";
import { restoreBackup } from "./backup";
import { readAbsolute } from "./tauriFs";

const FILTER = [{ name: "Thoughts backup", extensions: ["zip"] }];

/** Resolves null when the user cancels the open dialog. */
export async function importArchive(): Promise<{ added: number; skipped: number } | null> {
  const path = await open({ multiple: false, directory: false, filters: FILTER });
  if (!path) return null;
  const bytes = await readAbsolute(path);
  const file = new File([bytes], path.split("/").pop() ?? "backup.zip");
  return restoreBackup(file);
}
