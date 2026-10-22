const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_BODY_BYTES = 512_000;

export function parseHttpUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error(`Invalid URL: ${value}`); }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not supported.');
  return url;
}

async function readLimitedText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let count = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > MAX_BODY_BYTES) throw new Error(`Response body exceeds ${MAX_BODY_BYTES} bytes`);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Fetch with explicit redirect tracing and a conservative response size cap. */
export async function fetchWithTrace(input, { timeoutMs = 8000, maxRedirects = 8 } = {}) {
  const initial = parseHttpUrl(input);
  initial.hash = '';
  let target = initial.href;
  const seen = new Set();
  const redirects = [];
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (seen.has(target)) {
      return { ok: false, errorCode: 'REDIRECT_LOOP', error: `Redirect loop detected at ${target}`, redirects, finalUrl: target };
    }
    seen.add(target);
    let response;
    try {
      response = await fetch(target, {
        redirect: 'manual',
        headers: { 'user-agent': 'RouteDoctor/0.1 (+https://github.com/mohitmalayanandy/route-doctor)', accept: 'text/html,application/xml,text/plain;q=0.9,*/*;q=0.5' },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (e) {
      return { ok: false, errorCode: 'FETCH_FAILED', error: `Request failed for ${target}: ${e.message}`, redirects, finalUrl: target };
    }
    if (REDIRECT_CODES.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) return { ok: false, errorCode: 'MISSING_LOCATION', error: `HTTP ${response.status} without Location header at ${target}`, redirects, finalUrl: target };
      let next;
      try {
        const resolved = parseHttpUrl(new URL(location, target).href);
        resolved.hash = '';
        next = resolved.href;
      }
      catch { return { ok: false, errorCode: 'UNSAFE_REDIRECT', error: `Invalid redirect target: ${location}`, redirects, finalUrl: target }; }
      redirects.push({ from: target, status: response.status, to: next });
      if (seen.has(next)) {
        return { ok: false, errorCode: 'REDIRECT_LOOP', error: `Redirect loop detected: ${next}`, redirects, finalUrl: next };
      }
      if (hop >= maxRedirects) {
        return { ok: false, errorCode: 'REDIRECT_LIMIT', error: `Exceeded ${maxRedirects} redirects`, redirects, finalUrl: next };
      }
      target = next;
      continue;
    }
    try {
      const body = await readLimitedText(response);
      return {
        ok: true,
        finalUrl: target,
        redirects,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body
      };
    } catch (e) {
      return { ok: false, errorCode: 'BODY_READ_FAILED', error: `Could not read ${target}: ${e.message}`, redirects, finalUrl: target };
    }
  }
  return { ok: false, errorCode: 'REDIRECT_LIMIT', error: 'Too many redirects', redirects, finalUrl: target };
}
