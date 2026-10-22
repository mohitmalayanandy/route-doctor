import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fetchWithTrace } from '../src/http.js';

const MAX_BODY_BYTES = 512_000;

async function withServer(handler, fn) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(url); }
  finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
}

test('request timeout returns FETCH_FAILED', async () => {
  // Never respond, so only the client timeout can end the request.
  await withServer(() => {}, async (url) => {
    const result = await fetchWithTrace(url, { timeoutMs: 100 });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'FETCH_FAILED');
    assert.deepEqual(result.redirects, []);
  });
});

test('response body over the limit is truncated, not rejected', async () => {
  await withServer((req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('a'.repeat(MAX_BODY_BYTES + 1)), async (url) => {
    const result = await fetchWithTrace(url);
    assert.equal(result.ok, true);
    assert.equal(result.truncated, true);
    assert.equal(result.body.length, MAX_BODY_BYTES);
  });
});

test('connection dropped mid-body returns BODY_READ_FAILED', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '1000' });
    res.write('partial');
    setTimeout(() => res.destroy(), 20);
  }, async (url) => {
    const result = await fetchWithTrace(url);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'BODY_READ_FAILED');
  });
});

test('response body exactly at the limit succeeds', async () => {
  await withServer((req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('a'.repeat(MAX_BODY_BYTES)), async (url) => {
    const result = await fetchWithTrace(url);
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.truncated, false);
    assert.equal(result.body.length, MAX_BODY_BYTES);
  });
});
