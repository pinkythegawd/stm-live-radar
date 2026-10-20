'use strict';

/**
 * Shared JSON accent. Keeps every response (success or failure) consistent so
 * the browser can rely on a single contract.
 */

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function sendError(res, statusCode, code, message, details) {
  sendJson(res, statusCode, {
    error: { code, message, ...(details ? { details } : {}) },
  });
}

module.exports = { sendJson, sendError };
