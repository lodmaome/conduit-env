// Pure part of tools/pin-drift.mjs: classify the pins, compare them with what the remotes say now, format the table. Node 22 stdlib only.

export function parseEnv(text) {
  const out = {};
  for (const l of String(text).split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(l);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// pins -> [{ name, kind: 'repo' | 'image' | 'derived' | 'invalid', ... }] in a deterministic order (by key).
export function classify(pins) {
  const items = [];
  for (const k of Object.keys(pins).sort()) {
    const v = pins[k];
    if (k.endsWith('_REPO')) continue; // paired with its _SHA below
    if (k.endsWith('_SHA') && pins[k.replace(/_SHA$/, '_REPO')]) {
      items.push({ name: k.replace(/_SHA$/, ''), kind: 'repo', repo: pins[k.replace(/_SHA$/, '_REPO')], pinned: v });
    } else if (k.endsWith('_SHA')) {
      items.push({ name: k, kind: 'derived', pinned: v, note: 'derived from another pin; the frontend build checks it' });
    } else if (k.endsWith('_IMAGE')) {
      const m = /^(.+?)@sha256:([0-9a-f]{64})$/.exec(v);
      items.push(m ? { name: k.replace(/_IMAGE$/, ''), kind: 'image', ref: m[1], pinned: `sha256:${m[2]}` } : { name: k, kind: 'invalid', pinned: v, note: 'not name@sha256:digest' });
    }
  }
  return items;
}

// "<sha>\tHEAD" line of `git ls-remote <repo> HEAD`
export function parseLsRemoteHead(out) {
  const m = /^([0-9a-f]{40})\s+HEAD$/m.exec(String(out));
  return m ? m[1] : null;
}
// first "Digest:" line of `docker buildx imagetools inspect <ref>` (the top-level index, not a platform manifest)
export function parseImagetoolsDigest(out) {
  const m = /^Digest:\s+(sha256:[0-9a-f]{64})\s*$/m.exec(String(out));
  return m ? m[1] : null;
}

// resolvers: { head(repoUrl) -> sha, digest(ref) -> 'sha256:..' }; either may throw, which makes an ERROR row (visible, non-zero).
export async function compare(items, resolvers) {
  const rows = [];
  for (const it of items) {
    if (it.kind === 'derived') { rows.push({ name: it.name, what: 'derived', pinned: it.pinned, current: '-', status: 'SKIP', note: it.note }); continue; }
    if (it.kind === 'invalid') { rows.push({ name: it.name, what: 'invalid pin', pinned: it.pinned, current: '-', status: 'ERROR', note: it.note }); continue; }
    try {
      const current = it.kind === 'repo' ? await resolvers.head(it.repo) : await resolvers.digest(it.ref);
      if (!current) throw new Error('the remote returned nothing readable');
      const what = it.kind === 'repo' ? `default branch head of ${it.repo.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')}` : `${it.ref} now resolves to`;
      rows.push({ name: it.name, what, pinned: it.pinned, current, status: current === it.pinned ? 'ok' : 'DRIFT' });
    } catch (e) {
      rows.push({ name: it.name, what: it.kind === 'repo' ? it.repo : it.ref, pinned: it.pinned, current: '-', status: 'ERROR', note: e.message });
    }
  }
  return rows;
}

const short = (s) => (s.startsWith('sha256:') ? `sha256:${s.slice(7, 19)}...` : s.length === 40 ? `${s.slice(0, 12)}...` : s);
export function toMarkdown(rows) {
  const lines = ['| Pin | Compared with | Pinned | Now | Status |', '|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| \`${r.name}\` | ${r.what}${r.note ? ` (${r.note})` : ''} | \`${short(r.pinned)}\` | ${r.current === '-' ? '-' : `\`${short(r.current)}\``} | ${r.status} |`);
  const bad = exitCode(rows);
  lines.push('', bad ? `**${bad} pin(s) drifted or could not be checked.** This workflow never edits pins; changing one is an env change (class \`pin\`).` : 'No drift: every checked pin equals what its remote says now.');
  return `${lines.join('\n')}\n`;
}
export const exitCode = (rows) => rows.filter((r) => r.status === 'DRIFT' || r.status === 'ERROR').length;
