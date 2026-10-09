// node --test tools/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPECTED_API_ORIGIN, OLD_ORIGIN, PROFILE_PREFIX, evaluateRequests, parseDevToolsActivePort, profileDirProblem } from '../lib/browser-lib.mjs';
import { evaluatePreflight } from '../lib/verify-lib.mjs';

const apiReq = (url, type = 'Fetch') => ({ url, type });
const good = [apiReq(`${EXPECTED_API_ORIGIN}/api/articles?limit=10`), apiReq(`${EXPECTED_API_ORIGIN}/api/tags`, 'XHR'), { url: 'http://localhost:4180/assets/x.js', type: 'Script' }];
const run = (over) => evaluateRequests({ requests: good, failures: [], expectedOrigin: EXPECTED_API_ORIGIN, titleSeen: true, title: 'T', ...over });
const verdict = (r) => Object.fromEntries(r.assertions.map((a) => [a.name, a.ok]));

test('control: right origin, no old origin, title seen -> all pass', () => {
  assert.deepEqual(verdict(run({})), { 'api-origin': true, 'no-old-origin': true, 'api-content': true });
});

test('mutation 1: a wrong expected origin fails and names expected and observed', () => {
  const r = run({ expectedOrigin: 'http://localhost:9999' });
  assert.equal(verdict(r)['api-origin'], false);
  assert.match(r.assertions[0].text, /expected API origin http:\/\/localhost:9999, observed http:\/\/localhost:4181 \(2 Fetch\/XHR requests\)/);
});

test('mutation 2: failed API requests fail api-content readably, not as a timeout', () => {
  const r = run({ titleSeen: false, failures: [{ url: `${EXPECTED_API_ORIGIN}/api/tags`, type: 'Fetch', errorText: 'blocked by the DevTools client, reason inspector' }] });
  const c = r.assertions.find((a) => a.name === 'api-content');
  assert.equal(c.ok, false);
  assert.match(c.text, /1 API request\(s\) failed \(blocked by the DevTools client.*\) and the page did not render the article "T"/);
  assert.equal(/timeout|timed out/i.test(c.text), false);
});

test('title missing without any failed request is its own message', () => {
  const c = run({ titleSeen: false }).assertions.find((a) => a.name === 'api-content');
  assert.equal(c.ok, false);
  assert.match(c.text, /although no API request failed/);
});

test('a Fetch or XHR to the old origin fails no-old-origin and also api-origin (mixed origins)', () => {
  const r = run({ requests: [...good, apiReq(`${OLD_ORIGIN}/api/articles`)] });
  assert.equal(verdict(r)['no-old-origin'], false);
  assert.equal(verdict(r)['api-origin'], false);
  assert.match(r.assertions[1].text, /1 Fetch\/XHR request\(s\) went to https:\/\/api\.realworld\.show/);
});

test('non-Fetch/XHR requests to the old origin are informational, not failures', () => {
  const r = run({ requests: [...good, { url: `${OLD_ORIGIN}/avatar.png`, type: 'Image' }] });
  assert.equal(verdict(r)['no-old-origin'], true);
  assert.match(r.info.join('\n'), /1 non-Fetch\/XHR request\(s\) to https:\/\/api\.realworld\.show: Image /);
});

test('presence control: with no Fetch/XHR at all the old-origin assertion refuses to pass', () => {
  const r = run({ requests: [{ url: 'http://localhost:4180/', type: 'Document' }] });
  assert.equal(verdict(r)['api-origin'], false);
  assert.equal(verdict(r)['no-old-origin'], false);
  assert.match(r.assertions[1].text, /cannot say/);
});

test('profile directory safety: only temp dir + prefix + our marker', () => {
  const ok = join(tmpdir(), `${PROFILE_PREFIX}abc`);
  assert.equal(profileDirProblem(ok, tmpdir(), 'tok', 'tok'), null);
  assert.match(profileDirProblem(join(tmpdir(), `${PROFILE_PREFIX}abc`), tmpdir(), 'other', 'tok'), /no marker file/);
  assert.match(profileDirProblem(join(tmpdir(), 'something-else'), tmpdir(), 'tok', 'tok'), /prefix/);
  assert.match(profileDirProblem(join(tmpdir(), '..', `${PROFILE_PREFIX}abc`), tmpdir(), 'tok', 'tok'), /not under the temp directory/);
  assert.match(profileDirProblem(tmpdir(), tmpdir(), 'tok', 'tok'), /not under the temp directory/);
});

test('DevToolsActivePort parsing', () => {
  assert.deepEqual(parseDevToolsActivePort('51234\n/devtools/browser/abc-def\n'), { port: 51234, path: '/devtools/browser/abc-def' });
  assert.equal(parseDevToolsActivePort('x\n/devtools/browser/a'), null);
  assert.equal(parseDevToolsActivePort('1234\n/other'), null);
  assert.equal(parseDevToolsActivePort(''), null);
});

test('preflight: browser needs CHROME_BIN unless --no-browser; skipping is visible', () => {
  const base = { nodeVersion: '22.1.0', engine: { ok: true, version: '1' }, compose: { version: '5.5.1' }, ports: { 4180: 'listening', 4181: 'listening', 4182: 'listening' }, fresh: false, shAvailable: true };
  assert.ok(evaluatePreflight({ ...base, browser: { skip: false, chromeBin: undefined } }).some((p) => p.level === 'error' && /CHROME_BIN is not set.*--no-browser/.test(p.text)));
  assert.ok(evaluatePreflight({ ...base, browser: { skip: false, chromeBin: 'x', exists: false } }).some((p) => p.level === 'error' && /does not exist/.test(p.text)));
  assert.ok(!evaluatePreflight({ ...base, browser: { skip: false, chromeBin: 'x', exists: true } }).some((p) => p.level === 'error'));
  const skipped = evaluatePreflight({ ...base, browser: { skip: true } });
  assert.ok(skipped.some((p) => p.level === 'info' && /skipped on request/.test(p.text)) && !skipped.some((p) => p.level === 'error'));
});

test('externalHosts: sorted, unique, own origins and non-http schemes left out; a third host is listed', async () => {
  const { externalHosts } = await import('../lib/browser-lib.mjs');
  const reqs = [
    { url: 'http://localhost:4180/', type: 'Document' }, { url: 'http://localhost:4181/api/tags', type: 'Fetch' }, { url: 'http://127.0.0.1:4182/x', type: 'Other' },
    { url: '//code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css', type: 'Stylesheet' }, // not absolute: skipped, the browser reports absolute URLs
    { url: 'https://code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css', type: 'Stylesheet' },
    { url: 'https://fonts.googleapis.com/css?family=Lora', type: 'Stylesheet' }, { url: 'https://fonts.googleapis.com/css?family=Source', type: 'Stylesheet' },
    { url: 'https://third.example/x.js', type: 'Script' }, { url: 'data:image/png;base64,AAAA', type: 'Image' }, { url: 'about:blank', type: 'Document' },
    { url: 'http://localhost:9999/other-port', type: 'Fetch' },
  ];
  assert.deepEqual(externalHosts(reqs), ['code.ionicframework.com', 'fonts.googleapis.com', 'localhost', 'third.example']);
  // control: only own origins -> none
  assert.deepEqual(externalHosts(reqs.slice(0, 3)), []);
});
