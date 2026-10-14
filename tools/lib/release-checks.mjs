// The checks of tools/release-gate.mjs. Node 22 stdlib only. Each check reads the repository through a `ctx` object, so the same check runs
// against the real tree (tools/release-gate.mjs) and against fixture trees (tools/lib/golden-tree.mjs, self-test mode).
//
// ctx = {
//   tag,                      candidate tag ('env-v1') or null
//   files(): string[]         tracked paths, sorted
//   read(path): string|undefined, exists(path): boolean
//   lockHashes(): string      the three lines of tools/lock-hashes.sh
//   composePorts(): Promise<object>   `docker compose -f compose.yaml config --format json`, parsed
//   links(paths): Promise<{code, text}>   internal links and anchors (lychee through tools/gate.sh)
//   seedsChangedSince(tag, paths): Promise<string[]> | tagExists(tag): Promise<boolean>
//   expectedLicense(): string
// }
// A check returns { ok, text } or { ok: true, skipped: true, text }. `fixture` says how to break a golden tree so that this check fails.
import { createHash } from 'node:crypto';
import { HEADER_KEYS, SNAPSHOT_KEY, parseLockHashes, parseSnapshot } from './openapi.mjs';

const lines = (s) => String(s ?? '').split(/\r?\n/);
const isComment = (l) => /^\s*(#|$)/.test(l);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Files that legitimately mention retired names or contain the strings these checks look for (record documents and the gate's own source).
export const RECORD_DOCS = [
  'docs/env/PHASE1-REPORT.md', 'docs/env/MILESTONE1-REPORT.md', 'docs/env/MILESTONE1-FOLLOWUP.md', 'docs/env/MILESTONE2-REPORT.md',
  'docs/env/adr/0001-pair-lock-and-migrations.md', 'docs/env/adr/0002-milestone2-decisions.md', 'docs/env/adr/0003-env-v2-deferrals.md',
  'docs/env/HOW-THIS-WAS-BUILT.md', 'docs/env/CHANGELOG.md', 'env/backend/lock-seed.txt',
  'tools/lib/release-checks.mjs', 'tools/lib/golden-tree.mjs', 'tools/test/release.test.mjs',
];
// `docs/attempt/.gitkeep` is a live seed path, so the attempt/ names only count when not preceded by `docs/`.
export const RETIRED_NAMES = [
  { name: 'constraints.txt', re: /constraints\.txt/ },
  { name: 'build-tools.txt', re: /build-tools\.txt/ },
  { name: 'attempt/compose.yaml', re: /(?<!docs\/)attempt\/compose\.yaml/ },
  { name: 'attempt/.gitkeep', re: /(?<!docs\/)attempt\/\.gitkeep/ },
];

// OWNED.txt / SEED.txt patterns: `*` stays inside one path segment, `**` crosses segments (including none).
export function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') { re += '.*'; i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export function ownedMatcher(ownedText, seedText) {
  const owned = lines(ownedText).filter((l) => !isComment(l)).map((l) => globToRegExp(l.trim()));
  const seeds = new Set(lines(seedText).filter((l) => !isComment(l)).map((l) => l.trim()));
  return (path) => seeds.has(path) || owned.some((r) => r.test(path));
}

