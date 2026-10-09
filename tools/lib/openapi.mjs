// Normalisation and parsing of the served OpenAPI document. Pure functions, Node 22 stdlib only.

// Sorted keys at every level, 2-space indent, LF, one trailing newline. Arrays keep their order (it is meaningful in OpenAPI).
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

export function normalise(jsonText) {
  let parsed;
  try { parsed = JSON.parse(jsonText); } catch (e) { throw new Error(`not JSON: ${e.message}`); }
  if (!parsed || typeof parsed !== 'object' || !parsed.openapi || !parsed.paths) throw new Error('not an OpenAPI document (no "openapi" or "paths")');
  return `${JSON.stringify(sortKeys(parsed), null, 2)}\n`;
}

// A snapshot file is the three header lines of tools/lock-hashes.sh, one blank line, then the normalised JSON.
export const HEADER_KEYS = ['backend-sha7', 'requirements-lock-sha256', 'build-tools-lock-sha256'];

export function splitSnapshot(text) {
  const lines = text.split('\n');
  const header = lines.slice(0, 3);
  if (lines[3] !== '') throw new Error('snapshot: line 4 must be blank (after the three header lines)');
  header.forEach((l, i) => { if (!l.startsWith(`${HEADER_KEYS[i]}: `)) throw new Error(`snapshot: header line ${i + 1} must start with "${HEADER_KEYS[i]}: "`); });
  return { header, json: lines.slice(4).join('\n') };
}

export function operations(doc) {
  const ops = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of Object.keys(item)) ops.push(`${method.toUpperCase()} ${path}`);
  }
  return ops.sort();
}
