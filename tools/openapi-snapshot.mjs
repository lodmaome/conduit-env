// Fetches the served OpenAPI document twice, requires the two raw bodies to be byte-identical, and prints the normalised document.
// usage: node tools/openapi-snapshot.mjs [url]     default http://127.0.0.1:4181/openapi.json (the backend serves it at the root, not under /api: measured)
import { normalise } from './lib/openapi.mjs';

const url = process.argv[2] ?? 'http://127.0.0.1:4181/openapi.json';
async function get() {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (res.status !== 200) throw new Error(`GET ${url} -> ${res.status}, expected 200`);
  return res.text();
}
try {
  const a = await get();
  const b = await get();
  if (a !== b) throw new Error('two fetches of the same document differ byte for byte; the snapshot would not be deterministic');
  process.stdout.write(normalise(a));
} catch (e) {
  console.error(`openapi-snapshot: ${e?.cause?.code ?? e.message}`);
  process.exit(1);
}
