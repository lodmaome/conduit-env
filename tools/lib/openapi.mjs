// Normalisation and parsing of the served OpenAPI document and of the committed snapshot. Pure functions, Node 22 stdlib only.

// Sorted keys at every level, 2-space indent, LF, one trailing newline. Arrays keep their order (it is meaningful in OpenAPI).
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

function parseOpenApi(jsonText) {
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
  if (!parsed || typeof parsed !== 'object' || !parsed.openapi || !parsed.paths) throw new Error('not an OpenAPI document (no "openapi" or "paths")');
  return parsed;
}

export function normalise(jsonText) {
  return `${JSON.stringify(sortKeys(parseOpenApi(jsonText)), null, 2)}\n`;
}

// The snapshot is ONE valid JSON document: the normalised served OpenAPI object plus the root key `x-conduit-env`, which holds the three
// values `sh tools/lock-hashes.sh` prints, under exactly those names.
export const SNAPSHOT_KEY = 'x-conduit-env';
export const HEADER_KEYS = ['backend-sha7', 'requirements-lock-sha256', 'build-tools-lock-sha256'];

// "backend-sha7: abc1234\nrequirements-lock-sha256: ...\nbuild-tools-lock-sha256: ...\n" -> { 'backend-sha7': 'abc1234', ... }
export function parseLockHashes(text) {
  const ls = String(text).split('\n').filter(Boolean);
  if (ls.length !== 3) throw new Error(`lock-hashes output must have exactly 3 lines, has ${ls.length}`);
  const out = {};
  ls.forEach((l, i) => {
    const m = /^([a-z0-9-]+): (\S+)$/.exec(l);
    if (!m || m[1] !== HEADER_KEYS[i]) throw new Error(`lock-hashes line ${i + 1} must be "${HEADER_KEYS[i]}: <value>", got "${l}"`);
    out[m[1]] = m[2];
  });
  return out;
}

export function buildSnapshot(openapiText, lockHashesText) {
  const doc = parseOpenApi(openapiText);
  if (SNAPSHOT_KEY in doc) throw new Error(`the served document already has a root key ${SNAPSHOT_KEY}`);
  return `${JSON.stringify(sortKeys({ ...doc, [SNAPSHOT_KEY]: parseLockHashes(lockHashesText) }), null, 2)}\n`;
}

// -> { header: {three values}, doc: the OpenAPI object without the header key }. Throws readable errors.
export function parseSnapshot(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error(`the snapshot is not valid JSON: ${e.message}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('the snapshot is not a JSON object');
  const header = parsed[SNAPSHOT_KEY];
  if (header === undefined) throw new Error(`the snapshot has no root key ${SNAPSHOT_KEY}`);
  if (!header || typeof header !== 'object' || Array.isArray(header)) throw new Error(`${SNAPSHOT_KEY} must be an object`);
  const keys = Object.keys(header).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...HEADER_KEYS].sort()) || keys.some((k) => typeof header[k] !== 'string')) {
    throw new Error(`${SNAPSHOT_KEY} must hold exactly the string keys ${HEADER_KEYS.join(', ')}; it has ${keys.join(', ') || 'none'}`);
  }
  const { [SNAPSHOT_KEY]: _omit, ...doc } = parsed;
  return { header, doc };
}

export function operations(doc) {
  const ops = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of Object.keys(item)) ops.push(`${method.toUpperCase()} ${path}`);
  }
  return ops.sort();
}
