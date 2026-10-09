// A tiny fake of the Conduit API and frontend for the verify tests. `fault` names one deliberate defect; 'none' is the healthy control.
import http from 'node:http';

export const FAULTS = [
  'none', 'tags-500', 'tags-no-array', 'register-422', 'login-401', 'login-no-token', 'me-wrong-user', 'create-500', 'create-alters-body',
  'create-alters-tags', 'readback-404', 'readback-differs', 'frontend-500', 'frontend-not-app',
];

export function startFake(fault = 'none') {
  const users = new Map();
  const articles = new Map();
  const send = (res, status, obj, type = 'application/json') => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const url = req.url;
      if (req.method === 'GET' && url === '/') {
        if (fault === 'frontend-500') return send(res, 500, 'boom', 'text/plain');
        if (fault === 'frontend-not-app') return send(res, 200, '<html><body>nginx default</body></html>', 'text/html');
        return send(res, 200, '<html><body><div id="app"></div></body></html>', 'text/html');
      }
      if (req.method === 'GET' && url === '/api/tags') {
        if (fault === 'tags-500') return send(res, 500, { errors: {} });
        if (fault === 'tags-no-array') return send(res, 200, { tags: 'none' });
        return send(res, 200, { tags: [] });
      }
      if (req.method === 'POST' && url === '/api/users') {
        if (fault === 'register-422') return send(res, 422, { errors: { email: ['bad'] } });
        const u = body.user;
        users.set(u.email, u);
        return send(res, 201, { user: { username: u.username, email: u.email, token: `tok-${u.username}` } });
      }
      if (req.method === 'POST' && url === '/api/users/login') {
        if (fault === 'login-401') return send(res, 401, { errors: { credentials: ['invalid'] } });
        const u = users.get(body.user.email);
        if (fault === 'login-no-token') return send(res, 200, { user: { username: u.username } });
        return send(res, 200, { user: { username: u.username, email: u.email, token: `tok-${u.username}` } });
      }
      if (req.method === 'GET' && url === '/api/user') {
        const tok = (req.headers.authorization ?? '').replace('Token tok-', '');
        return send(res, 200, { user: { username: fault === 'me-wrong-user' ? 'someone-else' : tok } });
      }
      if (req.method === 'POST' && url === '/api/articles') {
        if (fault === 'create-500') return send(res, 500, { errors: {} });
        const a = body.article;
        const username = (req.headers.authorization ?? '').replace('Token tok-', '');
        const article = {
          slug: a.title.replace(/\s+/g, '-'), title: a.title, description: a.description,
          body: fault === 'create-alters-body' ? `${a.body} (changed)` : a.body,
          tagList: fault === 'create-alters-tags' ? [] : a.tagList,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', favorited: false, favoritesCount: 0,
          author: { username, bio: null, image: null, following: false },
        };
        articles.set(article.slug, article);
        return send(res, 201, { article });
      }
      if (req.method === 'GET' && url.startsWith('/api/articles/')) {
        const slug = decodeURIComponent(url.slice('/api/articles/'.length));
        if (fault === 'readback-404') return send(res, 404, { errors: {} });
        const a = articles.get(slug);
        if (!a) return send(res, 404, { errors: {} });
        return send(res, 200, { article: fault === 'readback-differs' ? { ...a, description: 'other' } : a });
      }
      return send(res, 404, { errors: {} });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
  }));
}
