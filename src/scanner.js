import { parse } from 'parse5';
import { fetchWithTrace, parseHttpUrl, MAX_BODY_BYTES } from './http.js';

const check = (severity, code, message) => ({ severity, code, message });

const elementChildren = (node) => (node.childNodes ?? []).filter(child => child.tagName);
const attributesOf = (element) => Object.fromEntries(element.attrs.map(({ name, value }) => [name, value]));

/**
 * Read the signals search engines use from <head>, as a browser would parse it:
 * comments, script/noscript text and quoted ">" are not mistaken for tags.
 */
export function getPageMetadata(html) {
  const root = elementChildren(parse(html)).find(el => el.tagName === 'html');
  const head = elementChildren(root).find(el => el.tagName === 'head');
  const elements = elementChildren(head);
  const attrsOf = (tagName) => elements.filter(el => el.tagName === tagName).map(attributesOf);
  const canonicals = attrsOf('link')
    .filter(a => (a.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'))
    .map(a => a.href?.trim())
    .filter(Boolean);
  const robots = attrsOf('meta')
    .filter(a => ['robots', 'googlebot'].includes((a.name ?? '').toLowerCase()))
    .map(a => a.content ?? '')
    .join(',');
  const baseHref = attrsOf('base').find(a => a.href !== undefined)?.href.trim() || null;
  const titleElement = elements.find(el => el.tagName === 'title');
  const title = (titleElement?.childNodes ?? []).map(node => node.value ?? '').join('').replace(/\s+/g, ' ').trim();
  return { canonicals, robots, title, baseHref };
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

/** Relative URLs in a page resolve against its <base href>, when that is valid. */
function documentBaseUrl(baseHref, pageUrl) {
  if (!baseHref) return pageUrl;
  try { return new URL(baseHref, pageUrl).href; }
  catch { return pageUrl; }
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
  if (page.truncated) {
    checks.push(check('warning', 'BODY_TRUNCATED', `Page is larger than ${MAX_BODY_BYTES} bytes; only the first ${MAX_BODY_BYTES} were analysed`));
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
      const canonical = normalizeComparableUrl(new URL(metadata.canonicals[0], documentBaseUrl(metadata.baseHref, page.finalUrl)).href);
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