export function parseEnvFile(text) {
  const out = {};
  for (const l of lines(text)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(l);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const textFiles = (ctx) => ctx.files().filter((f) => ctx.read(f) !== undefined);

// Credential-looking text. The documented local database password (the upstream default, "0000", published on 127.0.0.1 only) is the
// one exception, recognised by its VALUE wherever it appears (env/stack.yaml, the runbook, the reports that quote upstream's defaults).
export const DOCUMENTED_LOCAL_PASSWORD = '0000';
// The gate's own sources and tests hold deliberately fake secrets (fixtures for this very scan); nothing else is exempt.
export const SECRET_SCAN_EXEMPT = ['tools/lib/release-checks.mjs', 'tools/test/release.test.mjs'];
export const SECRET_PATTERNS = [
  { name: 'JWT-shaped string', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g },
  {
    name: 'credential assignment',
    re: /\b[A-Za-z_]*(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*(?<sep>[:=])\s*(?<val>"[^"]{4,}"|'[^']{4,}'|[A-Za-z0-9+/_!-]{4,}(?=[\s,;)]|$))/gi,
    // "secret: replaces every given secret" is prose, not a credential: with a colon, an unquoted all-letter value is ignored.
    ignore: (m) => m.groups.sep === ':' && /^[A-Za-z]+$/.test(m.groups.val),
    value: (m) => m.groups.val.replace(/^["']|["']$/g, ''),
  },
  { name: 'credentials in a URL', re: /:\/\/[^/\s:@]+:(?<val>[^/\s@]+)@/g, value: (m) => m.groups.val },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];
// Every match of every pattern, before any exemption (the presence control of the secret check uses this).
export function rawSecretMatches(text) {
  const out = [];
  lines(text).forEach((l, i) => {
    for (const p of SECRET_PATTERNS) {
      for (const m of l.matchAll(p.re)) {
        if (!(p.ignore && p.ignore(m))) out.push({ line: i + 1, pattern: p.name, value: p.value ? p.value(m) : m[0] });
      }
    }
  });
  return out;
}
export function findSecrets(path, text) {
  return rawSecretMatches(text)
    .filter((h) => h.value !== DOCUMENTED_LOCAL_PASSWORD)
    .map((h) => `${path}:${h.line} (${h.pattern})`);
}

// Fixture helper: rewrites the golden snapshot's x-conduit-env (fn mutates the header object), or removes it (fn === null).
function mutateSnapshot(tree, fn) {
  const p = Array.from(tree.keys()).find((k) => /^docs\/env\/contract\/openapi\.[0-9a-f]{7}\.json$/.test(k));
  const doc = JSON.parse(tree.get(p));
  if (fn === null) delete doc[SNAPSHOT_KEY]; else fn(doc[SNAPSHOT_KEY]);
  tree.set(p, `${JSON.stringify(doc, null, 2)}\n`);
}

// Fixture helper: edits the golden workflow file.
function editWf(tree, fn) {
  const p = '.github/workflows/env-x.yml';
  tree.set(p, fn(tree.get(p)));
}

const ok = (text) => ({ ok: true, text });
const no = (text) => ({ ok: false, text });
const skip = (text) => ({ ok: true, skipped: true, text });

export const CHECKS = [
  {
    id: 'changelog', num: 1, needsTag: true,
    title: 'CHANGELOG.md has an entry for the tag with class (pin|build|contract|docs) and merge (required|recommended|not needed)',
    async run(ctx) {
      const text = ctx.read('docs/env/CHANGELOG.md');
      if (text === undefined) return no('docs/env/CHANGELOG.md does not exist (a root CHANGELOG.md would not be OWNED)');
      const all = lines(text);
      const start = all.findIndex((l) => new RegExp(`^##\\s+${ctx.tag}(\\s|$)`).test(l));
      if (start < 0) return no(`no "## ${ctx.tag}" entry`);
      let end = all.findIndex((l, i) => i > start && /^##\s/.test(l));
      if (end < 0) end = all.length;
      const body = all.slice(start + 1, end);
      const cls = body.map((l) => /^-\s+class:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);
      const merge = body.map((l) => /^-\s+merge:\s*(.+?)\s*$/.exec(l)?.[1]).find(Boolean);
      if (!cls || !cls.split(/\s*,\s*/).every((c) => ['pin', 'build', 'contract', 'docs'].includes(c))) return no(`entry ${ctx.tag}: missing or invalid "- class:" (${cls ?? 'absent'}); allowed: pin, build, contract, docs`);
      if (!['required', 'recommended', 'not needed'].includes(merge)) return no(`entry ${ctx.tag}: missing or invalid "- merge:" (${merge ?? 'absent'}); allowed: required, recommended, not needed`);
      return ok(`entry ${ctx.tag}: class ${cls}, merge ${merge}`);
    },
    fixture: { mutate: (t) => t.set('docs/env/CHANGELOG.md', '# Changelog\n\n## env-v1 - 2026-01-01\n\n- class: banana\n- merge: required\n'), expect: /invalid "- class:"/ },
  },
  {
    id: 'working-agreement', num: 2, needsTag: true,
    title: 'no "NOT YET WRITTEN" in docs/env/WORKING-AGREEMENT.md',
    async run(ctx) {
      const t = ctx.read('docs/env/WORKING-AGREEMENT.md');
      if (t === undefined) return no('docs/env/WORKING-AGREEMENT.md does not exist');
      const n = lines(t).findIndex((l) => l.includes('NOT YET WRITTEN'));
      return n >= 0 ? no(`marker "NOT YET WRITTEN" at line ${n + 1}`) : ok('marker absent and the file exists');
    },
    fixture: { mutate: (t) => t.set('docs/env/WORKING-AGREEMENT.md', '# Working agreement\n\n## 2(d)\n\nNOT YET WRITTEN\n'), expect: /marker "NOT YET WRITTEN" at line 5/ },
  },
  {
    id: 'ownership', num: 3,
    title: 'every tracked file is OWNED or SEED',
    async run(ctx) {
      const owns = ownedMatcher(ctx.read('env/OWNED.txt'), ctx.read('env/SEED.txt'));
      // controls: the matcher accepts nested owned paths and seeds, and rejects attempt territory
      const controls = owns('env/deep/er/file.txt') && owns('.github/workflows/env-verify.yml') && owns('README.md') && owns('docs/attempt/.gitkeep')
        && !owns('attempt/tests/a.spec.ts') && !owns('.github/workflows/mine.yml') && !owns('package.json') && !owns('docs/env');
      if (!controls) return no('the ownership matcher failed its own controls (it must accept nested owned paths and seeds and reject attempt territory)');
      const bad = ctx.files().filter((f) => !owns(f));
      return bad.length ? no(`not OWNED or SEED: ${bad.join(', ')}`) : ok(`${ctx.files().length} tracked files, all OWNED or SEED (matcher controls pass)`);
    },
    fixture: { mutate: (t) => t.set('package.json', '{}\n'), expect: /not OWNED or SEED: package\.json/ },
  },
  {
    id: 'seeds-unchanged', num: 4, needsTag: true,
    title: 'seed files at HEAD equal their content at the tag env-v1 (env-v1 candidate with no tag yet: "first release: skipped", visibly)',
    async run(ctx) {
      const exists = await ctx.tagExists('env-v1');
      if (!exists && ctx.tag === 'env-v1') return skip('first release: skipped (the tag env-v1 does not exist yet, so there is nothing to compare against; once it exists the seed files are compared against it)');
      if (!exists) return no('the tag env-v1 does not exist, so "unchanged since env-v1" cannot be checked');
      const seeds = lines(ctx.read('env/SEED.txt')).filter((l) => !isComment(l)).map((l) => l.trim());
      const changed = await ctx.seedsChangedSince('env-v1', seeds);
      return changed.length ? no(`seed file changed since env-v1: ${changed.join(', ')}`) : ok(`${seeds.length} seed files compared against the tag env-v1: identical`);
    },
    fixtures: [
      { name: 'env-v2, a seed changed', mutate: () => {}, gitFixture: 'seed-changed', tag: 'env-v2', expect: /seed file changed since env-v1: README\.md/ },
      { name: 'env-v1 with its tag, a seed changed', mutate: () => {}, gitFixture: 'seed-changed', tag: 'env-v1', expect: /seed file changed since env-v1: README\.md/ },
      { name: 'env-v1 with its tag, a seed removed', mutate: () => {}, gitFixture: 'seed-removed', tag: 'env-v1', expect: /seed file changed since env-v1: LICENSE/ },
    ],
  },
  {
    id: 'snapshot-header', num: 5,
    title: 'snapshot x-conduit-env: backend sha7 and both lock hashes equal tools/lock-hashes.sh; the snapshot is valid JSON',
    async run(ctx) {
      const snaps = ctx.files().filter((f) => /^docs\/env\/contract\/openapi\.[0-9a-f]{7}\.json$/.test(f));
      if (snaps.length !== 1) return no(`expected exactly one docs/env/contract/openapi.<sha7>.json, found ${snaps.length}`);
      let snap;
      try { snap = parseSnapshot(ctx.read(snaps[0])); } catch (e) { return no(`${snaps[0]}: ${e.message}`); }
      const want = parseLockHashes(ctx.lockHashes());
      if (!snaps[0].includes(`openapi.${want['backend-sha7']}.json`)) return no(`the file name ${snaps[0]} does not carry the backend sha7 ${want['backend-sha7']}`);
      for (const k of HEADER_KEYS) {
        if (snap.header[k] !== want[k]) return no(`x-conduit-env.${k} differs: snapshot "${snap.header[k]}", tools/lock-hashes.sh "${want[k]}"`);
      }
      return ok(`${snaps[0]} is valid JSON and its x-conduit-env equals tools/lock-hashes.sh (3 values)`);
    },
    fixtures: [
      { name: 'changed sha7', mutate: (t) => mutateSnapshot(t, (h) => { h['backend-sha7'] = 'bbbbbbb'; }), expect: /x-conduit-env\.backend-sha7 differs: snapshot "bbbbbbb"/ },
      { name: 'changed requirements hash', mutate: (t) => mutateSnapshot(t, (h) => { h['requirements-lock-sha256'] = '0'.repeat(64); }), expect: /x-conduit-env\.requirements-lock-sha256 differs/ },
      { name: 'changed build-tools hash', mutate: (t) => mutateSnapshot(t, (h) => { h['build-tools-lock-sha256'] = '0'.repeat(64); }), expect: /x-conduit-env\.build-tools-lock-sha256 differs/ },
      { name: 'missing x-conduit-env', mutate: (t) => mutateSnapshot(t, null), expect: /no root key x-conduit-env/ },
      { name: 'not valid JSON', mutate: (t) => { const p = 'docs/env/contract/openapi.aaaaaaa.json'; t.set(p, `backend-sha7: aaaaaaa\n\n${t.get(p)}`); }, expect: /is not valid JSON/ },
    ],
  },
  {
    id: 'ports', num: 6,
    title: 'no compose port binds anything but 127.0.0.1 (rendered `-f compose.yaml` config); exactly the three ports',
    async run(ctx) {
      const cfg = await ctx.composePorts();
      const seen = [];
      for (const [svc, def] of Object.entries(cfg.services ?? {})) for (const p of def.ports ?? []) seen.push({ svc, host_ip: p.host_ip, published: String(p.published) });
      if (seen.length === 0) return no('the rendered config publishes no ports at all (cannot say "only 127.0.0.1")');
      const wrong = seen.filter((p) => p.host_ip !== '127.0.0.1');
      if (wrong.length) return no(`port(s) not bound to 127.0.0.1: ${wrong.map((p) => `${p.svc}:${p.published} on ${p.host_ip ?? 'all interfaces'}`).join(', ')}`);
      const got = seen.map((p) => p.published).sort().join(',');
      return got === '4180,4181,4182' ? ok('3 published ports (4180, 4181, 4182), all on 127.0.0.1') : no(`published ports are ${got}, expected 4180,4181,4182`);
    },
    fixture: { mutate: () => {}, ports: { services: { api: { ports: [{ host_ip: '0.0.0.0', published: '4181' }] }, db: { ports: [{ host_ip: '127.0.0.1', published: '4182' }] } } }, expect: /api:4181 on 0\.0\.0\.0/ },
  },
  {
    id: 'third-party-rows', num: 7,
    title: 'every pin (env/pins.env, env/gate/tools.env) has a THIRD-PARTY.md row',
    async run(ctx) {
      const tp = ctx.read('docs/env/THIRD-PARTY.md');
      if (tp === undefined) return no('docs/env/THIRD-PARTY.md does not exist');
      const rows = lines(tp).filter((l) => l.startsWith('|'));
      const pins = { ...parseEnvFile(ctx.read('env/pins.env')), ...parseEnvFile(ctx.read('env/gate/tools.env')) };
      const missing = [];
      for (const [k, v] of Object.entries(pins)) {
        const frag = (/sha256:([0-9a-f]{12})/.exec(v)?.[1]) ?? (/^[0-9a-f]{40}$/.test(v) ? v.slice(0, 12) : null);
        const row = rows.find((r) => r.includes(`\`${k}\``));
        if (!row) missing.push(`${k} (no row)`);
        else if (frag && !row.includes(frag)) missing.push(`${k} (row does not carry the pinned value ${frag}...; stale?)`);
        else if (!frag && !row.includes(v.replace(/^.*\//, '').split('@')[0].split(':')[0])) missing.push(`${k} (row does not name ${v})`);
      }
      return missing.length ? no(`pin(s) without a current row: ${missing.join('; ')}`) : ok(`${Object.keys(pins).length} pins, each with a row naming its key and pinned value`);
    },
    fixture: { mutate: (t) => t.set('docs/env/THIRD-PARTY.md', t.get('docs/env/THIRD-PARTY.md').replace(/^\| `BACKEND_SHA`.*\n/m, '')), expect: /BACKEND_SHA \(no row\)/ },
  },
  {
    id: 'stale-names', num: 8,
    title: 'no stale names in tracked files, outside an explicit allow-list of record documents',
    async run(ctx) {
      // presence control: the scan must see a retired name in a probe string, or it is blind
      if (!RETIRED_NAMES.every((n) => n.re.test(`probe ${n.name} probe`)) || RETIRED_NAMES.some((n) => n.re.test('docs/attempt/.gitkeep'))) return no('presence control failed: the name patterns must match a probe string and must not match docs/attempt/.gitkeep');
      const hits = [];
      for (const f of textFiles(ctx)) {
        if (RECORD_DOCS.includes(f)) continue;
        const t = ctx.read(f);
        for (const n of RETIRED_NAMES) if (n.re.test(t)) hits.push(`${f} mentions ${n.name}`);
      }
      // presence control: the scan must be able to see a record document that does mention a retired name (golden and real trees keep one)
      return hits.length ? no(`retired name(s): ${hits.join('; ')}`) : ok(`no retired name (${RETIRED_NAMES.map((n) => n.name).join(', ')}) in ${textFiles(ctx).length - RECORD_DOCS.filter((d) => ctx.exists(d)).length} scanned files; ${RECORD_DOCS.filter((d) => ctx.exists(d)).length} record documents exempt`);
    },
    fixture: { mutate: (t) => t.set('docs/env/reset-and-boot.md', 'see attempt/compose.yaml\n'), expect: /docs\/env\/reset-and-boot\.md mentions attempt\/compose\.yaml/ },
  },
  {
    id: 'no-override', num: 9,
    title: 'no tracked compose.override.y*ml',
    async run(ctx) {
      const bad = ctx.files().filter((f) => /(^|\/)compose\.override\.ya?ml$/.test(f));
      return bad.length ? no(`tracked override file(s): ${bad.join(', ')}`) : ok('no tracked compose.override.yaml or .yml');
    },
    fixture: { mutate: (t) => t.set('compose.override.yml', 'services: {}\n'), expect: /tracked override file\(s\): compose\.override\.yml/ },
  },
  {
    id: 'docs-attempt', num: 10,
    title: 'docs/attempt/ holds only .gitkeep',
    async run(ctx) {
      const inside = ctx.files().filter((f) => f.startsWith('docs/attempt/'));
      const extra = inside.filter((f) => f !== 'docs/attempt/.gitkeep');
      if (!inside.includes('docs/attempt/.gitkeep')) return no('docs/attempt/.gitkeep is missing');
      return extra.length ? no(`docs/attempt/ also holds: ${extra.join(', ')}`) : ok('docs/attempt/ holds only .gitkeep');
    },
    fixture: { mutate: (t) => t.set('docs/attempt/notes.md', 'x\n'), expect: /docs\/attempt\/ also holds: docs\/attempt\/notes\.md/ },
  },
  {
    id: 'secrets', num: 11,
    title: 'secret scan of tracked files (JWT-shaped strings, credential-looking lines; the documented local POSTGRES_PASSWORD is the one exception)',
    async run(ctx) {
      const scanned = textFiles(ctx).filter((f) => !SECRET_SCAN_EXEMPT.includes(f));
      const hits = scanned.flatMap((f) => findSecrets(f, ctx.read(f)));
      // presence control: the documented exception exists in this tree and would be flagged without its exemption
      const stack = ctx.read('env/stack.yaml') ?? '';
      const raw = rawSecretMatches(stack).filter((h) => h.value === DOCUMENTED_LOCAL_PASSWORD);
      if (raw.length === 0) return no('presence control failed: the documented local password (value 0000) in env/stack.yaml was not seen by the raw patterns, so the scan may be blind');
      return hits.length ? no(`${hits.length} finding(s): ${hits.slice(0, 8).join('; ')}`) : ok(`no finding in ${scanned.length} files, ${textFiles(ctx).length - scanned.length} exempt as synthetic fixtures (control: ${raw.length} raw pattern hit(s) in env/stack.yaml are the documented local database password)`);
    },
    fixture: { mutate: (t) => t.set('docs/env/notes.md', 'token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk\napi_key = abcdef1234567890\n'), expect: /2 finding\(s\)/ },
  },
  {
    id: 'license', num: 12,
    title: 'LICENSE has the exact MIT text and holder',
    async run(ctx) {
      const got = ctx.read('LICENSE');
      if (got === undefined) return no('LICENSE does not exist');
      const want = ctx.expectedLicense();
      const g = got.replace(/\r\n/g, '\n');
      if (g === want) return ok('LICENSE equals env/gate/license-mit.txt byte for byte (MIT, Copyright (c) 2026 lodmaome)');
      const gl = g.split('\n'); const wl = want.split('\n');
      const i = wl.findIndex((l, k) => l !== gl[k]);
      return no(`LICENSE differs at line ${i + 1}: has "${gl[i] ?? '(end of file)'}", expected "${wl[i] ?? '(end of file)'}"`);
    },
    fixture: { mutate: (t) => t.set('LICENSE', t.get('LICENSE').replace('lodmaome', 'someone else')), expect: /LICENSE differs at line 3/ },
  },
  {
    id: 'python-licences', num: 13,
    title: 'docs/env/third-party/python-licences.txt names the requirements lock hash it was generated from, and it matches the current lock',
    async run(ctx) {
      const t = ctx.read('docs/env/third-party/python-licences.txt');
      if (t === undefined) return no('docs/env/third-party/python-licences.txt does not exist');
      const had = /^requirements-lock-sha256: ([0-9a-f]{64})$/m.exec(t)?.[1];
      if (!had) return no('the file has no "requirements-lock-sha256: <64 hex>" header line');
      const now = /requirements-lock-sha256: ([0-9a-f]{64})/.exec(ctx.lockHashes())?.[1];
      return had === now ? ok(`generated from requirements.lock.txt ${had.slice(0, 12)}..., which is the current lock`) : no(`generated from lock ${had.slice(0, 12)}..., but the current lock is ${now?.slice(0, 12)}...: regenerate with tools/python-licences.sh`);
    },
    fixture: { mutate: (t) => t.set('docs/env/third-party/python-licences.txt', t.get('docs/env/third-party/python-licences.txt').replace(/lock-sha256: [0-9a-f]{64}/, `lock-sha256: ${'1'.repeat(64)}`)), expect: /but the current lock is/ },
  },
  {
    id: 'internal-links', num: 14,
    title: 'internal links and anchors resolve (lychee, offline, through tools/gate.sh)',
    async run(ctx) {
      const r = await ctx.links();
      return r.code === 0 ? ok('lychee: all internal links and anchors resolve') : no(`lychee exited ${r.code}: ${String(r.text).split('\n').filter(Boolean).slice(0, 6).join(' | ')}`);
    },
    fixture: { mutate: () => {}, links: { code: 2, text: '[ERROR] missing-file.md | Cannot find file' }, expect: /lychee exited 2/ },
  },
  {
    id: 'rule-scopes', num: 15,
    title: 'every numbered rule of WORKING-AGREEMENT.md section 1 carries a scope tag, or every part of it does',
    async run(ctx) {
      const t = ctx.read('docs/env/WORKING-AGREEMENT.md');
      if (t === undefined) return no('docs/env/WORKING-AGREEMENT.md does not exist');
      const all = lines(t);
      const start = all.findIndex((l) => /^## 1\./.test(l));
      if (start < 0) return no('no "## 1." section');
      let end = all.findIndex((l, i) => i > start && /^## /.test(l));
      if (end < 0) end = all.length;
      const sec = all.slice(start + 1, end);
      const rules = [];
      for (const l of sec) {
        const m = /^(\d+)\. /.exec(l);
        if (m) rules.push({ n: Number(m[1]), head: l, parts: [] });
        else if (rules.length && /^ {3}- /.test(l)) rules[rules.length - 1].parts.push(l);
      }
      if (rules.length === 0) return no('section 1 has no numbered rules');
      const TAG = /\*\*\[(everyone|environment repo only|attempts only)\]\*\*/;
      for (const r of rules) {
        if (TAG.test(r.head)) continue;
        if (r.parts.length === 0) return no(`rule ${r.n} has no scope tag (use **[everyone]**, **[environment repo only]** or **[attempts only]**)`);
        const bare = r.parts.find((p) => !TAG.test(p));
        if (bare) return no(`rule ${r.n}: sub-bullet without a scope tag: "${bare.trim().slice(0, 50)}"`);
      }
      return ok(`${rules.length} rules, each tagged on its own line or on every part`);
    },
    fixtures: [
      { name: 'a rule without a tag', mutate: (t) => t.set('docs/env/WORKING-AGREEMENT.md', t.get('docs/env/WORKING-AGREEMENT.md').replace('3. **[everyone]** ', '3. ')), expect: /rule 3 has no scope tag/ },
      { name: 'a split rule with an untagged part', mutate: (t) => t.set('docs/env/WORKING-AGREEMENT.md', t.get('docs/env/WORKING-AGREEMENT.md').replace('   - **[attempts only]** b', '   - b')), expect: /rule 4: sub-bullet without a scope tag/ },
      { name: 'no numbered rules', mutate: (t) => t.set('docs/env/WORKING-AGREEMENT.md', '# Working agreement\n\n## 1. Working rules\n\nnothing\n\n## 2. Tests\n'), expect: /no numbered rules/ },
    ],
  },
  {
    id: 'history-scan', num: 16,
    title: 'every reachable commit (not only the tree): no token-shaped strings, no password other than the documented local one, no file that should never be public; with --local also this machine\'s user name and C:\\Users paths',
    async run(ctx) {
      // presence control: the scan must see a token that only ever existed in an old commit, or it is blind
      const probeToken = `${'gh'}p_${'A'.repeat(36)}`;
      const probe = ctx.scanHistory({ diffText: `commit 0000000aaaa\n+++ b/probe.txt\n+x = ${probeToken}\n`, paths: ['probe/x.tar'] });
      if (probe.findings.length < 2) return no('presence control failed: the scan did not see a token in an old commit and a forbidden path, so it may be blind');
      const input = ctx.historyInput();
      const r = ctx.scanHistory(input);
      const local = input.local ? ` (local mode: user name and absolute paths included; ${r.infos.length} info line(s) about C:\\git\\... paths)` : '';
      if (r.findings.length) return no(`${r.findings.length} finding(s) in ${r.commits} commits: ${ctx.formatFindings(r.findings)}${local}`);
      return ok(`${r.commits} commits, all added lines, commit messages and ${input.paths.length} path entries scanned: no finding; largest blob ${input.blobs[0]?.size ?? 0} bytes${local}`);
    },
    fixtures: [
      { name: 'a token in an old commit that a later commit removed', mutate: () => {}, historyInput: { diffText: `commit 1111111aaaa\n+++ b/notes.txt\n+token = ${'gh'}p_${'B'.repeat(36)}\ncommit 2222222bbbb\n+++ b/notes.txt\n-token = removed\n` }, expect: /GitHub token at commit 1111111, notes\.txt/ },
      { name: 'a password other than the documented one, in an old commit', mutate: () => {}, historyInput: { diffText: 'commit 3333333cccc\n+++ b/x.env\n+DB_PASSWORD=hunter2hunter2\n' }, expect: /credential assignment at commit 3333333, x\.env/ },
      { name: 'a tar archive in history', mutate: () => {}, historyInput: { paths: ['m2-evidence/t0.2/src.tar'] }, expect: /file that should never be public at m2-evidence\/t0\.2\/src\.tar/ },
      { name: 'an evidence folder in history', mutate: () => {}, historyInput: { paths: ['x-evidence/log.txt'] }, expect: /file that should never be public at x-evidence\/log\.txt/ },
      { name: 'a blob over 1 MB', mutate: () => {}, historyInput: { blobs: [{ size: 5_000_000, path: 'big.bin' }] }, expect: /blob larger than 1000000 bytes \(5000000\) at big\.bin/ },
      { name: 'local mode: this machine\'s user name', mutate: () => {}, historyInput: { local: { user: 'someuser' }, diffText: 'commit 4444444dddd\n+++ b/a.md\n+see someuser here\n' }, expect: /user name at commit 4444444, a\.md/ },
      { name: 'local mode: a C:\\Users path', mutate: () => {}, historyInput: { local: { user: 'someuser' }, diffText: `commit 5555555eeee\n+++ b/a.md\n+path C:\\${'Users'}\\somebody\\x\n` }, expect: /absolute Windows home path at commit 5555555, a\.md/ },
    ],
  },
  {
    id: 'workflow-rules', num: 17,
    title: 'workflows: every uses: pinned by a 40-hex SHA with its tag in a comment and a THIRD-PARTY row; top-level permissions; timeout-minutes on every job; no pull_request_target; no secrets',
    async run(ctx) {
      const wfs = ctx.files().filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
      if (wfs.length === 0) return skip('0 workflow files (.github/workflows/ is empty): nothing to check; this is reported, not a pass');
      const tp = lines(ctx.read('docs/env/THIRD-PARTY.md') ?? '').filter((l) => l.startsWith('|'));
      const bad = [];
      for (const f of wfs) {
        const raw = lines(ctx.read(f));
        const code = raw.filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s#.*$/, ''));
        if (!code.some((l) => /^permissions:/.test(l))) bad.push(`${f}: no top-level permissions:`);
        if (code.some((l) => /pull_request_target/.test(l))) bad.push(`${f}: uses pull_request_target`);
        if (code.some((l) => /\bsecrets\b/.test(l))) bad.push(`${f}: refers to secrets`);
        raw.forEach((l, i) => {
          const m = /^\s*-?\s*uses:\s*(\S+)(.*)$/.exec(l);
          if (!m || m[1].startsWith('./')) return;
          const at = /^([^@\s]+)@([0-9a-f]{40})$/.exec(m[1]);
          if (!at) { bad.push(`${f}:${i + 1}: ${m[1]} is not pinned by a full 40-hex commit SHA`); return; }
          if (!/^\s*#\s*\S+/.test(m[2])) bad.push(`${f}:${i + 1}: ${at[1]}@${at[2].slice(0, 7)}... has no tag in a trailing comment`);
          const repo = at[1].split('/').slice(0, 2).join('/');
          if (!tp.some((r) => r.includes(repo) && r.includes(at[2].slice(0, 12)))) bad.push(`${f}:${i + 1}: no THIRD-PARTY.md row with ${repo} and ${at[2].slice(0, 12)}`);
        });
        // every job that does not call a reusable workflow needs timeout-minutes (a calling job cannot carry it)
        const jobsAt = raw.findIndex((l) => /^jobs:\s*$/.test(l));
        if (jobsAt < 0) { bad.push(`${f}: no jobs:`); continue; }
        const heads = [];
        for (let i = jobsAt + 1; i < raw.length; i++) if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(raw[i])) heads.push(i);
        heads.forEach((h, k) => {
          const body = raw.slice(h + 1, heads[k + 1] ?? raw.length);
          const name = raw[h].trim().replace(/:$/, '');
          if (body.some((l) => /^ {4}uses:/.test(l))) return;
          if (!body.some((l) => /^ {4}timeout-minutes:\s*\d+/.test(l))) bad.push(`${f}: job ${name} has no timeout-minutes`);
        });
      }
      return bad.length ? no(bad.join('; ')) : ok(`${wfs.length} workflow file(s): SHA-pinned uses with tag comments and THIRD-PARTY rows, permissions present, timeouts present, no pull_request_target, no secrets`);
    },
    fixtures: [
      { name: 'unpinned uses', mutate: (t) => editWf(t, (s) => s.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v4')), expect: /actions\/checkout@v4 is not pinned by a full 40-hex commit SHA/ },
      { name: 'pinned by SHA without a tag comment', mutate: (t) => editWf(t, (s) => s.replace(/ # v7\.0\.1/, '')), expect: /has no tag in a trailing comment/ },
      { name: 'a pinned action without a THIRD-PARTY row', mutate: (t) => t.set('docs/env/THIRD-PARTY.md', t.get('docs/env/THIRD-PARTY.md').split('\n').filter((l) => !l.includes('actions/checkout')).join('\n')), expect: /no THIRD-PARTY\.md row with actions\/checkout/ },
      { name: 'no top-level permissions', mutate: (t) => editWf(t, (s) => s.replace(/^permissions:\n {2}contents: read\n/m, '')), expect: /no top-level permissions:/ },
      { name: 'a job without timeout-minutes', mutate: (t) => editWf(t, (s) => s.replace(/ {4}timeout-minutes: 5\n/, '')), expect: /job verify has no timeout-minutes/ },
      { name: 'pull_request_target', mutate: (t) => editWf(t, (s) => s.replace('pull_request:', 'pull_request_target:')), expect: /uses pull_request_target/ },
      { name: 'a secret', mutate: (t) => editWf(t, (s) => `${s}        env:\n          TOKEN: \${{ secrets.TOKEN }}\n`), expect: /refers to secrets/ },
    ],
  },
  // ---- ported from the Milestone 1 gate ----
  {
    id: 'root-files', num: 'M1a',
    title: 'no root .gitignore, .gitattributes, .env or .dockerignore (attempt territory); nested .gitattributes present',
    async run(ctx) {
      const root = ['.gitignore', '.gitattributes', '.env', '.dockerignore'].filter((f) => ctx.exists(f) || ctx.files().includes(f));
      if (root.length) return no(`root file(s) that belong to attempts: ${root.join(', ')}`);
      const nested = ['env/.gitattributes', 'tools/.gitattributes'].filter((f) => !ctx.exists(f));
      return nested.length ? no(`nested .gitattributes missing: ${nested.join(', ')}`) : ok('no root .gitignore/.gitattributes/.env/.dockerignore; env/ and tools/ have their .gitattributes');
    },
    fixture: { mutate: (t) => t.set('.gitignore', 'node_modules\n'), expect: /root file\(s\).*\.gitignore/ },
  },
  {
    id: 'pins-used', num: 'M1b',
    title: 'every pin key is used (env/stack.yaml for pins.env, tools/gate.sh for tools.env)',
    async run(ctx) {
      const unused = [];
      for (const k of Object.keys(parseEnvFile(ctx.read('env/pins.env')))) if (!(ctx.read('env/stack.yaml') ?? '').includes(`\${${k}`)) unused.push(`${k} (not in env/stack.yaml)`);
      for (const k of Object.keys(parseEnvFile(ctx.read('env/gate/tools.env')))) if (!(ctx.read('tools/gate.sh') ?? '').includes(`$${k}`)) unused.push(`${k} (not in tools/gate.sh)`);
      return unused.length ? no(`unused pin(s): ${unused.join('; ')}`) : ok('every pin key is consumed');
    },
    fixture: { mutate: (t) => t.set('env/pins.env', `${t.get('env/pins.env')}UNUSED_THING=1\n`), expect: /UNUSED_THING \(not in env\/stack\.yaml\)/ },
  },
  {
    id: 'no-repeated-pins', num: 'M1c',
    title: 'no full SHA or digest repeated outside env/pins.env, env/gate/tools.env and the generated lock files',
    async run(ctx) {
      const scope = (f) => f === 'compose.yaml' || f === 'env/stack.yaml' || f.startsWith('env/frontend/') || /^env\/backend\/Dockerfile/.test(f) || f.startsWith('tools/') || f === 'docs/env/reset-and-boot.md';
      const skipFile = (f) => RECORD_DOCS.includes(f) || /^tools\/test\//.test(f);
      const hits = [];
      for (const f of textFiles(ctx).filter((x) => scope(x) && !skipFile(x))) {
        lines(ctx.read(f)).forEach((l, i) => { if (/[0-9a-f]{40}|sha256:[0-9a-f]{64}/.test(l)) hits.push(`${f}:${i + 1}`); });
      }
      return hits.length ? no(`pin repeated at ${hits.join(', ')}`) : ok('no SHA or digest repeated in compose.yaml, env/stack.yaml, the Dockerfiles, tools/ or the runbook');
    },
    fixture: { mutate: (t) => t.set('env/frontend/Dockerfile', `FROM x@sha256:${'a'.repeat(64)}\n`), expect: /pin repeated at env\/frontend\/Dockerfile:1/ },
  },
  {
    id: 'no-crlf', num: 'M1d',
    title: 'no CRLF in tracked text files',
    async run(ctx) {
      const bad = ctx.crlfInIndex();
      return bad.length ? no(`CR characters in the committed content of: ${bad.join(', ')}`) : ok('no CRLF or mixed line endings in any committed file (the index is checked, not the working tree)');
    },
    fixture: { mutate: (t) => t.set('tools/x.sh', '#!/bin/sh\r\necho hi\r\n'), expect: /CR characters in the committed content of: tools\/x\.sh/ },
  },
  {
    id: 'lock-names', num: 'M1e',
    title: 'lock files have their final names and the old ones are gone',
    async run(ctx) {
      const need = ['env/backend/requirements.lock.txt', 'env/backend/build-tools.lock.txt'].filter((f) => !ctx.exists(f));
      const old = ['env/backend/constraints.txt', 'env/backend/build-tools.txt'].filter((f) => ctx.exists(f));
      if (need.length || old.length) return no(`missing: ${need.join(', ') || 'none'}; old names still present: ${old.join(', ') || 'none'}`);
      return ok('requirements.lock.txt and build-tools.lock.txt exist, old names absent');
    },
    fixture: { mutate: (t) => t.set('env/backend/constraints.txt', 'x\n'), expect: /old names still present: env\/backend\/constraints\.txt/ },
  },
  {
    id: 'boot-path-check', num: 'M1f',
    title: 'no `--check` outside comments in env/stack.yaml (the migrations check is not in the boot path)',
    async run(ctx) {
      const code = lines(ctx.read('env/stack.yaml') ?? '').filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s#.*$/, '')).join('\n');
      return /--check/.test(code) ? no('env/stack.yaml contains --check outside a comment (the migrations check must not be in the boot path)') : ok('no --check outside comments in env/stack.yaml (a comment may mention it)');
    },
    fixture: { mutate: (t) => t.set('env/stack.yaml', `${t.get('env/stack.yaml')}    command: [python, manage.py, makemigrations, --check]\n`), expect: /contains --check outside a comment/ },
  },
];

// Every check has one or more failing fixtures; a check that defines only `fixture` gets a one-element `fixtures`.
for (const c of CHECKS) c.fixtures ??= [c.fixture];

export { sha256 };
