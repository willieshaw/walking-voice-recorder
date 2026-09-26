// FsPort over @tauri-apps/plugin-fs, rooted at the app data directory. Also the two
// absolute-path helpers used for the backup zip the user picks in a dialog.
import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  rename,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { FsPort } from "./fsPort";

const base = { baseDir: BaseDirectory.AppData };

export const tauriFs: FsPort = {
  async readDir(path) {
    const entries = await readDir(path, base);
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }));
  },
  readFile: (path) => readFile(path, base),
  readTextFile: (path) => readTextFile(path, base),
  writeFile: (path, data) => writeFile(path, data, base),
  writeTextFile: (path, text) => writeTextFile(path, text, base),
  mkdir: (path) => mkdir(path, { ...base, recursive: true }),
  rename: (from, to) =>
    rename(from, to, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData }),
  async remove(path) {
    if (await exists(path, base)) await remove(path, { ...base, recursive: true });
  },
  exists: (path) => exists(path, base),
};

/** Read a file at an absolute path the user chose in an open dialog. */
export function readAbsolute(path: string): Promise<Uint8Array> {
  return readFile(path);
}

/** Write a file at an absolute path the user chose in a save dialog. */
export function writeAbsolute(path: string, data: Uint8Array): Promise<void> {
  return writeFile(path, data);
}
