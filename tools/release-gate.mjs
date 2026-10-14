// The release gate. Node 22, stdlib only.
//
//   node tools/release-gate.mjs env-vN          all checks, for the candidate tag env-vN (a tag is NOT created)
//   node tools/release-gate.mjs                 the tag-independent checks; the tag checks print SKIP, never a silent pass
//   node tools/release-gate.mjs env-vN --local  also look for this machine's Windows user name and C:/Users paths in history (derived at run time)
//   node tools/release-gate.mjs env-vN --all-refs  scan every ref in check 16 (default: refs/heads/main and the tags, i.e. what is pushed)
//   node tools/release-gate.mjs --self-test     every check against its failing fixture (must fail) and a golden control (must pass)
//
// Exit status = number of failed checks (or failed self-test assertions); 90 = bad usage. Verdict lines carry no timestamps.
// The checks are in tools/lib/release-checks.mjs and read the repository through a ctx (tools/lib/release-ctx.mjs); the self-test builds
// fixtures from an in-memory golden tree (tools/lib/golden-tree.mjs), so no tracked file is ever mutated. Check 14 (internal links) and the
// lychee fixture run Docker through tools/gate.sh, the only `docker run --rm` in the repository.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { CHECKS } from './lib/release-checks.mjs';
import { GOLDEN_PORTS, goldenTree } from './lib/golden-tree.mjs';
import { gitOps, realCtx, treeCtx } from './lib/release-ctx.mjs';
import { formatFindings, gitHistory, scanHistory } from './lib/history-scan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, 'compose.yaml')) || !existsSync(join(root, 'env/OWNED.txt'))) {
  console.error(`refusing: ${root} is not the conduit-env repository root.`); process.exit(90);
}
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const localMode = args.includes('--local');
const allRefs = args.includes('--all-refs');
const tag = args.find((a) => !a.startsWith('--')) ?? null;
if (args.some((a) => a.startsWith('--') && a !== '--self-test' && a !== '--local' && a !== '--all-refs') || (tag && !/^env-v[1-9][0-9]*$/.test(tag)) || (selfTest && tag)) {
  console.error('usage: node tools/release-gate.mjs [env-vN | --self-test]   (the tag must look like env-v1, env-v2, ...)'); process.exit(90);
}

const fmt = (n) => String(n).padStart(3, ' ');
let failed = 0;
const line = (kind, c, text) => console.log(`${kind}  [${fmt(c.num)}] ${c.id}: ${text}`);

