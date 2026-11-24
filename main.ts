// La Vega 3D — make.fun gta6-01 entry point (Node 22, standard library only).
// Round 3 (24 Nov 2026): HD detail pass — the dossier builder itself is
// unchanged; only this header note was added by the recorded round-3 session.
// Copies game/ and screenshots/ beside this file into the output directory
// (MAKEFUN_OUTPUT_DIR, or /output inside the grader) and writes
// /output/dossier.json with the vendored make.fun library, using the
// scorer's caps: text 160 KiB, at most 4 screenshots of 256 KiB each,
// game/ at most 993 files / 48 MiB, paths at most 1000 bytes.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts
//   node serve.ts   # then open http://localhost:8080
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Build summary (for the log): what was copied and how big the dossier is.
import { readdirSync, statSync } from 'node:fs';
const countFiles = (dir) => {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  }
  return n;
};
console.log(`[la-vega-3d] game/: ${countFiles(join(out, 'game'))} files, ${(statSync(join(out, 'game')).size || 0)} bytes (dir)`);
console.log(`[la-vega-3d] dossier: ${join(out, 'dossier.json')} written`);
