// Pin drift report. Read-only: it NEVER edits a pin. Node 22 stdlib only.
//   node tools/pin-drift.mjs [--summary <file>]
// For each upstream repository pin it compares the pinned SHA with the remote default branch head (`git ls-remote`), for each image pin the
// pinned digest with what the tag resolves to now (`docker buildx imagetools inspect`), for env/pins.env and env/gate/tools.env alike.
// Prints a Markdown table (and appends it to --summary, the job summary in Actions). Exit status = number of drifted or unreadable pins.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, compare, exitCode, parseEnv, parseImagetoolsDigest, parseLsRemoteHead, toMarkdown } from './lib/pin-drift-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(root, 'compose.yaml')) || !existsSync(resolve(root, 'env/pins.env'))) { console.error(`refusing: ${root} is not the conduit-env repository root`); process.exit(90); }
const i = process.argv.indexOf('--summary');
const summaryFile = i >= 0 ? process.argv[i + 1] : '';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed: ${(r.stderr || r.stdout || String(r.error)).split('\n')[0]}`);
  return r.stdout;
};
const pins = { ...parseEnv(readFileSync(resolve(root, 'env/pins.env'), 'utf8')), ...parseEnv(readFileSync(resolve(root, 'env/gate/tools.env'), 'utf8')) };
const rows = await compare(classify(pins), {
  head: async (repo) => parseLsRemoteHead(run('git', ['ls-remote', repo, 'HEAD'])),
  digest: async (ref) => parseImagetoolsDigest(run('docker', ['buildx', 'imagetools', 'inspect', ref])),
});
const md = toMarkdown(rows);
process.stdout.write(md);
if (summaryFile) appendFileSync(summaryFile, `## Pin drift\n\n${md}`);
process.exit(exitCode(rows));
