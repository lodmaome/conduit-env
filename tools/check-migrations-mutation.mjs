// Mutation check for the `migrations` check of tools/verify.mjs, against the REAL running stack. Node 22, stdlib only.
//
//   control   the unmodified api container: makemigrations --check --dry-run must say "No changes detected" (exit 0).
//   mutation  a field is added to apps/articles Tag in a COPY of /app made inside the running api container with Python's
//             tempfile.TemporaryDirectory (it deletes itself); the same command run in that copy must exit 1 and the verify evaluator must say FAIL.
//   invariance  before and after, the tracked tree, the git HEAD, and the four containers (id, start time, state) are identical, and so is
//             `docker diff` of the api container (what has been written to its filesystem). A snapshot comparison that cannot see a change
//             would make this vacuous, so the comparison itself is mutation-tested in-process (an extra line must make it unequal).
//
// usage: node tools/check-migrations-mutation.mjs      exit status = number of failed checks. Needs the stack running; changes nothing.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateMigrations } from './lib/verify-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(root, 'compose.yaml')) || !existsSync(resolve(root, 'env/OWNED.txt'))) {
  console.error(`refusing: ${root} is not the conduit-env repository root.`); process.exit(90);
}
const sh = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 120_000 }); return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }; };
const compose = (...a) => sh('docker', ['compose', '-f', 'compose.yaml', '-p', 'conduit-env', ...a]);

const PY = `
import os, shutil, subprocess, sys, tempfile
with tempfile.TemporaryDirectory() as d:
    dst = os.path.join(d, 'app')
    shutil.copytree('/app', dst, ignore=shutil.ignore_patterns('realworld', 'fronts', '.git'))
    p = os.path.join(dst, 'apps/articles/models.py')
    s = open(p).read()
    m = 'class Tag(models.Model):\\n'
    assert m in s, 'class Tag not found'
    open(p, 'w').write(s.replace(m, m + '    mutation_probe = models.IntegerField(default=0)\\n', 1))
    sys.exit(subprocess.run([sys.executable, 'manage.py', 'makemigrations', '--check', '--dry-run'], cwd=dst).returncode)
`;

export function snapshotsEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function snapshot() {
  const ids = compose('ps', '-aq').stdout.split('\n').map((s) => s.trim()).filter(Boolean).sort();
  const containers = ids.map((id) => sh('docker', ['inspect', '--format', '{{.Id}} {{.Name}} {{.State.StartedAt}} {{.State.Status}}', id]).stdout.trim());
  const apiId = compose('ps', '-q', 'api').stdout.trim();
  const diff = sh('docker', ['diff', apiId]).stdout.split('\n').filter(Boolean).sort();
  return { git: sh('git', ['status', '--porcelain']).stdout, head: sh('git', ['rev-parse', 'HEAD']).stdout.trim(), containers, diff };
}

let failed = 0;
const pass = (t) => console.log(`PASS  ${t}`);
const fail = (t) => { console.log(`FAIL  ${t}`); failed++; };

const before = snapshot();
before.containers.length === 4 ? pass(`snapshot: ${before.containers.length} containers, ${before.diff.length} entries in docker diff of api, git status "${before.git.trim()}" (presence control: 4 containers seen)`) : fail(`snapshot saw ${before.containers.length} containers, expected 4`);

const mutated = JSON.parse(JSON.stringify(before)); mutated.diff.push('A /tmp/extra');
snapshotsEqual(before, mutated) ? fail('comparison cannot see an extra docker-diff line') : pass('comparison mutation: an extra docker-diff line makes the snapshots unequal');
const mutated2 = JSON.parse(JSON.stringify(before)); mutated2.containers[0] += ' x';
snapshotsEqual(before, mutated2) ? fail('comparison cannot see a changed container') : pass('comparison mutation: a changed container line makes the snapshots unequal');

const control = compose('exec', '-T', 'api', 'python', 'manage.py', 'makemigrations', '--check', '--dry-run');
const cv = evaluateMigrations(control);
cv.ok && control.code === 0 ? pass(`control: ${cv.text}`) : fail(`control did not pass: exit ${control.code}: ${cv.text}`);

const mut = compose('exec', '-T', 'api', 'python', '-c', PY);
const mv = evaluateMigrations(mut);
!mv.ok && mut.code === 1 && /mutation_probe|Add field|articles/.test(mut.stdout + mut.stderr)
  ? pass(`mutation: exit 1, the evaluator says FAIL (${mv.text.slice(0, 160)})`)
  : fail(`mutation was not detected: exit ${mut.code}: ${mv.text}`);

const after = snapshot();
snapshotsEqual(before, after) ? pass('invariance: git status, HEAD, the 4 containers (id, start, state) and docker diff of api are identical before and after')
  : fail(`invariance broken:\nbefore ${JSON.stringify(before)}\nafter  ${JSON.stringify(after)}`);

console.log(`failed checks: ${failed}`);
process.exit(failed);
