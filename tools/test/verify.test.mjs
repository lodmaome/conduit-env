// node --test tools/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MEASURED_COMPOSE, MIN_COMPOSE, compareArticle, compareVersions, evaluateMigrations, evaluatePreflight, makeRunData, parseVersion, redact, summarize } from '../lib/verify-lib.mjs';
import { checkApiFlow, checkFrontend, checkMigrations, checkTags } from '../lib/verify-checks.mjs';
import { FAULTS, startFake } from './fake-conduit.mjs';

const stubRand = (n) => Buffer.alloc(n, 7);
const goodPre = { nodeVersion: '22.1.0', engine: { ok: true, version: '29.8.2' }, compose: { version: 'v5.5.1' }, ports: { 4180: 'listening', 4181: 'listening', 4182: 'listening' }, fresh: false, shAvailable: true };
const levels = (p) => p.map((x) => x.level);

test('versions: parse and compare', () => {
  assert.deepEqual(parseVersion('v5.5.1'), [5, 5, 1]);
  assert.deepEqual(parseVersion('2.20.0-desktop.1'), [2, 20, 0]);
  assert.equal(parseVersion('garbage'), null);
  assert.equal(compareVersions([2, 20, 0], [2, 9, 9]), 1);
  assert.equal(compareVersions([2, 19, 9], [2, 20, 0]), -1);
});

test('preflight: control passes, each problem is a readable error', () => {
  assert.equal(levels(evaluatePreflight(goodPre)).includes('error'), false);
  const bad = (patch, re) => {
    const p = evaluatePreflight({ ...goodPre, ...patch });
    assert.ok(p.some((x) => x.level === 'error' && re.test(x.text)), JSON.stringify(p));
  };
  bad({ nodeVersion: '20.11.0' }, /too old.*Node 22/);
  bad({ engine: { ok: false, error: 'pipe missing' } }, /not reachable.*never starts or stops Docker/);
  bad({ compose: { version: null, error: 'x' } }, /could not read the Docker Compose version/);
  bad({ compose: { version: '2.19.9' } }, /older than 2\.20\.0/);
  bad({ ports: { 4180: 'listening', 4181: 'nothing listening', 4182: 'listening' } }, /port 4181.*nothing listening.*--fresh/);
  bad({ fresh: true, shAvailable: false }, /`sh` is not on the PATH/);
});

test('preflight: untested but accepted Compose version is a note, not an error; --fresh does not need listening ports', () => {
  const p = evaluatePreflight({ ...goodPre, compose: { version: '2.40.1' } });
  assert.ok(p.some((x) => x.level === 'info' && /untested/.test(x.text)));
  assert.equal(levels(p).includes('error'), false);
  const f = evaluatePreflight({ ...goodPre, fresh: true, ports: { 4180: 'nothing listening', 4181: 'nothing listening', 4182: 'nothing listening' } });
  assert.equal(levels(f).includes('error'), false);
  assert.ok(MIN_COMPOSE && MEASURED_COMPOSE);
});

test('run data: unique per run, valid email domain, secrets redacted', () => {
  let n = 0;
  const a = makeRunData(stubRand);
  const b = makeRunData((k) => Buffer.alloc(k, ++n));
  assert.notEqual(a.username, b.username);
  assert.match(a.email, /@example\.com$/);
  const out = redact(`pw ${a.password} jwt eyJhbGciOi.eyJ0eXBlIjoi.abc tok SECRET2`, [a.password, 'SECRET2']);
  assert.equal(/eyJ|SECRET2/.test(out) || out.includes(a.password), false);
  assert.match(redact('plain text', ['zzz-not-present']), /plain text/); // control: nothing else is touched
});

test('compareArticle: control equal, each field mismatch is reported', () => {
  const sent = { title: 't', description: 'd', body: 'b', tagList: ['a', 'b'] };
  const got = { ...sent, tagList: ['b', 'a'], slug: 's', favorited: false, favoritesCount: 0, createdAt: '2026-01-01T00:00:00.000Z' };
  assert.deepEqual(compareArticle(sent, got), []);
  for (const [patch, re] of [[{ title: 'x' }, /title/], [{ body: 'x' }, /body/], [{ tagList: ['a'] }, /tagList/], [{ slug: '' }, /slug/], [{ favorited: true }, /favorited/], [{ favoritesCount: 1 }, /favoritesCount/], [{ createdAt: 'no' }, /createdAt/]]) {
    assert.match(compareArticle(sent, { ...got, ...patch }).join(';'), re);
  }
  assert.match(compareArticle(sent, undefined).join(';'), /no article/);
});

