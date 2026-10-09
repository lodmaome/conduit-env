// The checks of tools/verify.mjs. All I/O is injected (`fetchFn`, `runDocker`), so tests drive them with a fake server and a fake runner.
// Every function returns { name, ok, text }; none throws for an expected failure. Node 22 stdlib only.
import { compareArticle, evaluateMigrations } from './verify-lib.mjs';

const TIMEOUT_MS = 10_000;

async function http(fetchFn, url, { method = 'GET', headers = {}, body } = {}) {
  let res;
  try {
    res = await fetchFn(url, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const why = err?.name === 'TimeoutError' ? `no answer within ${TIMEOUT_MS / 1000} s` : (err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err));
    return { error: `${method} ${url}: ${why}` };
  }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, text, json, contentType: res.headers.get('content-type') ?? '' };
}

export async function checkTags({ apiBase, fetchFn }) {
  const name = 'tags';
  const r = await http(fetchFn, `${apiBase}/tags`);
  if (r.error) return { name, ok: false, text: r.error };
  if (r.status !== 200) return { name, ok: false, text: `GET /api/tags -> ${r.status}, expected 200` };
  if (!Array.isArray(r.json?.tags)) return { name, ok: false, text: 'GET /api/tags -> 200 but the body has no "tags" array' };
  return { name, ok: true, text: 'GET /api/tags -> 200 with a tags array' };
}

// register -> log in -> read the current user -> create an article -> read it back and compare. The first failing step is reported.
// `secrets` collects the password and the token so the caller can redact them from any output.
export async function checkApiFlow({ apiBase, fetchFn }, data, secrets) {
  const name = 'api-flow';
  const fail = (step, text) => ({ name, ok: false, text: `step ${step}: ${text}` });
  const expect = (step, r, status) => (r.error ? fail(step, r.error) : r.status !== status ? fail(step, `expected ${status}, got ${r.status}`) : null);
  secrets.push(data.password);

  const reg = await http(fetchFn, `${apiBase}/users`, { method: 'POST', body: { user: { username: data.username, email: data.email, password: data.password } } });
  let bad = expect('register', reg, 201);
  if (bad) return bad;

  const login = await http(fetchFn, `${apiBase}/users/login`, { method: 'POST', body: { user: { email: data.email, password: data.password } } });
  bad = expect('login', login, 200);
  if (bad) return bad;
  const token = login.json?.user?.token;
  if (typeof token !== 'string' || token === '') return fail('login', 'the response has no user.token');
  secrets.push(token);
  const auth = { Authorization: `Token ${token}` };

  const me = await http(fetchFn, `${apiBase}/user`, { headers: auth });
  bad = expect('current-user', me, 200);
  if (bad) return bad;
  if (me.json?.user?.username !== data.username) return fail('current-user', 'GET /api/user returned a different user than the one that logged in');

  const created = await http(fetchFn, `${apiBase}/articles`, { method: 'POST', headers: auth, body: { article: data.article } });
  bad = expect('create-article', created, 201);
  if (bad) return bad;
  const mismatch = compareArticle(data.article, created.json?.article);
  if (mismatch.length) return fail('create-article', `the response differs from what was sent: ${mismatch.join('; ')}`);
  if (created.json.article.author?.username !== data.username) return fail('create-article', 'author.username is not the logged-in user');

  const slug = created.json.article.slug;
  const read = await http(fetchFn, `${apiBase}/articles/${encodeURIComponent(slug)}`);
  bad = expect('read-back', read, 200);
  if (bad) return bad;
  const mismatch2 = compareArticle(data.article, read.json?.article);
  if (mismatch2.length) return fail('read-back', `the stored article differs from what was sent: ${mismatch2.join('; ')}`);
  if (JSON.stringify(read.json.article) !== JSON.stringify(created.json.article)) return fail('read-back', 'the article read back differs from the create response');

  return { name, ok: true, text: 'register, login, current user, create article and read-back all agree (201, 200, 200, 201, 200)' };
}

export async function checkFrontend({ frontendBase, fetchFn }) {
  const name = 'frontend';
  const r = await http(fetchFn, `${frontendBase}/`);
  if (r.error) return { name, ok: false, text: r.error };
  if (r.status !== 200) return { name, ok: false, text: `GET / -> ${r.status}, expected 200` };
  if (!/text\/html/.test(r.contentType) || !/id="app"/.test(r.text)) return { name, ok: false, text: 'GET / -> 200 but it is not the app page (no text/html or no #app element)' };
  return { name, ok: true, text: 'GET / -> 200, the app page' };
}

// `runDocker(args)` -> { code, stdout, stderr }. Runs inside the running api container; writes nothing.
export async function checkMigrations({ runDocker }) {
  const name = 'migrations';
  let res;
  try {
    res = await runDocker(['compose', '-f', 'compose.yaml', '-p', 'conduit-env', 'exec', '-T', 'api', 'python', 'manage.py', 'makemigrations', '--check', '--dry-run']);
  } catch (err) {
    return { name, ok: false, text: `could not run docker compose exec: ${err?.message ?? err}` };
  }
  const v = evaluateMigrations(res);
  return { name, ok: v.ok, text: v.text };
}
