// Pure helpers for tools/browser-check.mjs (no I/O except the marker/profile path arithmetic, which takes its inputs as arguments).
// Node 22 stdlib only.
import { resolve, sep, basename } from 'node:path';

export const EXIT_COULD_NOT_RUN = 90;
// The API origin the frontend's own source falls back to when VITE_API_URL is unset (docs/env/PHASE1-REPORT.md, K5 scoping: the Vue
// config reads `VITE_API_URL || "https://api.realworld.show/api"`). A correctly built frontend sends no Fetch/XHR there.
export const OLD_ORIGIN = 'https://api.realworld.show';
// The origin baked into the build: env/stack.yaml VITE_API_URL=http://localhost:4181/api.
export const EXPECTED_API_ORIGIN = 'http://localhost:4181';
export const PROFILE_PREFIX = 'conduit-env-chrome-';
export const MARKER_NAME = '.conduit-env-browser-check';

const API_TYPES = new Set(['Fetch', 'XHR']);

// The profile directory may be created and deleted by this tool only: under the temp dir, with our prefix and our marker.
// Returns null when safe, otherwise the reason it is not.
export function profileDirProblem(dir, tmpdir, markerContent, expectedToken) {
  const d = resolve(dir);
  const t = resolve(tmpdir);
  if (!d.startsWith(t + sep)) return `${d} is not under the temp directory ${t}`;
  if (!basename(d).startsWith(PROFILE_PREFIX)) return `${d} does not carry the prefix ${PROFILE_PREFIX}`;
  if (markerContent !== expectedToken) return `${d} has no marker file with this run's token`;
  return null;
}

// First line of Chrome's DevToolsActivePort file is the port, the second the browser websocket path.
export function parseDevToolsActivePort(text) {
  const [port, path] = String(text).split(/\r?\n/);
  if (!/^\d+$/.test(port ?? '') || !(path ?? '').startsWith('/devtools/browser/')) return null;
  return { port: Number(port), path };
}

const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };

// requests: [{ url, type }] seen by CDP Network.requestWillBeSent. failures: [{ url, errorText }] from Network.loadingFailed.
// Returns { assertions: [{ name, ok, text }], info: [string] }. Deterministic: sorted, no timing.
export function evaluateRequests({ requests, failures, expectedOrigin, oldOrigin = OLD_ORIGIN, titleSeen, title }) {
  const api = requests.filter((r) => API_TYPES.has(r.type));
  const apiOrigins = [...new Set(api.map((r) => originOf(r.url)).filter(Boolean))].sort();
  const toOld = api.filter((r) => originOf(r.url) === oldOrigin);
  const apiFailures = failures.filter((f) => API_TYPES.has(f.type));
  const assertions = [];

  const originOk = api.length > 0 && apiOrigins.length === 1 && apiOrigins[0] === expectedOrigin;
  assertions.push({
    name: 'api-origin',
    ok: originOk,
    text: originOk
      ? `${api.length} Fetch/XHR requests, all to ${expectedOrigin}`
      : api.length === 0
        ? `expected API origin ${expectedOrigin}, observed no Fetch/XHR requests at all`
        : `expected API origin ${expectedOrigin}, observed ${apiOrigins.join(', ')} (${api.length} Fetch/XHR requests)`,
  });

  assertions.push({
    name: 'no-old-origin',
    ok: toOld.length === 0 && api.length > 0,
    text: api.length === 0
      ? `cannot say: the collector saw no Fetch/XHR requests at all, so "0 to ${oldOrigin}" would prove nothing`
      : toOld.length === 0 ? `0 of ${api.length} Fetch/XHR requests went to ${oldOrigin}` : `${toOld.length} Fetch/XHR request(s) went to ${oldOrigin}: ${toOld.slice(0, 3).map((r) => r.url).join(', ')}`,
  });

  if (apiFailures.length) {
    const reasons = [...new Set(apiFailures.map((f) => f.errorText))].sort().join(', ');
    assertions.push({ name: 'api-content', ok: false, text: `${apiFailures.length} API request(s) failed (${reasons}) and the page did not render the article "${title}"` });
  } else {
    assertions.push({
      name: 'api-content',
      ok: Boolean(titleSeen),
      text: titleSeen ? `the page shows the article title "${title}", which only the API knows` : `the page does not show the article "${title}" although no API request failed`,
    });
  }

  const info = [];
  const otherOld = requests.filter((r) => !API_TYPES.has(r.type) && originOf(r.url) === oldOrigin);
  info.push(otherOld.length ? `informational: ${otherOld.length} non-Fetch/XHR request(s) to ${oldOrigin}: ${[...new Set(otherOld.map((r) => `${r.type} ${r.url}`))].sort().join('; ')}` : `informational: no non-Fetch/XHR request to ${oldOrigin}`);
  return { assertions, info };
}

// Informational: every host the page requested other than the stack's own (localhost and 127.0.0.1 on ports 4180 to 4182), http(s) only,
// sorted and unique. Never part of a verdict.
const OWN_PORTS = new Set(['4180', '4181', '4182']);
export function externalHosts(requests) {
  const hosts = new Set();
  for (const r of requests) {
    let u;
    try { u = new URL(r.url); } catch { continue; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && OWN_PORTS.has(u.port)) continue;
    hosts.add(u.hostname);
  }
  return [...hosts].sort();
}
