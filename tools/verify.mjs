// Verifies a running conduit-env stack. Node 22, stdlib only.
//
//   node tools/verify.mjs            check whatever is on 127.0.0.1:4180-4182; runs no compose command except one `exec`
//   node tools/verify.mjs --fresh    FIRST resets the stack (sh tools/reset.sh), then checks. DESTRUCTIVE, never the default.
//
// Checks (exit status = number of failed checks; 90 = could not run, see EXIT_COULD_NOT_RUN):
//   tags        GET /api/tags -> 200
//   api-flow    register a unique user, log in, read the current user, create an article, read it back and compare
//   frontend    GET / -> 200 and it is the app page
//   migrations  `makemigrations --check --dry-run` through `docker compose exec` in the running api container
//   browser     tools/browser-check.mjs in a real Chrome (CHROME_BIN); `--no-browser` leaves it out and says so
//
// All HTTP checks use 127.0.0.1 explicitly, never `localhost`. Credentials are generated per run, never printed and never written to
// disk (this tool writes no file; the browser check keeps its Chrome profile in a temp directory it deletes). What a run leaves in the database: it registers users and creates articles, which stay until the next reset (ENV-README.md section 6).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT_COULD_NOT_RUN, PORTS, evaluatePreflight, makeRunData, summarize } from './lib/verify-lib.mjs';
import { checkApiFlow, checkFrontend, checkMigrations, checkTags } from './lib/verify-checks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(root, 'compose.yaml')) || !existsSync(resolve(root, 'env/pins.env'))) {
  console.error(`refusing: ${root} is not the conduit-env repository root (compose.yaml or env/pins.env missing).`);
  process.exit(EXIT_COULD_NOT_RUN);
}

const args = process.argv.slice(2);
const known = new Set(['--fresh', '--no-browser', '--help']);
const unknown = args.filter((a) => !known.has(a));
if (args.includes('--help') || unknown.length) {
  console.log(unknown.length ? `unknown argument(s): ${unknown.join(' ')}\n` : '');
  console.log('usage: node tools/verify.mjs [--fresh]\n  --fresh  reset the stack first: sh tools/reset.sh (deletes the database volume and removes the project\'s orphans, including your own extra services)');
  process.exit(unknown.length ? EXIT_COULD_NOT_RUN : 0);
}
const fresh = args.includes('--fresh');
const noBrowser = args.includes('--no-browser');

function run(cmd, cmdArgs, { timeoutMs = 120_000, env = process.env, inherit = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, env, timeout: timeoutMs, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolvePromise({ code: code ?? (signal ? 128 : 1), stdout, stderr }));
  });
}
const runDocker = (a) => run('docker', a);

function portState(port) {
  return new Promise((res) => {
    const s = net.connect({ host: '127.0.0.1', port, timeout: 1500 });
    s.on('connect', () => { s.destroy(); res('listening'); });
    s.on('timeout', () => { s.destroy(); res('no answer (timeout)'); });
    s.on('error', (e) => res(e.code === 'ECONNREFUSED' ? 'nothing listening' : e.code));
  });
}

async function preflight() {
  let engine;
  try {
    const r = await runDocker(['version', '--format', '{{.Server.Version}}']);
    engine = r.code === 0 && r.stdout.trim() ? { ok: true, version: r.stdout.trim() } : { ok: false, error: (r.stderr || r.stdout).trim().split('\n')[0] };
  } catch (e) { engine = { ok: false, error: e.message }; }
  let compose;
  try {
    const r = await runDocker(['compose', 'version', '--short']);
    compose = r.code === 0 ? { version: r.stdout.trim() } : { version: null, error: (r.stderr || r.stdout).trim().split('\n')[0] };
  } catch (e) { compose = { version: null, error: e.message }; }
  const ports = {};
  for (const p of PORTS) ports[p] = await portState(p);
  let shAvailable = false;
  if (fresh) { try { shAvailable = (await run('sh', ['-c', 'exit 0'])).code === 0; } catch { shAvailable = false; } }
  const chromeBin = process.env.CHROME_BIN;
  return evaluatePreflight({ nodeVersion: process.versions.node, engine, compose, ports, fresh, shAvailable, browser: { skip: noBrowser, chromeBin, exists: Boolean(chromeBin) && existsSync(chromeBin) } });
}

if (fresh) {
  console.log('--fresh: this RESETS the stack before checking. It deletes the database volume and removes the conduit-env project\'s containers and');
  console.log('orphans (your own extra services included). Every other Docker object is left alone. Reset: sh tools/reset.sh with COMPOSE_FILE=compose.yaml.');
}

const pre = await preflight();
for (const p of pre) console.log(`${{ ok: 'ok   ', info: 'note ', error: 'ERROR' }[p.level]} preflight: ${p.text}`);
if (pre.some((p) => p.level === 'error')) {
  console.log('verify could not run: fix the errors above.');
  process.exit(EXIT_COULD_NOT_RUN);
}

if (fresh) {
  // COMPOSE_FILE=compose.yaml makes reset.sh ignore a compose.override.yaml; the project-name guard still runs and still passes.
  const r = await run('sh', ['tools/reset.sh'], { timeoutMs: 600_000, inherit: true, env: { ...process.env, COMPOSE_FILE: 'compose.yaml' } });
  if (r.code !== 0) {
    console.log(`verify could not run: sh tools/reset.sh exited ${r.code}.`);
    process.exit(EXIT_COULD_NOT_RUN);
  }
}

// The browser check runs as its own process (tools/browser-check.mjs): it creates one more user and article, launches its own headless Chrome and cleans up after itself.
async function checkBrowser() {
  const name = 'browser';
  if (noBrowser) return { name, ok: true, skipped: true, text: 'skipped: --no-browser was given' };
  const r = await run(process.execPath, ['tools/browser-check.mjs'], { timeoutMs: 180_000 });
  const lines = r.stdout.split(/\r?\n/);
  if (r.code === 0) return { name, ok: true, text: `${lines.filter((l) => l.startsWith('PASS')).length} assertions pass in a real Chrome (tools/browser-check.mjs)` };
  const why = r.code === EXIT_COULD_NOT_RUN ? lines.filter((l) => l.startsWith('could not run')).join(' ') : lines.filter((l) => l.startsWith('FAIL')).map((l) => l.replace(/^FAIL\s+/, '')).join('; ');
  return { name, ok: false, text: why || `tools/browser-check.mjs exited ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 200)}` };
}

const base = { apiBase: 'http://127.0.0.1:4181/api', frontendBase: 'http://127.0.0.1:4180', fetchFn: fetch, runDocker };
const data = makeRunData(randomBytes);
const secrets = [];
const results = [
  await checkTags(base),
  await checkApiFlow(base, data, secrets),
  await checkFrontend(base),
  await checkMigrations(base),
  await checkBrowser(),
];
const { lines, failed } = summarize(results, secrets);
for (const l of lines) console.log(l);
process.exit(failed);
