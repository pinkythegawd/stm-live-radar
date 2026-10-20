'use strict';

/**
 * Small fetch wrapper with bounded retries for flaky upstreams.
 *
 * Transit feeds occasionally reset connections or return transient 5xx/429
 * responses. We retry those, but never retry a permanent 4xx or a 429 that
 * asks us to wait longer than our budget (the caller can serve stale data
 * instead of burning the request timeout).
 */

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(err) {
  return err && (err.code || (err.cause && err.cause.code));
}

function isTransientError(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  return new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
  ]).has(errorCode(err));
}

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {{attempts?: number, timeoutMs?: number, baseDelayMs?: number, maxDelayMs?: number}} [retry]
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, retry = {}) {
  const attempts = Math.max(1, Math.min(3, Number(retry.attempts) || 2));
  const timeoutMs = Math.max(1000, Number(retry.timeoutMs) || 12000);
  const baseDelayMs = Math.max(50, Number(retry.baseDelayMs) || 400);
  const maxDelayMs = Math.max(baseDelayMs, Number(retry.maxDelayMs) || 1500);

  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !isTransientError(err)) throw err;
      await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
      continue;
    }

    if (response.ok || !TRANSIENT_STATUS.has(response.status) || attempt >= attempts) {
      return response;
    }

    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    if (retryAfterMs !== null && retryAfterMs > maxDelayMs) return response;

    // Drain the failed body so the connection can be reused.
    try {
      await response.arrayBuffer();
    } catch {
      // Ignore body drain failures; the retry is still useful.
    }

    const delay = retryAfterMs !== null
      ? retryAfterMs
      : Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    await sleep(delay);
  }

  throw lastError || new Error('Upstream request failed');
}

module.exports = { fetchWithRetry };
