import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { scanSite, getAttributes, getPageMetadata, hasNoindex } from '../src/scanner.js';

async function withServer(handler, fn) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(url); }
  finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
}

function fixture(req, res) {
  if (req.url === '/robots.txt') return res.writeHead(200, {'content-type':'text/plain'}).end('User-agent: *\nAllow: /');
  if (req.url === '/sitemap.xml') return res.writeHead(200, {'content-type':'application/xml'}).end('<urlset></urlset>');
  if (req.url === '/old') return res.writeHead(301, {location:'/middle'}).end();
  if (req.url === '/middle') return res.writeHead(302, {location:'/'}).end();
  if (req.url === '/loop-a') return res.writeHead(301, {location:'/loop-b'}).end();
  if (req.url === '/loop-b') return res.writeHead(302, {location:'/loop-a'}).end();
  if (req.url === '/noindex') return res.writeHead(200, { 'content-type':'text/html', 'x-robots-tag':'noindex' }).end('<title>Private</title>');
  if (req.url === '/missing-title') return res.writeHead(200, { 'content-type':'text/html' }).end('<p>Hello</p>');
  return res.writeHead(200, { 'content-type':'text/html' }).end(`<html><head><title>Okay</title><link href="http://${req.headers.host}/" rel="canonical"></head></html>`);
}

test('extract attributes regardless of order', () => {
  assert.deepEqual(getAttributes('<link href="/" rel="canonical">'), {href:'/', rel:'canonical'});
  assert.deepEqual(getPageMetadata('<meta content="noindex,follow" name="robots">').robots, 'noindex,follow');
});

test('healthy homepage gets a passing canonical', async () => {
  await withServer(fixture, async (url) => {
    const report = await scanSite(url);
    assert.equal(report.summary.errors, 0);
    assert.ok(report.checks.some(c => c.code === 'CANONICAL_MATCH'));
    assert.ok(report.checks.some(c => c.code === 'SITEMAP_XML_FOUND'));
  });
});

test('multiple redirects are reported', async () => {
  await withServer(fixture, async (url) => {
    const report = await scanSite(`${url}/old`);
    assert.equal(report.redirects.length, 2);
    assert.ok(report.checks.some(c => c.code === 'REDIRECT_CHAIN'));
  });
});

test('redirect loops are errors', async () => {
  await withServer(fixture, async (url) => {
    const report = await scanSite(`${url}/loop-a`);
    assert.ok(report.checks.some(c => c.code === 'REDIRECT_LOOP'));
    assert.equal(report.summary.errors, 1);
  });
});

test('x-robots noindex is an error', async () => {
  await withServer(fixture, async (url) => {
    const report = await scanSite(`${url}/noindex`);
    assert.ok(report.checks.some(c => c.code === 'NOINDEX'));
  });
});

test('noindex detection handles none, agent prefixes and value directives', () => {
  const cases = [
    ['noindex', true], ['NoIndex, follow', true], ['none', true], ['noindex nofollow', true],
    ['googlebot: noindex', true], ['googlebot:none', true],
    ['unavailable_after: 25 Jun 2030 15:00:00 PST, noindex', true],
    ['index, follow', false], ['nofollow', false], ['noneofthese', false], ['', false],
    ['max-image-preview:none', false], ['max-image-preview: none, max-snippet: -1', false],
    ['googlebot: max-image-preview: none', false]
  ];
  for (const [value, expected] of cases) assert.equal(hasNoindex(value), expected, value);
});

test('meta robots none is an error but max-image-preview:none is not', async () => {
  for (const [content, expected] of [['none', 'NOINDEX'], ['max-image-preview:none', 'NO_NOINDEX']]) {
    await withServer((req, res) => {
      res.writeHead(200, {'content-type': 'text/html'}).end(`<title>T</title><meta name="robots" content="${content}">`);
    }, async url => {
      const report = await scanSite(url);
      assert.ok(report.checks.some(c => c.code === expected), content);
    });
  }
});

test('pages over the body limit are analysed from their head with a warning', async () => {
  await withServer((req, res) => {
    if (req.url !== '/big') return fixture(req, res);
    res.writeHead(200, {'content-type': 'text/html'}).end(
      `<html><head><title>Big</title><link rel="canonical" href="http://${req.headers.host}/big"></head><body>${'x'.repeat(600_000)}</body></html>`);
  }, async url => {
    const report = await scanSite(`${url}/big`);
    assert.equal(report.summary.errors, 0);
    assert.ok(report.checks.some(c => c.code === 'BODY_TRUNCATED' && c.severity === 'warning'));
    assert.ok(report.checks.some(c => c.code === 'CANONICAL_MATCH'));
  });
});

