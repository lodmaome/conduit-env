// Scan of every reachable commit, not only the tree (release check 16). Node 22 stdlib only.
// Pure part: scanHistory(). I/O part: gitHistory(cwd) runs git and returns the input of scanHistory().
// Findings never contain the matched text, only the kind, the short commit and the path, so a report cannot leak what it found.
import { spawnSync } from 'node:child_process';
import { DOCUMENTED_LOCAL_PASSWORD, SECRET_PATTERNS, SECRET_SCAN_EXEMPT } from './release-checks.mjs';

export const TOKEN_PATTERNS = [
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
];

// Files that should never be in a public history: archives, database dumps, captures, key material, evidence folders.
export const FORBIDDEN_PATH = /(\.(tar|tgz|zip|gz|7z|dump|sql|sqlite3?|har|pem|p12|pfx)$)|(^|\/)[^/]*-evidence(\/|$)|(^|\/)\.env$/i;
export const LARGE_BLOB_BYTES = 1_000_000;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// local = { user: 'windows user name' } adds the machine-specific checks (never written into a tracked file: derived at run time).
function localPatterns(local) {
  if (!local) return [];
  const pats = [
    { name: 'absolute Windows home path', re: /[A-Za-z]:[\\/]+Users[\\/]/g },
  ];
  if (local.user && local.user.length >= 3) pats.push({ name: 'this machine\'s Windows user name', re: new RegExp(`\\b${esc(local.user)}\\b`, 'gi') });
  return pats;
}
const ABS_INFO = /[A-Za-z]:[\\/]+git[\\/]/g;

function scanText(path, text, local, out, commit) {
  const where = { commit, path };
  const lines = text.split('\n');
  lines.forEach((l) => {
    for (const p of [...SECRET_PATTERNS, ...TOKEN_PATTERNS]) {
      for (const m of l.matchAll(p.re)) {
        const value = p.value ? p.value(m) : m[0];
        if (p.ignore && p.ignore(m)) continue;
        if (value === DOCUMENTED_LOCAL_PASSWORD) continue;
        out.findings.push({ ...where, kind: p.name });
      }
    }
    for (const p of localPatterns(local)) for (const _ of l.matchAll(p.re)) out.findings.push({ ...where, kind: p.name });
    if (local) for (const _ of l.matchAll(ABS_INFO)) out.infos.push({ ...where, kind: 'absolute local path (C:\\git\\...)' });
  });
}

// input: { diffText (git log -p --all), messages: [{commit, text}], paths: [string], blobs: [{size, path}], local }
export function scanHistory({ diffText = '', messages = [], paths = [], blobs = [], local = null }) {
  const out = { findings: [], infos: [], commits: 0 };
  let commit = '';
  let file = '';
  for (const raw of diffText.split('\n')) {
    if (raw.startsWith('commit ')) { commit = raw.slice(7, 14); out.commits++; continue; }
    if (raw.startsWith('+++ ')) { file = raw.startsWith('+++ b/') ? raw.slice(6) : ''; continue; }
    if (raw.startsWith('--- ') || raw.startsWith('diff ') || raw.startsWith('index ')) continue;
    if (raw.startsWith('+') && file && !SECRET_SCAN_EXEMPT.includes(file)) scanText(file, raw.slice(1), local, out, commit);
  }
  for (const m of messages) scanText('(commit message)', m.text, local, out, m.commit.slice(0, 7));
  for (const p of [...new Set(paths)].sort()) if (FORBIDDEN_PATH.test(p)) out.findings.push({ commit: '', path: p, kind: 'file that should never be public' });
  for (const b of blobs) if (b.size > LARGE_BLOB_BYTES) out.findings.push({ commit: '', path: b.path, kind: `blob larger than ${LARGE_BLOB_BYTES} bytes (${b.size})` });
  out.findings.sort((a, b) => `${a.commit}${a.path}${a.kind}`.localeCompare(`${b.commit}${b.path}${b.kind}`));
  return out;
}

export function formatFindings(findings, limit = 10) {
  const uniq = [...new Set(findings.map((f) => `${f.kind} at ${f.commit ? `commit ${f.commit}, ` : ''}${f.path}`))];
  return `${uniq.slice(0, limit).join('; ')}${uniq.length > limit ? `; ... ${uniq.length - limit} more` : ''}`;
}

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.split('\n')[0]}`);
  return r.stdout;
};

// Real input for a repository: every commit reachable from the refs scanned, all paths ever touched there, the biggest blobs.
// By default it scans what will be pushed: refs/heads/main and every tag. allRefs = true scans every ref (other branches, remotes, stashes).
export function gitHistory(cwd, local = null, allRefs = false) {
  const refs = allRefs ? ['--all'] : ['refs/heads/main', '--tags'];
  const diffText = git(cwd, ['log', '-p', ...refs, '--no-color', '--no-ext-diff', '--format=commit %H']);
  const msgs = git(cwd, ['log', ...refs, '--format=%H%x00%B%x01']).split('\x01').map((s) => s.trim()).filter(Boolean).map((s) => { const [commit, text] = s.split('\x00'); return { commit, text: text ?? '' }; });
  const paths = git(cwd, ['log', ...refs, '--name-only', '--format=']).split('\n').filter(Boolean);
  const objs = git(cwd, ['rev-list', '--objects', ...refs]);
  const batch = spawnSync('git', ['cat-file', '--batch-check=%(objecttype) %(objectsize) %(rest)'], { cwd, input: objs, encoding: 'utf8', maxBuffer: 1 << 28 });
  const blobs = batch.stdout.split('\n').filter((l) => l.startsWith('blob ')).map((l) => { const [, size, ...rest] = l.split(' '); return { size: Number(size), path: rest.join(' ') }; }).sort((a, b) => b.size - a.size);
  return { diffText, messages: msgs, paths, blobs: blobs.slice(0, 50), local, commits: msgs.length };
}
