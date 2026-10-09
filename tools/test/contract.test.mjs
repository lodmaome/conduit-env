// node --test tools/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEADER_KEYS, buildSnapshot, normalise, operations, parseLockHashes, parseSnapshot, sortKeys } from '../lib/openapi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const contractDir = join(root, 'docs/env/contract');
const snapshotName = readdirSync(contractDir).find((f) => /^openapi\.[0-9a-f]{7}\.json$/.test(f));
const HASHES = 'backend-sha7: abc1234\nrequirements-lock-sha256: aa\nbuild-tools-lock-sha256: bb\n';

test('normalise: sorted keys, stable, idempotent, arrays keep order', () => {
  const a = normalise('{"openapi":"3.1.0","paths":{"/b":{},"/a":{}},"z":[3,1,2],"m":{"y":1,"x":2}}');
  const b = normalise('{"m":{"x":2,"y":1},"z":[3,1,2],"paths":{"/a":{},"/b":{}},"openapi":"3.1.0"}');
  assert.equal(a, b);
  assert.equal(normalise(a), a);
  assert.ok(a.endsWith('}\n') && !a.endsWith('\n\n'));
  assert.deepEqual(JSON.parse(a).z, [3, 1, 2]);
  assert.deepEqual(Object.keys(JSON.parse(a).m), ['x', 'y']);
  assert.deepEqual(Object.keys(sortKeys({ b: 1, a: { d: 1, c: 2 } })), ['a', 'b']);
});

test('normalise: refuses non-JSON and non-OpenAPI input', () => {
  assert.throws(() => normalise('<html>'), /not JSON/);
  assert.throws(() => normalise('{"a":1}'), /not an OpenAPI document/);
});

test('parseLockHashes: exactly the three lines in order', () => {
  assert.deepEqual(parseLockHashes(HASHES), { 'backend-sha7': 'abc1234', 'requirements-lock-sha256': 'aa', 'build-tools-lock-sha256': 'bb' });
  assert.throws(() => parseLockHashes('backend-sha7: x\n'), /exactly 3 lines/);
  assert.throws(() => parseLockHashes(HASHES.replace('requirements-lock-sha256', 'other')), /line 2 must be/);
});

test('buildSnapshot: valid JSON, normalised, header under x-conduit-env, deterministic, body unchanged', () => {
  const served = '{"paths":{"/a":{"get":{}}},"openapi":"3.1.0"}';
  const s = buildSnapshot(served, HASHES);
  assert.equal(s, buildSnapshot(served, HASHES));
  assert.ok(s.endsWith('}\n') && !s.endsWith('\n\n'));
  const { header, doc } = parseSnapshot(s);
  assert.deepEqual(header, { 'backend-sha7': 'abc1234', 'requirements-lock-sha256': 'aa', 'build-tools-lock-sha256': 'bb' });
  assert.deepEqual(doc, JSON.parse(served));
  assert.equal(s, `${JSON.stringify(sortKeys(JSON.parse(s)), null, 2)}\n`, 'the file is in normalised form');
  assert.throws(() => buildSnapshot('{"openapi":"3.1.0","paths":{},"x-conduit-env":{}}', HASHES), /already has a root key/);
});

test('parseSnapshot: each defect has a readable message', () => {
  const good = JSON.parse(buildSnapshot('{"openapi":"3.1.0","paths":{}}', HASHES));
  assert.throws(() => parseSnapshot('backend-sha7: x\n\n{}'), /not valid JSON/);
  assert.throws(() => parseSnapshot('[]'), /not a JSON object/);
  const { 'x-conduit-env': _h, ...none } = good;
  assert.throws(() => parseSnapshot(JSON.stringify(none)), /no root key x-conduit-env/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...good, 'x-conduit-env': 'x' })), /must be an object/);
  assert.throws(() => parseSnapshot(JSON.stringify({ ...good, 'x-conduit-env': { 'backend-sha7': 'a' } })), /must hold exactly the string keys/);
  assert.equal(parseSnapshot(JSON.stringify(good)).header['backend-sha7'], 'abc1234');
});

test('the committed snapshot is one valid JSON document with the three keys and the expected operations', () => {
  assert.ok(snapshotName, 'no docs/env/contract/openapi.<sha7>.json found');
  const text = readFileSync(join(contractDir, snapshotName), 'utf8');
  const { header, doc } = parseSnapshot(text);
  assert.deepEqual(Object.keys(header).sort(), [...HEADER_KEYS].sort());
  assert.equal(text, `${JSON.stringify(sortKeys(JSON.parse(text)), null, 2)}\n`, 'the snapshot is not in normalised form');
  const ops = operations(doc);
  assert.equal(ops.length, 25);
  assert.equal(ops.filter((o) => !o.split(' ')[1].startsWith('/auth/')).length, 19, 'the RealWorld operation count changed');
});

test('contract README lists exactly the /auth/ operations of the snapshot (fails when the spec changes)', () => {
  const { doc } = parseSnapshot(readFileSync(join(contractDir, snapshotName), 'utf8'));
  const auth = operations(doc).filter((o) => o.split(' ')[1].startsWith('/auth/'));
  assert.equal(auth.length, 6);
  const readme = readFileSync(join(contractDir, 'README.md'), 'utf8');
  const listed = [...readme.matchAll(/^\| `((?:GET|POST|PUT|DELETE|PATCH) \/auth\/[^`]*)` \|/gm)].map((m) => m[1]).sort();
  assert.deepEqual(listed, auth);
  // presence control: removing one operation from the document makes the comparison fail
  const copy = structuredClone(doc);
  delete copy.paths['/auth/logout/all/'];
  assert.notDeepEqual(operations(copy).filter((o) => o.split(' ')[1].startsWith('/auth/')), listed);
});
