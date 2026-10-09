// node --test tools/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalise, operations, sortKeys, splitSnapshot } from '../lib/openapi.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const contractDir = join(root, 'docs/env/contract');
const snapshotName = readdirSync(contractDir).find((f) => /^openapi\.[0-9a-f]{7}\.json$/.test(f));

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

test('splitSnapshot: needs the three header lines in order and a blank line', () => {
  const ok = 'backend-sha7: abc1234\nrequirements-lock-sha256: x\nbuild-tools-lock-sha256: y\n\n{}\n';
  assert.equal(splitSnapshot(ok).json, '{}\n');
  assert.throws(() => splitSnapshot(ok.replace('\n\n', '\nz\n')), /line 4 must be blank/);
  assert.throws(() => splitSnapshot(ok.replace('requirements-lock-sha256', 'build-tools-lock-sha256')), /header line 2/);
});

test('the committed snapshot parses, has a header and the expected operations', () => {
  assert.ok(snapshotName, 'no docs/env/contract/openapi.<sha7>.json found');
  const { header, json } = splitSnapshot(readFileSync(join(contractDir, snapshotName), 'utf8'));
  assert.equal(header.length, 3);
  assert.equal(normalise(json), json, 'the snapshot body is not in normalised form');
  const ops = operations(JSON.parse(json));
  assert.equal(ops.length, 25);
  assert.equal(ops.filter((o) => !o.split(' ')[1].startsWith('/auth/')).length, 19, 'the RealWorld operation count changed');
});

test('contract README lists exactly the /auth/ operations of the snapshot (fails when the spec changes)', () => {
  const { json } = splitSnapshot(readFileSync(join(contractDir, snapshotName), 'utf8'));
  const auth = operations(JSON.parse(json)).filter((o) => o.split(' ')[1].startsWith('/auth/'));
  assert.equal(auth.length, 6);
  const readme = readFileSync(join(contractDir, 'README.md'), 'utf8');
  const listed = [...readme.matchAll(/^\| `((?:GET|POST|PUT|DELETE|PATCH) \/auth\/[^`]*)` \|/gm)].map((m) => m[1]).sort();
  assert.deepEqual(listed, auth);
  // presence control: removing one operation from the document makes the comparison fail
  const doc = JSON.parse(json);
  delete doc.paths['/auth/logout/all/'];
  assert.notDeepEqual(operations(doc).filter((o) => o.split(' ')[1].startsWith('/auth/')), listed);
});
