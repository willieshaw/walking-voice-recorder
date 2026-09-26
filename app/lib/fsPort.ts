// The tiny filesystem surface the note store needs. Paths are relative to the app data
// directory (~/Library/Application Support/<bundle id>/). Production binds this to the
// Tauri fs plugin; tests bind an in-memory fake.

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface FsPort {
  readDir(path: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  writeTextFile(path: string, text: string): Promise<void>;
  /** Recursive and idempotent. */
  mkdir(path: string): Promise<void>;
  /** Atomic replace of `to` if it exists. */
  rename(from: string, to: string): Promise<void>;
  /** Recursive; resolves even when the path is missing. */
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

let port: FsPort | null = null;

/** Tests inject the fake here before touching the store. */
export function setFsPort(p: FsPort): void {
  port = p;
}

/** Lazily binds the Tauri implementation so importing the store never touches Tauri
 *  globals in Node. */
export async function getFsPort(): Promise<FsPort> {
  const bound = port ?? (await import("./tauriFs")).tauriFs;
  port ??= bound; // a setFsPort() that landed while the import was in flight wins
  return port;
}