if (!selfTest) {
  // --local: also look for this machine's user name and C:/Users paths in history. Derived at run time, never written into a tracked file.
  const local = localMode ? { user: userInfo().username === 'SYSTEM' ? '' : userInfo().username } : null;
  const ctx = realCtx(root, tag, local, allRefs);
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

// a throwaway git repository for the seed check: the three seed files committed, then env-v1 tagged (annotated); mode 'identical' leaves HEAD at the tag,
// 'changed' changes README.md afterwards, 'removed' deletes LICENSE afterwards, 'untagged' creates no tag at all. Own directory only.
function makeSeedRepo(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'conduit-env-gatefix-'));
  const token = randomBytes(8).toString('hex');
  writeFileSync(join(dir, '.gatefix-marker'), token);
  const g = (...a) => { const r = spawnSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); };
  g('init', '-q'); writeFileSync(join(dir, 'README.md'), 'one\n'); writeFileSync(join(dir, 'LICENSE'), 'licence\n');
  mkdirSync(join(dir, 'docs/attempt'), { recursive: true }); writeFileSync(join(dir, 'docs/attempt/.gitkeep'), '');
  g('add', '.'); g('commit', '-q', '-m', 'seed');
  if (mode !== 'untagged') g('tag', '-a', 'env-v1', '-m', 'env-v1');
  if (mode === 'changed') { writeFileSync(join(dir, 'README.md'), 'two\n'); g('commit', '-q', '-am', 'change a seed'); }
  if (mode === 'removed') { g('rm', '-q', 'LICENSE'); g('commit', '-q', '-m', 'remove a seed'); }
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
    const repo = makeSeedRepo('identical');
    try { control = await c.run(treeCtx(base, { tag: 'env-v2', git: gitOps(repo.dir) })); } finally { dropSeedRepo(repo); }
  }
  if (c.id === 'internal-links') control = await c.run(treeCtx(base)); // stub returns code 0
  control.ok ? sp('PASS', `[${fmt(c.num)}] ${c.id}: control passes${control.skipped ? ' (visibly skipped)' : ''}: ${control.text}`) : sp('FAIL', `[${fmt(c.num)}] ${c.id}: control FAILED on the golden tree: ${control.text}`);

  // fixtures: one deliberate defect each, the check must fail with the expected message
  for (const fx of c.fixtures) {
    const tree = goldenTree();
    fx.mutate(tree);
    const opts = { tag: fx.tag ?? controlTag };
    if (fx.ports) opts.ports = fx.ports;
    if (fx.links) opts.links = fx.links;
    if (fx.historyInput) opts.historyInput = fx.historyInput;
    let repo;
    if (fx.gitFixture) { repo = makeSeedRepo(fx.gitFixture === 'seed-changed' ? 'changed' : 'removed'); opts.git = gitOps(repo.dir); }
    let res;
    try { res = await c.run(treeCtx(tree, opts)); } finally { if (repo) dropSeedRepo(repo); }
    const label = fx.name ? ` (${fx.name})` : '';
    if (res.ok) sp('FAIL', `[${fmt(c.num)}] ${c.id}${label}: the failing fixture PASSED (the check cannot fail): ${res.text}`);
    else if (!fx.expect.test(res.text)) sp('FAIL', `[${fmt(c.num)}] ${c.id}${label}: failed, but not as expected (/${fx.expect.source}/): ${res.text}`);
    else sp('PASS', `[${fmt(c.num)}] ${c.id}${label}: fixture fails as intended: ${res.text.slice(0, 140)}`);
  }
}

// check 4, two more controls on real temporary repositories: env-v1 with its tag and identical seeds PASSES (and says how many files it compared);
// env-v1 with no tag at all is a visible SKIP.
{
  const c4 = CHECKS.find((x) => x.id === 'seeds-unchanged');
  for (const [mode, label, want] of [['identical', 'env-v1 with its tag and identical seeds', 'pass'], ['untagged', 'env-v1 with no tag', 'skip']]) {
    const repo = makeSeedRepo(mode);
    let res;
    try { res = await c4.run(treeCtx(goldenTree(), { tag: 'env-v1', git: gitOps(repo.dir) })); } finally { dropSeedRepo(repo); }
    const good = want === 'pass' ? res.ok && !res.skipped && /3 seed files compared against the tag env-v1/.test(res.text) : res.ok && res.skipped && /first release: skipped/.test(res.text);
    sp(good ? 'PASS' : 'FAIL', `[${fmt(c4.num)}] ${c4.id} (${label}): control ${want === 'pass' ? 'passes' : 'is a visible skip'}: ${res.text.slice(0, 140)}`);
  }
}