test('missing title and canonical are warnings', async () => {
  await withServer(fixture, async (url) => {
    const report = await scanSite(`${url}/missing-title`);
    assert.ok(report.checks.some(c => c.code === 'TITLE_MISSING'));
    assert.ok(report.checks.some(c => c.code === 'CANONICAL_MISSING'));
  });
});

test('reject unsafe protocols', async () => {
  await assert.rejects(() => scanSite('file:///etc/passwd'), /Only http/);
});

test('redirect edge cases return structured errors', async () => {
  const cases = [
    ['/self', 301, '/self#fragment', 'REDIRECT_LOOP', {}],
    ['/missing', 302, null, 'MISSING_LOCATION', {}],
    ['/unsafe', 307, 'file:///tmp/page', 'UNSAFE_REDIRECT', {}],
    ['/credentials', 308, 'https://user:pass@example.com/', 'UNSAFE_REDIRECT', {}],
    ['/limit', 303, '/end', 'REDIRECT_LIMIT', { maxRedirects: 0 }]
  ];
  for (const [path, status, location, expected, options] of cases) {
    await withServer((req, res) => {
      res.writeHead(status, location === null ? {} : { location }).end();
    }, async url => {
      const report = await scanSite(url + path, options);
      assert.ok(report.checks.some(c => c.code === expected), expected);
      assert.equal(report.status, null);
      assert.equal(report.summary.errors, 1);
    });
  }
});

test('exact redirect budget succeeds and relative locations resolve', async () => {
  await withServer((req, res) => {
    if (req.url === '/folder/old') return res.writeHead(308, {location: '../'}).end();
    fixture(req, res);
  }, async url => {
    const report = await scanSite(url + '/folder/old', {maxRedirects: 1});
    assert.equal(report.finalUrl, url + '/');
    assert.equal(report.summary.errors, 0);
    assert.equal(report.redirects.length, 1);
  });
});

test('canonical edge cases preserve URL semantics', async () => {
  const cases = [
    ['<link rel="canonical" href="/page#section">', 'CANONICAL_MATCH'],
    ["<LINK HREF='page' REL='alternate CANONICAL'>", 'CANONICAL_MATCH'],
    ['<link rel="canonical" href="/page/">', 'CANONICAL_DIFFERENT'],
    ['<link rel="canonical" href="/page?q=1">', 'CANONICAL_DIFFERENT'],
    ['<link rel="canonical" href="https://example.org/page">', 'CANONICAL_DIFFERENT'],
    ['<link rel="canonical" href="file:///page">', 'CANONICAL_INVALID'],
    ['<link rel="canonical" href="http://[">', 'CANONICAL_INVALID'],
    ['<link rel="canonical" href="/page"><link rel="canonical" href="/other">', 'CANONICAL_MULTIPLE'],
    ['<link rel="canonical" href="">', 'CANONICAL_MISSING']
  ];
  for (const [html, expected] of cases) {
    await withServer((req, res) => {
      if (req.url !== '/page') return fixture(req, res);
      res.writeHead(200, {'content-type': 'text/html'}).end('<title>Test</title>' + html);
    }, async url => {
      const report = await scanSite(url + '/page');
      assert.ok(report.checks.some(c => c.code === expected), html);
    });
  }
});

test('robots warning and report ordering are stable across completion order', async () => {
  await withServer((req, res) => {
    if (req.url === '/robots.txt') {
      return setTimeout(() => res.writeHead(200).end('User-agent: *\nDisallow: /'), 30);
    }
    fixture(req, res);
  }, async url => {
    const report = await scanSite(url);
    assert.equal(report.schemaVersion, '1');
    assert.deepEqual(report.checks.slice(-3).map(c => c.code), [
      'ROBOTS_TXT_FOUND', 'ROBOTS_DISALLOW_REVIEW', 'SITEMAP_XML_FOUND'
    ]);
    for (const [severity, key] of [['error','errors'], ['warning','warnings'], ['pass','passed']]) {
      assert.equal(report.summary[key], report.checks.filter(c => c.severity === severity).length);
    }
    for (const finding of report.checks) {
      assert.deepEqual(Object.keys(finding).sort(), ['code', 'message', 'severity']);
      assert.match(finding.code, /^[A-Z][A-Z0-9_]*$/);
    }
  });
});
