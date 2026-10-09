// The release gate. Node 22, stdlib only.
//
//   node tools/release-gate.mjs env-vN          all checks, for the candidate tag env-vN (a tag is NOT created)
//   node tools/release-gate.mjs                 the tag-independent checks; the tag checks print SKIP, never a silent pass
//   node tools/release-gate.mjs --self-test     every check against its failing fixture (must fail) and a golden control (must pass)
//
// Exit status = number of failed checks (or failed self-test assertions); 90 = bad usage. Verdict lines carry no timestamps.
// The checks are in tools/lib/release-checks.mjs and read the repository through a ctx (tools/lib/release-ctx.mjs); the self-test builds
// fixtures from an in-memory golden tree (tools/lib/golden-tree.mjs), so no tracked file is ever mutated. Check 14 (internal links) and the
// lychee fixture run Docker through tools/gate.sh, the only `docker run --rm` in the repository.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { CHECKS } from './lib/release-checks.mjs';
import { GOLDEN_PORTS, goldenTree } from './lib/golden-tree.mjs';
import { gitOps, realCtx, treeCtx } from './lib/release-ctx.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, 'compose.yaml')) || !existsSync(join(root, 'env/OWNED.txt'))) {
  console.error(`refusing: ${root} is not the conduit-env repository root.`); process.exit(90);
}
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const tag = args.find((a) => !a.startsWith('--')) ?? null;
if (args.some((a) => a.startsWith('--') && a !== '--self-test') || (tag && !/^env-v[1-9][0-9]*$/.test(tag)) || (selfTest && tag)) {
  console.error('usage: node tools/release-gate.mjs [env-vN | --self-test]   (the tag must look like env-v1, env-v2, ...)'); process.exit(90);
}

const fmt = (n) => String(n).padStart(3, ' ');
let failed = 0;
const line = (kind, c, text) => console.log(`${kind}  [${fmt(c.num)}] ${c.id}: ${text}`);

if (!selfTest) {
  const ctx = realCtx(root, tag);
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  console.log(`release gate for ${tag ?? '(no tag given)'}: ${CHECKS.length} checks over ${ctx.files().length} tracked files${dirty ? '; NOTE the working tree has uncommitted changes (the gate reads the working tree)' : ''}`);
  for (const c of CHECKS) {
    if (c.needsTag && !tag) { line('SKIP', c, 'no tag given, so this check did not run'); continue; }
    let r;
    try { r = await c.run(ctx); } catch (e) { r = { ok: false, text: `the check itself failed: ${e.message}` }; }
    if (r.skipped) line('SKIP', c, r.text); else if (r.ok) line('PASS', c, r.text); else { line('FAIL', c, r.text); failed++; }
  }
  console.log(`failed checks: ${failed}`);
  process.exit(failed);
}

// ---- self-test ----
const sp = (kind, text) => { console.log(`${kind}  selftest ${text}`); if (kind === 'FAIL') failed++; };

// a throwaway git repository for the seed check: env-v1 tagged with README.md, then README.md changed. Own directory only.
function makeSeedRepo(changed) {
  const dir = mkdtempSync(join(tmpdir(), 'conduit-env-gatefix-'));
  const token = randomBytes(8).toString('hex');
  writeFileSync(join(dir, '.gatefix-marker'), token);
  const g = (...a) => { const r = spawnSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); };
  g('init', '-q'); writeFileSync(join(dir, 'README.md'), 'one\n'); g('add', '.'); g('commit', '-q', '-m', 'seed'); g('tag', 'env-v1');
  if (changed) writeFileSync(join(dir, 'README.md'), 'two\n');
  return { dir, token };
}
function dropSeedRepo({ dir, token }) {
  // only our own directory: under the temp dir, with our prefix and our marker file holding this run's token
  const d = resolve(dir);
  const marker = existsSync(join(d, '.gatefix-marker')) ? readFileSync(join(d, '.gatefix-marker'), 'utf8') : '';
  const problem = !d.startsWith(resolve(tmpdir()) + sep) ? 'not under the temp directory' : !basename(d).startsWith('conduit-env-gatefix-') ? 'no conduit-env-gatefix- prefix' : marker !== token ? 'no marker with this run\'s token' : null;
  if (problem) { console.log(`note: not deleting ${d}: ${problem}`); return; }
  rmSync(d, { recursive: true, force: true });
}

for (const c of CHECKS) {
  const base = goldenTree();
  const controlTag = c.needsTag ? 'env-v1' : null;
  // control: the golden tree passes (or, for the first-release rule, is visibly skipped)
  let control = await c.run(treeCtx(base, { tag: controlTag }));
  if (c.id === 'seeds-unchanged') {
    const repo = makeSeedRepo(false);
    try { control = await c.run(treeCtx(base, { tag: 'env-v2', git: gitOps(repo.dir) })); } finally { dropSeedRepo(repo); }
  }
  if (c.id === 'internal-links') control = await c.run(treeCtx(base)); // stub returns code 0
  control.ok ? sp('PASS', `[${fmt(c.num)}] ${c.id}: control passes${control.skipped ? ' (visibly skipped)' : ''}: ${control.text}`) : sp('FAIL', `[${fmt(c.num)}] ${c.id}: control FAILED on the golden tree: ${control.text}`);

  // fixture: one deliberate defect, the check must fail with the expected message
  const tree = goldenTree();
  c.fixture.mutate(tree);
  const opts = { tag: c.fixture.tag ?? controlTag };
  if (c.fixture.ports) opts.ports = c.fixture.ports;
  if (c.fixture.links) opts.links = c.fixture.links;
  let repo;
  if (c.fixture.gitFixture === 'seed-changed') { repo = makeSeedRepo(true); opts.git = gitOps(repo.dir); }
  let res;
  try { res = await c.run(treeCtx(tree, opts)); } finally { if (repo) dropSeedRepo(repo); }
  if (res.ok) sp('FAIL', `[${fmt(c.num)}] ${c.id}: the failing fixture PASSED (the check cannot fail): ${res.text}`);
  else if (!c.fixture.expect.test(res.text)) sp('FAIL', `[${fmt(c.num)}] ${c.id}: failed, but not as expected (/${c.fixture.expect.source}/): ${res.text}`);
  else sp('PASS', `[${fmt(c.num)}] ${c.id}: fixture fails as intended: ${res.text.slice(0, 140)}`);
}

// check 14 for real: lychee on the broken and the clean markdown fixture, through tools/gate.sh
for (const [file, wantFail] of [['env/gate/fixtures/bad.md', true], ['env/gate/fixtures/good.md', false]]) {
  const r = spawnSync('sh', ['tools/gate.sh', '--links-only', file], { cwd: root, encoding: 'utf8' });
  const failedRun = r.status !== 0;
  if (failedRun === wantFail) sp('PASS', `[ 14] internal-links: real lychee run on ${file} ${wantFail ? 'fails' : 'passes'} as intended (exit ${r.status})`);
  else sp('FAIL', `[ 14] internal-links: real lychee run on ${file} exited ${r.status}, expected ${wantFail ? 'non-zero' : '0'}: ${(r.stdout + r.stderr).split('\n').slice(-6).join(' | ')}`);
}
void GOLDEN_PORTS;
console.log(`failed checks: ${failed}`);
process.exit(failed);