test('evaluateMigrations: control passes; model without migration, odd output, crash and missing docker fail', async () => {
  assert.equal(evaluateMigrations({ code: 0, stdout: 'No changes detected\n' }).ok, true);
  assert.match(evaluateMigrations({ code: 1, stdout: "Migrations for 'articles':\n  + Add field" }).text, /a model has no migration/);
  assert.match(evaluateMigrations({ code: 0, stdout: 'something else' }).text, /does not say/);
  assert.match(evaluateMigrations({ code: 2, stderr: 'Traceback' }).text, /could not run \(exit 2\)/);
  const ok = await checkMigrations({ runDocker: async () => ({ code: 0, stdout: 'No changes detected' }) });
  assert.equal(ok.ok, true);
  const bad = await checkMigrations({ runDocker: async (a) => { assert.ok(a.includes('-f') && a.includes('compose.yaml') && a.includes('-p') && a.includes('conduit-env')); return { code: 1, stdout: 'Migrations for' }; } });
  assert.equal(bad.ok, false);
  const gone = await checkMigrations({ runDocker: async () => { throw new Error('spawn docker ENOENT'); } });
  assert.match(gone.text, /could not run docker compose exec: spawn docker ENOENT/);
});

test('summarize: exit status counts failures, lines carry no timestamps', () => {
  const s = summarize([{ name: 'a', ok: true, text: 'x' }, { name: 'b', ok: false, text: 'y' }, { name: 'c', ok: false, text: 'z' }]);
  assert.equal(s.failed, 2);
  assert.deepEqual(s.lines, ['PASS  a: x', 'FAIL  b: y', 'FAIL  c: z', 'failed checks: 2']);
});

// ---- the HTTP checks against the fake: one healthy control, then one fixture per fault ----
async function runAll(fault) {
  const fake = await startFake(fault);
  try {
    const base = { apiBase: `${fake.base}/api`, frontendBase: fake.base, fetchFn: fetch };
    const data = makeRunData(stubRand);
    const secrets = [];
    const results = [await checkTags(base), await checkApiFlow(base, data, secrets), await checkFrontend(base)];
    return { results, secrets, data };
  } finally { await fake.close(); }
}

test('http checks: the healthy fake passes all three (control)', async () => {
  const { results } = await runAll('none');
  assert.deepEqual(results.map((r) => r.ok), [true, true, true], JSON.stringify(results));
});

const EXPECT = {
  'tags-500': ['tags', /-> 500/], 'tags-no-array': ['tags', /no "tags" array/],
  'register-422': ['api-flow', /step register: expected 201, got 422/], 'login-401': ['api-flow', /step login: expected 200, got 401/],
  'login-no-token': ['api-flow', /step login: the response has no user\.token/], 'me-wrong-user': ['api-flow', /step current-user/],
  'create-500': ['api-flow', /step create-article: expected 201, got 500/], 'create-alters-body': ['api-flow', /step create-article:.*body/],
  'create-alters-tags': ['api-flow', /step create-article:.*tagList/], 'readback-404': ['api-flow', /step read-back: expected 200, got 404/],
  'readback-differs': ['api-flow', /step read-back:/], 'frontend-500': ['frontend', /-> 500/], 'frontend-not-app': ['frontend', /not the app page/],
};
for (const fault of FAULTS.filter((f) => EXPECT[f])) {
  test(`http checks: fixture ${fault} fails exactly the named check`, async () => {
    const [name, re] = EXPECT[fault];
    const { results } = await runAll(fault);
    const failing = results.filter((r) => !r.ok);
    assert.deepEqual(failing.map((r) => r.name), [name], JSON.stringify(results));
    assert.match(failing[0].text, re);
  });
}

test('http checks: an unreachable server is a readable failure, not a stack trace', async () => {
  const fake = await startFake('none');
  const base = { apiBase: `${fake.base}/api`, frontendBase: fake.base, fetchFn: fetch };
  await fake.close();
  const r = await checkTags(base);
  assert.equal(r.ok, false);
  assert.match(r.text, /GET http:\/\/127\.0\.0\.1:\d+\/api\/tags: /);
});

test('secrets never reach the printed lines (control: without the secrets list they would)', async () => {
  const { secrets, data } = await runAll('none');
  assert.ok(secrets.includes(data.password) && secrets.length === 2, 'the flow records the password and the token');
  const leaky = [{ name: 'api-flow', ok: false, text: `server said: pw=${data.password} auth=Token ${secrets[1]}` }];
  const printed = summarize(leaky, secrets).lines.join(' ');
  assert.equal(printed.includes(data.password) || printed.includes(secrets[1]), false);
  const unredacted = summarize(leaky, []).lines.join(' ');
  assert.ok(unredacted.includes(data.password) && unredacted.includes(secrets[1]));
});
