// Node-only. Minimal .env loader (no dependency): KEY=VALUE lines, # comments, ignores
// surrounding quotes. Shared by the CLI and the dev-server upload endpoint.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export async function loadEnv(): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(repoRoot, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    if (line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
