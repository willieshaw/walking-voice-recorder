// In-memory FsPort with the same semantics the store relies on: recursive mkdir,
// atomic rename-over, recursive remove, direct-children readDir. Strict like the real
// plugin: writeFile does NOT create parent directories, and reads return copies.
import type { DirEntry, FsPort } from "../../app/lib/fsPort.js";

const norm = (p: string) => p.replace(/\/+$/, "");
const parent = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

export class MemoryFs implements FsPort {
  files = new Map<string, Uint8Array>();
  dirs = new Set<string>([""]);

  private ensureParents(p: string) {
    let d = parent(p);
    while (d && !this.dirs.has(d)) {
      this.dirs.add(d);
      d = parent(d);
    }
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const dir = norm(path);
    if (!this.dirs.has(dir)) throw new Error(`readDir: ${dir} is missing`);
    const prefix = dir ? `${dir}/` : "";
    const out = new Map<string, boolean>();
    for (const d of this.dirs) {
      if (d.startsWith(prefix) && d !== dir) out.set(d.slice(prefix.length).split("/")[0], true);
    }
    for (const f of this.files.keys()) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length);
        if (!rest.includes("/")) out.set(rest, false);
      }
    }
    return [...out].map(([name, isDirectory]) => ({ name, isDirectory }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const f = this.files.get(norm(path));
    if (!f) throw new Error(`readFile: ${path} is missing`);
    return f.slice();
  }

  async readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await this.readFile(path));
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    const p = norm(path);
    if (!this.dirs.has(parent(p))) throw new Error(`writeFile: parent of ${p} is missing`);
    this.files.set(p, data.slice());
  }

  async writeTextFile(path: string, text: string): Promise<void> {
    await this.writeFile(path, new TextEncoder().encode(text));
  }

  async mkdir(path: string): Promise<void> {
    const p = norm(path);
    this.ensureParents(p);
    this.dirs.add(p);
  }

  async rename(from: string, to: string): Promise<void> {
    const f = norm(from);
    const t = norm(to);
    if (this.files.has(f)) {
      this.files.set(t, this.files.get(f)!);
      this.files.delete(f);
      return;
    }
    if (this.dirs.has(f)) {
      for (const d of [...this.dirs]) {
        if (d === f || d.startsWith(`${f}/`)) {
          this.dirs.delete(d);
          this.dirs.add(t + d.slice(f.length));
        }
      }
      for (const [k, v] of [...this.files]) {
        if (k.startsWith(`${f}/`)) {
          this.files.delete(k);
          this.files.set(t + k.slice(f.length), v);
        }
      }
      return;
    }
    throw new Error(`rename: ${from} is missing`);
  }

  async remove(path: string): Promise<void> {
    const p = norm(path);
    this.files.delete(p);
    for (const k of [...this.files.keys()]) if (k.startsWith(`${p}/`)) this.files.delete(k);
    for (const d of [...this.dirs]) if (d === p || d.startsWith(`${p}/`)) this.dirs.delete(d);
  }

  async exists(path: string): Promise<boolean> {
    const p = norm(path);
    return this.files.has(p) || this.dirs.has(p);
  }
}
