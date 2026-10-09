// Fetches the served OpenAPI document twice, requires the two raw bodies to be byte-identical, and prints the snapshot: the normalised document
// plus the root key `x-conduit-env` with the three values of tools/lock-hashes.sh.
// usage: node tools/openapi-snapshot.mjs <file with the output of tools/lock-hashes.sh> [url]
//   default url http://127.0.0.1:4181/openapi.json (the backend serves it at the root, not under /api: measured)
import { readFileSync } from 'node:fs';
import { buildSnapshot } from './lib/openapi.mjs';

const hashesFile = process.argv[2];
const url = process.argv[3] ?? 'http://127.0.0.1:4181/openapi.json';
async function get() {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status !== 200) throw new Error(`GET ${url} -> ${res.status}, expected 200`);
  return res.text();
}
try {
  if (!hashesFile) throw new Error('usage: node tools/openapi-snapshot.mjs <lock-hashes output file> [url]');
  const hashes = readFileSync(hashesFile, 'utf8');
  const a = await get();
  const b = await get();
  if (a !== b) throw new Error('two fetches of the same document differ byte for byte; the snapshot would not be deterministic');
  process.stdout.write(buildSnapshot(a, hashes));
} catch (e) {
  console.error(`openapi-snapshot: ${e?.cause?.code ?? e.message}`);
  process.exit(1);
}
