// node --test tools/test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    for (const fx of c.fixtures) {
      if (fx.gitFixture) continue; // needs a temp git repository: covered by `node tools/release-gate.mjs --self-test`
      const tree = goldenTree();
      fx.mutate(tree);
      const res = await c.run(treeCtx(tree, { tag: fx.tag ?? controlTag, ...(fx.ports ? { ports: fx.ports } : {}), ...(fx.links ? { links: fx.links } : {}), ...(fx.historyInput ? { historyInput: fx.historyInput } : {}) }));
      assert.equal(res.ok, false, `fixture ${fx.name ?? ''} passed: ${res.text}`);
      assert.match(res.text, fx.expect);
    }
  });
}

test('seeds-unchanged: env-v1 without its tag is a visible skip, with its tag it compares; env-v2 without the tag env-v1 fails', async () => {
  const c = CHECKS.find((x) => x.id === 'seeds-unchanged');
  const first = await c.run(treeCtx(goldenTree(), { tag: 'env-v1', git: { tagExists: async () => false } }));
  assert.equal(first.skipped, true);
  assert.match(first.text, /first release: skipped/);
  const tagged = await c.run(treeCtx(goldenTree(), { tag: 'env-v1', git: { tagExists: async () => true, seedsChangedSince: async () => [] } }));
  assert.equal(tagged.ok, true);
  assert.equal(tagged.skipped, undefined, 'with the tag present it is a real pass, not a skip');
  assert.match(tagged.text, /3 seed files compared against the tag env-v1: identical/);
  const changed = await c.run(treeCtx(goldenTree(), { tag: 'env-v1', git: { tagExists: async () => true, seedsChangedSince: async () => ['README.md'] } }));
  assert.equal(changed.ok, false);
  assert.match(changed.text, /seed file changed since env-v1: README\.md/);
  const later = await c.run(treeCtx(goldenTree(), { tag: 'env-v2', git: { tagExists: async () => false } }));
  assert.equal(later.ok, false);
  assert.match(later.text, /tag env-v1 does not exist/);
  const same = await c.run(treeCtx(goldenTree(), { tag: 'env-v2', git: { tagExists: async () => true, seedsChangedSince: async () => [] } }));
  assert.equal(same.ok, true);
});

test('gitOps.seedsChangedSince on a real temporary repository: equal, changed, removed and never-existing paths', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'conduit-env-seedtest-'));
  try {
    const g = (...a) => { const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
    g('init', '-q'); writeFileSync(join(dir, 'a.txt'), 'a\n'); writeFileSync(join(dir, 'b.txt'), 'b\n');
    g('add', '.'); g('commit', '-q', '-m', 'one'); g('tag', '-a', 'env-v1', '-m', 'env-v1');
    const ops = gitOps(dir);
    assert.deepEqual(await ops.seedsChangedSince('env-v1', ['a.txt', 'b.txt']), []);
    writeFileSync(join(dir, 'a.txt'), 'changed\n'); g('commit', '-q', '-am', 'two');
    g('rm', '-q', 'b.txt'); g('commit', '-q', '-m', 'three');
    assert.deepEqual(await ops.seedsChangedSince('env-v1', ['a.txt', 'b.txt']), ['a.txt', 'b.txt']);
    assert.deepEqual(await ops.seedsChangedSince('env-v1', ['never.txt']), ['never.txt'], 'a path missing at both ends is not "equal"');
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
