// CLI: `npm run process -- <audio-file> [--only <id>] [--id <note-id>]`
// Runs the processing pipeline over one recording and writes its artifacts into
// app/public/notes/<id>/ so the lab app can read them as static assets.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ArtifactKind } from "../core/types.js";
import { loadEnv } from "../env.js";
import { initNote, makeNoteId, writeNotesIndex } from "../core/store.js";
import { runPipeline } from "../processors/runner.js";

interface Args {
  audioFile: string;
  only?: ArtifactKind;
  id?: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let only: ArtifactKind | undefined;
  let id: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") only = argv[++i] as ArtifactKind;
    else if (argv[i] === "--id") id = argv[++i];
    else positional.push(argv[i]);
  }
  if (!positional[0]) {
    throw new Error(
      "Usage: npm run process -- <audio-file> [--only <id>] [--id <note-id>]",
    );
  }
  return { audioFile: positional[0], only, id };
}

async function main() {
  await loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const audioPath = path.resolve(args.audioFile);
  await fs.access(audioPath); // fail fast if the file is missing

  const id = args.id ?? makeNoteId(audioPath);
  console.log(`note: ${id}\naudio: ${audioPath}\n`);

  await initNote(audioPath, id);
  const result = await runPipeline(id, { only: args.only });
  await writeNotesIndex();

  console.log(
    `\ndone. ran=[${result.ran.join(", ")}] skipped=[${result.skipped.join(", ")}]` +
      (result.failed.length ? ` failed=[${result.failed.map((f) => f.kind).join(", ")}]` : ""),
  );
  console.log(`\nView it: npm run dev  →  open the app and pick "${id}".`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