// check 16 for real: a throwaway repository whose OLD commit holds a fake token that a later commit removed. The tree of HEAD is clean, so a
// tree scan cannot see it; the history scan must. Own directory only (marker, prefix, token), deleted after the checks.
{
  const dir = mkdtempSync(join(tmpdir(), 'conduit-env-gatefix-'));
  const token = randomBytes(8).toString('hex');
  writeFileSync(join(dir, '.gatefix-marker'), token);
  const g = (...a) => { const r = spawnSync('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@example.com', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); };
  try {
    g('init', '-q', '-b', 'main');
    const fake = `${'gh'}p_${randomBytes(18).toString('hex')}`; // 36 characters after the prefix, built at run time, never written into a tracked file
    writeFileSync(join(dir, 'notes.txt'), `token = ${fake}\n`);
    g('add', 'notes.txt'); g('commit', '-q', '-m', 'add notes');
    writeFileSync(join(dir, 'notes.txt'), 'nothing here\n');
    writeFileSync(join(dir, 'user.txt'), `written by ${userInfo().username}\n`);
    g('add', 'notes.txt', 'user.txt'); g('commit', '-q', '-m', 'remove the token');
    const headBlob = spawnSync('git', ['show', 'HEAD:notes.txt'], { cwd: dir, encoding: 'utf8' }).stdout;
    const treeFindings = scanHistory({ diffText: `commit 0000000\n+++ b/notes.txt\n${headBlob.split('\n').map((l) => `+${l}`).join('\n')}\n` });
    treeFindings.findings.length === 0 ? sp('PASS', '[ 16] history-scan: control: the HEAD tree of the temp repository is clean (a tree scan finds nothing)') : sp('FAIL', '[ 16] history-scan: the temp repository HEAD tree is not clean');
    const hist = scanHistory(gitHistory(dir, null));
    hist.findings.some((f) => f.kind === 'GitHub token' && f.path === 'notes.txt') ? sp('PASS', `[ 16] history-scan: the old commit's token is found although the tree is clean (${formatFindings(hist.findings)})`) : sp('FAIL', '[ 16] history-scan: the removed token in the old commit was NOT found');
    const normalLocal = scanHistory(gitHistory(dir, null));
    normalLocal.findings.some((f) => f.kind.includes('user name')) ? sp('FAIL', '[ 16] history-scan: normal mode reported the user name') : sp('PASS', '[ 16] history-scan: normal mode does not look for the user name (control for local mode)');
    const local = scanHistory(gitHistory(dir, { user: userInfo().username }));
    local.findings.some((f) => f.kind.includes('user name') && f.path === 'user.txt') ? sp('PASS', '[ 16] history-scan: local mode finds this machine\'s user name') : sp('FAIL', '[ 16] history-scan: local mode did NOT find the user name');
    // a secret only on a side branch: not on main, so not pushed with main. Default scan: not found. --all-refs: found.
    g('switch', '-q', '-c', 'backup/x');
    const sideFake = `${'gh'}p_${randomBytes(18).toString('hex')}`;
    writeFileSync(join(dir, 'side.txt'), `token = ${sideFake}\n`);
    g('add', 'side.txt'); g('commit', '-q', '-m', 'side branch only');
    g('switch', '-q', 'main');
    const sideDefault = scanHistory(gitHistory(dir, null));
    sideDefault.findings.some((f) => f.path === 'side.txt') ? sp('FAIL', '[ 16] history-scan: the default scan reported a secret that only exists on backup/x') : sp('PASS', '[ 16] history-scan: a secret only on backup/x is NOT found by the default scan (refs/heads/main and tags)');
    const sideAll = scanHistory(gitHistory(dir, null, true));
    sideAll.findings.some((f) => f.kind === 'GitHub token' && f.path === 'side.txt') ? sp('PASS', '[ 16] history-scan: --all-refs finds the secret that only exists on backup/x') : sp('FAIL', '[ 16] history-scan: --all-refs did NOT find the secret on backup/x');
    // a detached checkout with no local main (what a pull_request run in Actions has): HEAD stands in for main and the old commit is still found
    g('switch', '-q', '--detach');
    g('branch', '-q', '-D', 'main');
    const detached = scanHistory(gitHistory(dir, null));
    detached.findings.some((f) => f.path === 'notes.txt') ? sp('PASS', '[ 16] history-scan: with a detached HEAD and no local main, HEAD stands in for main and the old commit is found') : sp('FAIL', '[ 16] history-scan: a detached checkout without main broke or blinded the scan');
    g('switch', '-q', '-c', 'main');
    const mainOld = scanHistory(gitHistory(dir, null));
    mainOld.findings.some((f) => f.path === 'notes.txt') ? sp('PASS', '[ 16] history-scan: the removed secret in an old commit of main is still found by the default scan') : sp('FAIL', '[ 16] history-scan: the default scan lost the old commit of main');
  } finally {
    const marker = existsSync(join(dir, '.gatefix-marker')) ? readFileSync(join(dir, '.gatefix-marker'), 'utf8') : '';
    const d = resolve(dir);
    if (d.startsWith(resolve(tmpdir()) + sep) && basename(d).startsWith('conduit-env-gatefix-') && marker === token) rmSync(d, { recursive: true, force: true });
    else console.log(`note: not deleting ${d}`);
  }
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
