// One real-browser check of the compose-built pair, over raw CDP. Node 22, global WebSocket, no puppeteer, no playwright.
//
//   CHROME_BIN=<path to chrome> node tools/browser-check.mjs [--frontend-url URL] [--expected-api-origin ORIGIN] [--block-api]
//
// It creates a user and an article through the API (a known title), launches ITS OWN headless Chrome (fresh temp profile, port chosen by
// Chrome), loads the frontend and asserts, from what the browser itself did:
//   api-origin     every Fetch/XHR request goes to the origin baked into the build (default http://localhost:4181)
//   no-old-origin  no Fetch/XHR request goes to https://api.realworld.show (the frontend's source fallback)
//   api-content    the rendered page shows the known article title (content only the API has)
// Other request types to the old origin are listed as informational. Exit status = number of failed assertions; 90 = could not run.
//
// --expected-api-origin and --block-api exist for the two mutation checks (a wrong expectation must fail; blocking the API through
// Network.setBlockedURLs must fail readably). It never attaches to a Chrome it did not start, kills only the child it spawned (by PID,
// the process tree on Windows), and deletes only its own profile directory (temp dir, own prefix, own marker file).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import dns from 'node:dns/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT_COULD_NOT_RUN, EXPECTED_API_ORIGIN, MARKER_NAME, PROFILE_PREFIX, evaluateRequests, parseDevToolsActivePort, profileDirProblem } from './lib/browser-lib.mjs';
import { makeRunData } from './lib/verify-lib.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const frontendUrl = opt('--frontend-url', 'http://localhost:4180/');
const expectedOrigin = opt('--expected-api-origin', EXPECTED_API_ORIGIN);
const blockApi = argv.includes('--block-api');
const API = 'http://127.0.0.1:4181/api'; // setup calls from this process; the browser uses what the frontend was built with

const die = (msg) => { console.log(`could not run: ${msg}`); process.exit(EXIT_COULD_NOT_RUN); };
const chromeBin = process.env.CHROME_BIN;
if (!chromeBin) die('CHROME_BIN is not set. Point it at a Chrome or Chromium executable (this check never skips silently; use `verify --no-browser` to leave it out).');
if (!existsSync(chromeBin)) die(`CHROME_BIN=${chromeBin} does not exist.`);

async function api(path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text) };
}

// ---- setup: a known article ----
const data = makeRunData(randomBytes);
let title;
try {
  const reg = await api('/users', { method: 'POST', body: { user: { username: data.username, email: data.email, password: data.password } } });
  if (reg.status !== 201) die(`setup: register returned ${reg.status}`);
  const art = await api('/articles', { method: 'POST', headers: { Authorization: `Token ${reg.json.user.token}` }, body: { article: data.article } });
  if (art.status !== 201) die(`setup: create article returned ${art.status}`);
  title = art.json.article.title;
} catch (e) { die(`setup against ${API} failed: ${e?.cause?.code ?? e.message} (is the stack up?)`); }

// ---- own profile directory ----
const token = randomBytes(12).toString('hex');
const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
writeFileSync(join(profile, MARKER_NAME), token);
const cleanProfile = async () => {
  const problem = profileDirProblem(profile, tmpdir(), existsSync(join(profile, MARKER_NAME)) ? readFileSync(join(profile, MARKER_NAME), 'utf8') : '', token);
  if (problem) { console.log(`note: not deleting the profile directory: ${problem}`); return; }
  for (let i = 0; i < 10; i++) {
    try { rmSync(profile, { recursive: true, force: true }); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  console.log(`note: could not delete ${profile}; it is ours and safe to delete by hand`);
};

let child;
let exited = false;
async function stopChild() {
  if (!child || exited) return;
  await new Promise((r) => setTimeout(r, 300));
  if (exited) return;
  // Browser.close was already sent; if the child is still there, kill exactly this PID (and its tree on Windows), never by name.
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ } }
  for (let i = 0; i < 20 && !exited; i++) await new Promise((r) => setTimeout(r, 250));
}

