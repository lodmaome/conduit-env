// Pure helpers for tools/verify.mjs. No I/O here, so every function is unit-tested with `node --test` (tools/test/).
// Node 22 stdlib only.

// Lowest Compose version the preflight accepts. Derivation (2026-10-09): the top-level `include` element, which compose.yaml uses, first
// appears in the docker/compose v2.20.0 release notes ("Add support for `include`"). The docs do not state when `include`'s
// `env_file` and `project_directory` attributes arrived, so 2.20.0 is a documented LOWER BOUND, not a tested minimum.
// Only MEASURED_COMPOSE was ever run.
export const MIN_COMPOSE = '2.20.0';
export const MEASURED_COMPOSE = '5.5.1';
export const MIN_NODE_MAJOR = 22;
export const PORTS = [4180, 4181, 4182];
// Exit status when verify could not run its checks (preflight failed, bad arguments, reset failed). Larger than any number of checks.
export const EXIT_COULD_NOT_RUN = 90;

export function parseVersion(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

// Returns a list of { level: 'error' | 'info' | 'ok', text }. Any 'error' means the checks must not run.
export function evaluatePreflight({ nodeVersion, engine, compose, ports, fresh, shAvailable, browser = { skip: true } }) {
  const out = [];
  const nodeMajor = Number(String(nodeVersion).split('.')[0]);
  out.push(nodeMajor >= MIN_NODE_MAJOR
    ? { level: 'ok', text: `node ${nodeVersion} (needs >= ${MIN_NODE_MAJOR})` }
    : { level: 'error', text: `node ${nodeVersion} is too old: this tool needs Node ${MIN_NODE_MAJOR} or newer.` });

  out.push(engine?.ok
    ? { level: 'ok', text: `docker engine reachable (server ${engine.version})` }
    : { level: 'error', text: `the Docker engine is not reachable (${engine?.error ?? 'no answer'}). Start Docker yourself and run this again; this tool never starts or stops Docker.` });

  const cv = parseVersion(compose?.version);
  if (!cv) {
    out.push({ level: 'error', text: `could not read the Docker Compose version (${compose?.error ?? `got ${JSON.stringify(compose?.version)}`}). Needs ${MIN_COMPOSE} or newer.` });
  } else if (compareVersions(cv, parseVersion(MIN_COMPOSE)) < 0) {
    out.push({ level: 'error', text: `docker compose ${cv.join('.')} is older than ${MIN_COMPOSE}, the first version with \`include\`, which compose.yaml needs.` });
  } else if (compareVersions(cv, parseVersion(MEASURED_COMPOSE)) !== 0) {
    out.push({ level: 'info', text: `docker compose ${cv.join('.')}: accepted (>= ${MIN_COMPOSE}), but untested; only ${MEASURED_COMPOSE} was measured.` });
  } else {
    out.push({ level: 'ok', text: `docker compose ${cv.join('.')} (measured version)` });
  }

  for (const p of PORTS) {
    const state = ports?.[p] ?? 'unknown';
    if (fresh) out.push({ level: 'info', text: `port ${p} on 127.0.0.1: ${state} (--fresh resets the stack, so either state is fine)` });
    else if (state === 'listening') out.push({ level: 'ok', text: `port ${p} on 127.0.0.1: listening` });
    else out.push({ level: 'error', text: `port ${p} on 127.0.0.1: ${state}. The default mode checks a running stack; start it (sh tools/reset.sh or docker compose -p conduit-env up -d --wait) or use --fresh.` });
  }

  if (fresh && !shAvailable) {
    out.push({ level: 'error', text: '--fresh runs `sh tools/reset.sh`, but `sh` is not on the PATH. On Windows run this from Git Bash or WSL.' });
  }
  if (browser.skip) out.push({ level: 'info', text: 'browser check skipped on request (--no-browser)' });
  else if (!browser.chromeBin) out.push({ level: 'error', text: 'CHROME_BIN is not set. Point it at a Chrome or Chromium executable, or pass --no-browser to leave the browser check out (it is never skipped silently).' });
  else if (!browser.exists) out.push({ level: 'error', text: `CHROME_BIN=${browser.chromeBin} does not exist. Fix the path or pass --no-browser.` });
  else out.push({ level: 'ok', text: `CHROME_BIN=${browser.chromeBin}` });
  return out;
}

// Per-run credentials. `rand(n)` returns n random bytes as a Buffer (crypto.randomBytes in verify.mjs, a stub in tests).
export function makeRunData(rand) {
  const hex = rand(5).toString('hex');
  const username = `verify-${hex}`;
  return {
    username,
    email: `${username}@example.com`, // .test and other special-use TLDs are rejected by the backend's email validator (measured)
    password: rand(18).toString('base64url'),
    article: {
      title: `verify article ${hex}`,
      description: `description ${hex}`,
      body: `body of the verify article ${hex}`,
      tagList: [`verify-${hex}`, 'verify-run'],
    },
  };
}

// Never print or keep a secret: replaces every given secret and anything shaped like a JWT.
export function redact(text, secrets) {
  let s = String(text);
  for (const secret of secrets) if (secret) s = s.split(secret).join('<redacted>');
  return s.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '<redacted-jwt>');
}

const sorted = (a) => [...a].sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Compares what was sent with the article the API returned. Returns a list of mismatch descriptions (empty = equal).
export function compareArticle(sent, got) {
  const bad = [];
  if (!got || typeof got !== 'object') return ['no article object in the response'];
  for (const f of ['title', 'description', 'body']) {
    if (got[f] !== sent[f]) bad.push(`${f}: sent ${JSON.stringify(sent[f])}, got ${JSON.stringify(got[f])}`);
  }
  if (!Array.isArray(got.tagList) || !same(sorted(got.tagList), sorted(sent.tagList))) {
    bad.push(`tagList: sent ${JSON.stringify(sorted(sent.tagList))}, got ${JSON.stringify(got.tagList)}`);
  }
  if (typeof got.slug !== 'string' || got.slug === '') bad.push('slug: missing or empty');
  if (got.favorited !== false) bad.push(`favorited: expected false, got ${JSON.stringify(got.favorited)}`);
  if (got.favoritesCount !== 0) bad.push(`favoritesCount: expected 0, got ${JSON.stringify(got.favoritesCount)}`);
  if (Number.isNaN(Date.parse(got.createdAt))) bad.push(`createdAt: not a date (${JSON.stringify(got.createdAt)})`);
  return bad;
}

// `makemigrations --check --dry-run`: exit 0 and "No changes detected" means every model has a migration; exit 1 means one lacks it.
export function evaluateMigrations({ code, stdout, stderr }) {
  const out = `${stdout ?? ''}${stderr ?? ''}`.trim();
  if (code === 0 && /No changes detected/.test(out)) return { ok: true, text: 'makemigrations --check --dry-run: No changes detected' };
  if (code === 0) return { ok: false, text: `exit 0 but the output does not say "No changes detected": ${out.slice(0, 300)}` };
  if (code === 1) return { ok: false, text: `a model has no migration (exit 1): ${out.replace(/\s+/g, ' ').slice(0, 300)}` };
  return { ok: false, text: `makemigrations could not run (exit ${code}): ${out.replace(/\s+/g, ' ').slice(0, 300)}` };
}

// results: [{ name, ok, text }] -> { lines, failed }. No timestamps, no durations: the verdict lines are deterministic.
export function summarize(results, secrets = []) {
  const lines = results.map((r) => redact(`${r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'}  ${r.name}: ${r.text}`, secrets));
  const failed = results.filter((r) => !r.ok).length;
  lines.push(`failed checks: ${failed}`);
  return { lines, failed };
}
