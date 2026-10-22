import { fetchWithTrace, parseHttpUrl } from './http.js';

const check = (severity, code, message) => ({ severity, code, message });

export function getAttributes(tag) {
  const attrs = {};
  const rest = tag.replace(/^<\s*\/?\s*[a-zA-Z][\w:-]*/, '').replace(/\/?\s*>$/, '');
  const pattern = /([a-zA-Z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of rest.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

export function getPageMetadata(html) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => getAttributes(m[0]));
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => getAttributes(m[0]));
  const canonicals = links.filter(a => (a.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')).map(a => a.href).filter(Boolean);
  const robots = metas.filter(a => ['robots', 'googlebot'].includes((a.name ?? '').toLowerCase())).map(a => a.content ?? '').join(',');
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  return { canonicals, robots, title };
}

export function normalizeComparableUrl(value) {
  const u = parseHttpUrl(value);
  u.hash = '';
  return u.href;
}

// Directives that carry a value; "max-image-preview:none" must not read as `none`.
const VALUE_DIRECTIVES = /(?:max-snippet|max-image-preview|max-video-preview|unavailable_after)\s*:[^,]*/g;

/** True if a robots meta / X-Robots-Tag value has `noindex` or its alias `none`. */
export function hasNoindex(value) {
  return value.toLowerCase().replace(VALUE_DIRECTIVES, '').split(',').some(token =>
    token.replace(/^\s*[\w-]+\s*:/, '').split(/\s+/).some(word => word === 'noindex' || word === 'none'));
}

function addPageChecks(page, checks) {
  if (!page.ok) {
    checks.push(check('error', page.errorCode, page.error));
    return;
  }
  if (page.status < 200 || page.status > 299) {
    checks.push(check('error', 'HTTP_STATUS', `Page returned HTTP ${page.status}`));
    return;
  }
  checks.push(check('pass', 'HTTP_OK', `Page returned HTTP ${page.status}`));
  const contentType = page.headers['content-type'] ?? '';
  if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    checks.push(check('warning', 'NOT_HTML', `Page Content-Type is ${contentType || '(missing)'}; skipping HTML signals`));
    return;
  }
  const metadata = getPageMetadata(page.body);
  if (!metadata.title) checks.push(check('warning', 'TITLE_MISSING', 'Missing or empty HTML title'));
  else checks.push(check('pass', 'TITLE_PRESENT', 'HTML title detected'));
  if (hasNoindex(`${metadata.robots},${page.headers['x-robots-tag'] ?? ''}`)) {
    checks.push(check('error', 'NOINDEX', 'Page contains a noindex directive'));
  } else checks.push(check('pass', 'NO_NOINDEX', 'No noindex directive detected'));
  if (metadata.canonicals.length === 0) {
    checks.push(check('warning', 'CANONICAL_MISSING', 'Canonical link tag not found'));
  } else if (metadata.canonicals.length > 1) {
    checks.push(check('warning', 'CANONICAL_MULTIPLE', `${metadata.canonicals.length} canonical link tags found`));
  } else {
    try {
      const canonical = normalizeComparableUrl(new URL(metadata.canonicals[0], page.finalUrl).href);
      const final = normalizeComparableUrl(page.finalUrl);
      if (canonical !== final) checks.push(check('warning', 'CANONICAL_DIFFERENT', `Canonical points to ${canonical} instead of ${final}`));
      else checks.push(check('pass', 'CANONICAL_MATCH', 'Canonical matches final page URL'));
    } catch {
      checks.push(check('error', 'CANONICAL_INVALID', `Canonical href is invalid: ${metadata.canonicals[0]}`));
    }
  }
}

function describeRedirects(response, checks, type = 'Page') {
  const count = response.redirects?.length ?? 0;
  if (count > 1) checks.push(check('warning', 'REDIRECT_CHAIN', `${type} passed through ${count} redirects`));
  else if (count === 1) checks.push(check('pass', 'REDIRECT_SINGLE', `${type} redirected once`));
  else checks.push(check('pass', 'REDIRECT_NONE', `${type} has no redirects`));
}

async function checkSiteFile(origin, filename, options, checks) {
  const codeBase = filename.replace(/^\//, '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  const url = new URL(filename, origin).href;
  const result = await fetchWithTrace(url, options);
  if (!result.ok) {
    checks.push(check('warning', `${codeBase}_FETCH_ERROR`, `${filename}: ${result.error}`));
    return;
  }
  if (result.status === 200) {
    checks.push(check('pass', `${codeBase}_FOUND`, `${filename} found`));
    if (filename === '/robots.txt' && /^\s*disallow\s*:\s*\/\s*$/im.test(result.body)) {
      checks.push(check('warning', 'ROBOTS_DISALLOW_REVIEW', 'robots.txt contains Disallow: /; review which user-agent it applies to'));
    }
  } else if (result.status === 404) {
    checks.push(check('warning', `${codeBase}_MISSING`, `${filename} not found (HTTP 404)`));
  } else {
    checks.push(check('warning', `${codeBase}_STATUS`, `${filename} returned HTTP ${result.status}`));
  }
}

/** Scan one page and its site's conventional robot/sitemap endpoints. */
export async function scanSite(inputUrl, options = {}) {
  const url = parseHttpUrl(inputUrl);
  const checks = [];
  const page = await fetchWithTrace(url.href, options);
  describeRedirects(page, checks);
  addPageChecks(page, checks);
  if (page.ok) {
    const origin = new URL(page.finalUrl).origin;
    const fileChecks = await Promise.all(['/robots.txt', '/sitemap.xml'].map(async filename => {
      const findings = [];
      await checkSiteFile(origin, filename, options, findings);
      return findings;
    }));
    checks.push(...fileChecks.flat());
  }
  const count = (severity) => checks.filter(c => c.severity === severity).length;
  return {
    schemaVersion: '1',
    tool: 'routedoctor',
    version: '0.1.0',
    inputUrl: url.href,
    finalUrl: page.finalUrl,
    redirects: page.redirects,
    status: page.status ?? null,
    checks,
    summary: { errors: count('error'), warnings: count('warning'), passed: count('pass') }
  };
}
