// Builds the `ctx` object the release checks read: from an in-memory tree (self-test, unit tests) or from the real repository.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from './release-checks.mjs';
import { formatFindings, gitHistory, scanHistory } from './history-scan.mjs';
import { GOLDEN_LICENSE, GOLDEN_PORTS } from './golden-tree.mjs';

const lockHashLines = (read) => {
  const sha = /^BACKEND_SHA=([0-9a-f]{40})$/m.exec(read('env/pins.env') ?? '')?.[1] ?? '';
  return `backend-sha7: ${sha.slice(0, 7)}\nrequirements-lock-sha256: ${sha256(read('env/backend/requirements.lock.txt') ?? '')}\nbuild-tools-lock-sha256: ${sha256(read('env/backend/build-tools.lock.txt') ?? '')}\n`;
};

// tree: Map<path, string>. overrides replace single ctx members (a rendered-ports object, a links result, git helpers).
export function treeCtx(tree, { tag = null, ports = GOLDEN_PORTS, links = { code: 0, text: '' }, git = {}, historyInput = {} } = {}) {
  const read = (p) => tree.get(p);
  return {
    tag,
    files: () => [...tree.keys()].sort(),
    read,
    exists: (p) => tree.has(p),
    historyInput: () => ({ diffText: '', messages: [], paths: [], blobs: [], local: null, commits: 1, ...historyInput }),
    scanHistory,
    formatFindings,
    crlfInIndex: () => [...tree.keys()].filter((p) => (tree.get(p) ?? '').includes('\r')).sort(),
    lockHashes: () => lockHashLines(read),
    composePorts: async () => ports,
    links: async () => links,
    expectedLicense: () => GOLDEN_LICENSE,
    tagExists: git.tagExists ?? (async () => false),
    seedsChangedSince: git.seedsChangedSince ?? (async () => []),
  };
}

const run = (cmd, args, cwd) => new Promise((res) => {
  const c = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  c.stdout.on('data', (d) => { out += d; });
  c.stderr.on('data', (d) => { err += d; });
  c.on('error', (e) => res({ code: 127, stdout: '', text: String(e.message) }));
  c.on('close', (code) => res({ code: code ?? 1, stdout: out, text: out + err }));
});

export function gitOps(cwd) {
  return {
    tagExists: async (tag) => (await run('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], cwd)).code === 0,
    // Compares each path's blob at HEAD with its blob at the tag. A path missing on either side counts as changed, never as equal.
    seedsChangedSince: async (tag, paths) => {
      const blob = async (rev, p) => { const r = await run('git', ['rev-parse', '--verify', '--quiet', `${rev}:${p}`], cwd); return r.code === 0 ? r.stdout.trim() : null; };
      const changed = [];
      for (const p of paths) {
        const atHead = await blob('HEAD', p);
        const atTag = await blob(`refs/tags/${tag}`, p);
        if (atHead === null || atTag === null || atHead !== atTag) changed.push(p);
      }
      return changed.sort();
    },
  };
}

export function realCtx(root, tag, local = null, allRefs = false) {
  const ls = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  if (ls.status !== 0) throw new Error(`git ls-files failed in ${root}`);
  const files = ls.stdout.split('\n').filter(Boolean).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const cache = new Map();
  const read = (p) => {
    if (cache.has(p)) return cache.get(p);
    const full = resolve(root, p);
    let v;
    if (existsSync(full)) {
      const buf = readFileSync(full);
      // CRLF is normalised away here: a Windows checkout with core.autocrlf turns LF files into CRLF, and the checks must not depend on that.
      // The no-crlf check looks at what is committed (the index) instead, through crlfInIndex().
      v = buf.includes(0) ? undefined : buf.toString('utf8').replace(/\r\n/g, '\n');
    }
    cache.set(p, v);
    return v;
  };
  return {
    tag,
    files: () => files,
    read,
    exists: (p) => existsSync(resolve(root, p)),
    historyInput: () => gitHistory(root, local, allRefs),
    scanHistory,
    formatFindings,
    crlfInIndex: () => spawnSync('git', ['ls-files', '--eol'], { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter((l) => /^i\/(crlf|mixed)\s/.test(l)).map((l) => l.split('\t')[1]).sort(),
    lockHashes: () => spawnSync('sh', ['tools/lock-hashes.sh'], { cwd: root, encoding: 'utf8' }).stdout,
    composePorts: async () => {
      const r = await run('docker', ['compose', '-f', 'compose.yaml', 'config', '--format', 'json'], root);
      if (r.code !== 0) throw new Error(`docker compose -f compose.yaml config failed: ${r.text.split('\n')[0]}`);
      return JSON.parse(r.stdout);
    },
    links: async () => run('sh', ['tools/gate.sh', '--links-only'], root),
    expectedLicense: () => readFileSync(resolve(root, 'env/gate/license-mit.txt'), 'utf8'),
    ...gitOps(root),
  };
}