// ---- minimal CDP client ----
function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject, method, timer } = pending.get(m.id);
      clearTimeout(timer); pending.delete(m.id);
      m.error ? reject(new Error(`CDP ${method} failed: ${m.error.message}`)) : resolve(m.result);
    } else if (m.method) for (const l of listeners) l(m);
  });
  return {
    opened: new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', () => reject(new Error('could not open the DevTools websocket'))); }),
    send(method, params = {}, sessionId, timeoutMs = 10_000) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method}: no answer within ${timeoutMs / 1000} s`)); }, timeoutMs);
        pending.set(id, { resolve, reject, method, timer });
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    },
    on: (l) => listeners.push(l),
    close: () => ws.close(),
  };
}

let exitCode = 0;
try {
  child = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', 'about:blank'],
    { stdio: 'ignore', windowsHide: true });
  child.on('exit', () => { exited = true; });
  child.on('error', (e) => { die(`could not start Chrome: ${e.message}`); });

  let ep = null;
  for (let i = 0; i < 60 && !ep && !exited; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const f = join(profile, 'DevToolsActivePort');
    if (existsSync(f)) ep = parseDevToolsActivePort(readFileSync(f, 'utf8'));
  }
  if (!ep) throw new Error(exited ? 'Chrome exited before it opened a DevTools port' : 'Chrome did not open a DevTools port within 15 s');

  const cdp = cdpClient(`ws://127.0.0.1:${ep.port}${ep.path}`);
  await Promise.race([cdp.opened, new Promise((_, rej) => setTimeout(() => rej(new Error('DevTools websocket did not open within 10 s')), 10_000))]);
  const version = await cdp.send('Browser.getVersion');

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const requests = [];
  const failures = [];
  const ids = new Map();
  const remote = new Set();
  let loaded = false;
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.requestWillBeSent') { requests.push({ url: m.params.request.url, type: m.params.type }); ids.set(m.params.requestId, m.params.request.url); }
    if (m.method === 'Network.loadingFailed') failures.push({ url: ids.get(m.params.requestId) ?? '', type: m.params.type, errorText: m.params.blockedReason ? `blocked by the DevTools client, reason ${m.params.blockedReason}` : (m.params.errorText || 'failed') });
    if (m.method === 'Network.responseReceived' && ['Fetch', 'XHR'].includes(m.params.type)) remote.add(m.params.response.remoteIPAddress ?? 'unknown');
    if (m.method === 'Page.loadEventFired') loaded = true;
  });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  if (blockApi) await cdp.send('Network.setBlockedURLs', { urls: [`${expectedOrigin}/*`] }, sessionId);
  await cdp.send('Page.navigate', { url: frontendUrl }, sessionId);

  let titleSeen = false;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    const r = await cdp.send('Runtime.evaluate', { expression: `document.body ? document.body.innerText.includes(${JSON.stringify(title)}) : false`, returnByValue: true }, sessionId);
    titleSeen = r.result.value === true;
    // Stop early on success, or once the page has loaded and an API request has visibly failed (a blocked API must not look like a timeout).
    if (titleSeen || (loaded && failures.some((f) => ['Fetch', 'XHR'].includes(f.type)))) break;
  }
  const { assertions, info } = evaluateRequests({ requests, failures: failures.map((f) => ({ ...f })), expectedOrigin, titleSeen, title });

  console.log(`browser: ${version.product}; page ${frontendUrl}; expected API origin ${expectedOrigin}${blockApi ? '; API origin BLOCKED through Network.setBlockedURLs' : ''}`);
  for (const a of assertions) console.log(`${a.ok ? 'PASS' : 'FAIL'}  ${a.name}: ${a.text}`);
  for (const i of info) console.log(i);
  console.log(`informational: Fetch/XHR responses came from ${[...remote].sort().join(', ') || 'no response'}`);
  try {
    const lk = await dns.lookup('localhost', { all: true });
    console.log(`informational: this machine resolves localhost to ${lk.map((a) => a.address).join(', ')} (in that order)`);
  } catch (e) { console.log(`informational: could not resolve localhost (${e.code})`); }
  exitCode = assertions.filter((a) => !a.ok).length;
  console.log(`failed checks: ${exitCode}`);
  try { await cdp.send('Browser.close', {}, undefined, 3000); } catch { /* the browser closes the socket as it exits */ }
  cdp.close();
} catch (e) {
  console.log(`FAIL  browser: ${e.message}`);
  exitCode = 1;
} finally {
  await stopChild();
  await cleanProfile();
}
process.exit(exitCode);
