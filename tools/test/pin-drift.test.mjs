// node --test tools/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, compare, exitCode, parseEnv, parseImagetoolsDigest, parseLsRemoteHead, toMarkdown } from '../lib/pin-drift-lib.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const D1 = `sha256:${'1'.repeat(64)}`;
const D2 = `sha256:${'2'.repeat(64)}`;
const PINS = parseEnv(`# c\nBACKEND_REPO=https://github.com/o/backend.git\nBACKEND_SHA=${A}\nFRONTEND_REALWORLD_SHA=${B}\nPYTHON_IMAGE=python:3.12@${D1}\nBROKEN_IMAGE=nodigest:1\n`);

test('parsers read the output of the two commands', () => {
  assert.equal(parseLsRemoteHead(`${A}\tHEAD\n`), A);
  assert.equal(parseLsRemoteHead('nothing'), null);
  assert.equal(parseImagetoolsDigest(`Name:      docker.io/x:1\nMediaType: m\nDigest:    ${D1}\n\nManifests:\n  Digest: ${D2}\n`), D1);
  assert.equal(parseImagetoolsDigest('Name: x'), null);
});

test('classify: repo pairs, derived SHA, images, invalid image, deterministic order', () => {
  const items = classify(PINS);
  assert.deepEqual(items.map((x) => `${x.kind}:${x.name}`), ['repo:BACKEND', 'invalid:BROKEN_IMAGE', 'derived:FRONTEND_REALWORLD_SHA', 'image:PYTHON']);
});

const same = { head: async () => A, digest: async () => D1 };

test('control: nothing changed upstream -> no drift, exit 0, "No drift"', async () => {
  const rows = await compare(classify({ ...PINS, BROKEN_IMAGE: `x:1@${D1}` }), same);
  assert.equal(exitCode(rows), 0);
  assert.match(toMarkdown(rows), /No drift/);
  assert.deepEqual(rows.map((r) => r.status), ['ok', 'ok', 'SKIP', 'ok']);
});

test('failing fixture: an outdated repository pin and an outdated image pin are DRIFT and make the exit status non-zero', async () => {
  const rows = await compare(classify({ ...PINS, BROKEN_IMAGE: `x:1@${D1}` }), { head: async () => B, digest: async (ref) => (ref.startsWith('python') ? D2 : D1) });
  assert.equal(exitCode(rows), 2);
  const md = toMarkdown(rows);
  assert.match(md, /\| `BACKEND` .* DRIFT \|/);
  assert.match(md, /\| `PYTHON` .* DRIFT \|/);
  assert.match(md, /2 pin\(s\) drifted/);
});

test('an unreadable remote is an ERROR row, not a silent pass; an invalid pin is an ERROR', async () => {
  const rows = await compare(classify(PINS), { head: async () => { throw new Error('network down'); }, digest: async () => D1 });
  assert.equal(rows.find((r) => r.name === 'BACKEND').status, 'ERROR');
  assert.match(rows.find((r) => r.name === 'BACKEND').note, /network down/);
  assert.equal(rows.find((r) => r.name === 'BROKEN_IMAGE').status, 'ERROR');
  assert.equal(exitCode(rows), 2);
});
