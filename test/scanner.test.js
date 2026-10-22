import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { scanSite, getAttributes, getPageMetadata } from '../src/scanner.js';

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
