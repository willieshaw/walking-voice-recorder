// One action behind every "download your notes" button: build the archive, hand it to the
// browser as a download, and stamp the export time the reminder banner reads. An anchor
// download gives no cancel signal, so the stamp means "download was started", not "file
// confirmed on disk".
import { buildBackup } from "./backup";
import { setLastExportAt } from "./exportReminder";

export async function exportLibrary(): Promise<{ count: number; filename: string }> {
  const at = Date.now(); // the snapshot moment: anything written after this is "changed since"
  const { blob, count, filename } = await buildBackup();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  setLastExportAt(at);
  return { count, filename };
}
