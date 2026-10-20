'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { fetchWithRetry } = require('../server/lib/upstream');

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('retries transient 503 responses and then succeeds', async (t) => {
  let hits = 0;
  const { server, baseUrl } = await startServer((req, res) => {
    hits += 1;
    if (hits < 3) {
      res.writeHead(503);
      res.end('try again');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  t.after(() => closeServer(server));

  const response = await fetchWithRetry(`${baseUrl}/feed`, {}, {
    attempts: 3,
    timeoutMs: 2000,
    baseDelayMs: 10,
    maxDelayMs: 20,
  });

  assert.equal(response.status, 200);
  assert.equal(hits, 3);
});

test('does not retry a permanent 400 response', async (t) => {
  let hits = 0;
  const { server, baseUrl } = await startServer((req, res) => {
    hits += 1;
    res.writeHead(400);
    res.end('bad request');
  });
  t.after(() => closeServer(server));

  const response = await fetchWithRetry(`${baseUrl}/feed`, {}, {
    attempts: 3,
    timeoutMs: 2000,
    baseDelayMs: 10,
    maxDelayMs: 20,
  });

  assert.equal(response.status, 400);
  assert.equal(hits, 1);
});

test('returns a 429 immediately when Retry-After exceeds the retry budget', async (t) => {
  let hits = 0;
  const { server, baseUrl } = await startServer((req, res) => {
    hits += 1;
    res.writeHead(429, { 'Retry-After': '60' });
    res.end('rate limited');
  });
  t.after(() => closeServer(server));

  const response = await fetchWithRetry(`${baseUrl}/feed`, {}, {
    attempts: 3,
    timeoutMs: 2000,
    baseDelayMs: 10,
    maxDelayMs: 50,
  });

  assert.equal(response.status, 429);
  assert.equal(hits, 1);
});
