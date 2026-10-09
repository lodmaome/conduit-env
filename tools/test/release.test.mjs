// node --test tools/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, findSecrets, globToRegExp, ownedMatcher, parseEnvFile } from '../lib/release-checks.mjs';
import { goldenTree } from '../lib/golden-tree.mjs';
import { gitOps, treeCtx } from '../lib/release-ctx.mjs';

test('globs: * stays in a segment, ** crosses segments', () => {
  assert.ok(globToRegExp('env/**').test('env/a/b/c.txt'));
  assert.ok(!globToRegExp('env/*').test('env/a/b.txt'));
  assert.ok(globToRegExp('.github/workflows/env-*.yml').test('.github/workflows/env-verify.yml'));
  assert.ok(!globToRegExp('.github/workflows/env-*.yml').test('.github/workflows/mine.yml'));
  assert.ok(!globToRegExp('compose.yaml').test('composeXyaml'), 'a dot is a dot');
});

test('ownedMatcher: owned, seed and attempt territory', () => {
  const m = ownedMatcher('# c\ncompose.yaml\nenv/**\n', 'README.md\n');
  assert.ok(m('compose.yaml') && m('env/a/b') && m('README.md'));
  assert.ok(!m('package.json') && !m('src/env/x'));
});

test('parseEnvFile reads KEY=value lines only', () => {
  assert.deepEqual(parseEnvFile('# c\nA=1\n\nB=x=y\nlower=no\n'), { A: '1', B: 'x=y' });
});

test('findSecrets: flags JWTs, assignments and URL credentials; the documented local password 0000 is exempt by value, any other value is not', () => {
  assert.equal(findSecrets('a', 'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk').length, 1);
  assert.equal(findSecrets('a', 'api_key = abcdef1234567890').length, 1);
  assert.equal(findSecrets('a', 'x: postgresql://u:p4ss@h/db').length, 1);
  assert.equal(findSecrets('a', 'password: rand(18).toString("x")').length, 0, 'code is not a literal credential');
  assert.equal(findSecrets('env/stack.yaml', 'POSTGRES_PASSWORD: "0000"').length, 0);
  assert.equal(findSecrets('docs/x.md', 'POSTGRES_PASSWORD=0000').length, 0, 'the documented value is exempt anywhere');
  assert.equal(findSecrets('env/stack.yaml', 'POSTGRES_PASSWORD: "hunter2x"').length, 1, 'a different value is not');
  assert.equal(findSecrets('a', 'x: postgresql://postgres:0000@db/x').length, 0);
  assert.equal(findSecrets('a', '// keep a secret: replaces every given secret').length, 0, 'prose with a colon is not a credential');
});

// every check against the golden tree (control) and its fixture, in memory. The two checks that need Docker run in the CLI self-test.
for (const c of CHECKS) {
  test(`check ${c.num} ${c.id}: golden control passes, fixture fails as intended`, async () => {
    const controlTag = c.needsTag ? 'env-v1' : null;
    const control = await c.run(treeCtx(goldenTree(), { tag: controlTag }));
    assert.equal(control.ok, true, `control failed: ${control.text}`);
    if (c.fixture.gitFixture) return; // needs a temp git repository: covered by `node tools/release-gate.mjs --self-test`
    const tree = goldenTree();
    c.fixture.mutate(tree);
    const res = await c.run(treeCtx(tree, { tag: c.fixture.tag ?? controlTag, ...(c.fixture.ports ? { ports: c.fixture.ports } : {}), ...(c.fixture.links ? { links: c.fixture.links } : {}) }));
    assert.equal(res.ok, false, `fixture passed: ${res.text}`);
    assert.match(res.text, c.fixture.expect);
  });
}

test('seeds-unchanged: at env-v1 it is a visible skip, and without a tag env-v1 it fails', async () => {
  const c = CHECKS.find((x) => x.id === 'seeds-unchanged');
  const first = await c.run(treeCtx(goldenTree(), { tag: 'env-v1' }));
  assert.equal(first.skipped, true);
  assert.match(first.text, /first release: skipped/);
  const later = await c.run(treeCtx(goldenTree(), { tag: 'env-v2', git: { tagExists: async () => false } }));
  assert.equal(later.ok, false);
  assert.match(later.text, /tag env-v1 does not exist/);
  const same = await c.run(treeCtx(goldenTree(), { tag: 'env-v2', git: { tagExists: async () => true, seedsChangedSince: async () => [] } }));
  assert.equal(same.ok, true);
});

test('gitOps against this very repository: a tag that does not exist is reported as missing', async () => {
  assert.equal(await gitOps(process.cwd()).tagExists('env-v999-does-not-exist'), false);
});

test('presence control of the secret scan: a tree without the documented local password lines makes the check refuse to pass', async () => {
  const c = CHECKS.find((x) => x.id === 'secrets');
  const t = goldenTree();
  t.set('env/stack.yaml', 'services: {}\n');
  const r = await c.run(treeCtx(t));
  assert.equal(r.ok, false);
  assert.match(r.text, /presence control failed/);
});
