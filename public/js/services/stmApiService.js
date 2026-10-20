/**
 * STM API SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * All transport configuration lives in STM_API_CONFIG below. Drop in the base
 * URL / key for pinkythegawd's API here, or leave `customApi.enabled = false`
 * to use this project's server proxy at /api/vehicles (recommended: it hides
 * the STM key, decodes protobuf and avoids CORS).
 */

import { normalizePayload, normalizeVehicle, enrichRouteNames } from './normalizer.js';

export const STM_API_CONFIG = {
  /** Same-origin server. Use an absolute URL when the UI is hosted elsewhere. */
  baseUrl: '',

  /** Proxy endpoints exposed by server/index.js. */
  endpoints: {
    vehicles: '/api/vehicles',
    alerts: '/api/alerts',
    routes: '/api/routes',
    health: '/api/health',
  },

  /** Extra headers for the proxy (add an auth header here if you deploy one). */
  headers: {
    Accept: 'application/json',
  },

  /** Optional API key for the proxy. Sent as `x-api-key`. */
  apiKey: '',
  apiKeyHeader: 'x-api-key',

  /** Poll cadence in milliseconds (the UI countdown reads this). */
  pollIntervalMs: 15000,
  requestTimeoutMs: 12000,

  /**
   * Direct mode for pinkythegawd's JSON API. Enable this to bypass the local
   * proxy; the browser will call the API itself (the API must allow CORS).
   * Payloads can be flat arrays or nested GTFS-Realtime JSON.
   */
  customApi: {
    enabled: false,
    baseUrl: '', // e.g. 'https://stm-api.example.com'
    vehiclesPath: '/vehicles',
    alertsPath: '/alerts',
    routesPath: '/routes',
    headers: {
      Accept: 'application/json',
    },
    apiKey: '',
    apiKeyHeader: 'x-api-key',
    apiKeyPrefix: '', // e.g. 'Bearer'
    /** 'auto' | 'kmh' | 'mps' — speed unit for flat JSON payloads. */
    speedUnit: 'auto',
  },
};

export class StmApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'StmApiError';
    this.code = options.code || 'API_ERROR';
    this.status = options.status || 0;
    this.details = options.details || null;
  }
}

function joinUrl(base, path) {
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  if (!base) return path;
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function buildHeaders(extra = {}) {
  const headers = { ...STM_API_CONFIG.headers, ...extra };
  if (STM_API_CONFIG.apiKey) {
    headers[STM_API_CONFIG.apiKeyHeader] = STM_API_CONFIG.apiKey;
  }
  return headers;
}

function buildCustomHeaders() {
  const config = STM_API_CONFIG.customApi;
  const headers = { ...config.headers };
  if (config.apiKey) {
    headers[config.apiKeyHeader] = config.apiKeyPrefix
      ? `${config.apiKeyPrefix} ${config.apiKey}`
      : config.apiKey;
  }
  return headers;
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || STM_API_CONFIG.requestTimeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: options.headers || buildHeaders(),
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new StmApiError('The STM request timed out.', { code: 'TIMEOUT' });
    }
    throw new StmApiError(`Network error: ${err.message}`, { code: 'NETWORK' });
  } finally {
    clearTimeout(timeout);
  }

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new StmApiError('The STM service returned an invalid response.', {
        code: 'INVALID_JSON',
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    throw new StmApiError(
      (payload && payload.error && payload.error.message) || `STM service returned HTTP ${response.status}.`,
      {
        code: (payload && payload.error && payload.error.code) || 'HTTP_ERROR',
        status: response.status,
        details: payload && payload.error ? payload.error.details : null,
      },
    );
  }

  return payload;
}

async function requestDirect(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: buildCustomHeaders(),
      signal: controller.signal,
      cache: 'no-store',
      mode: 'cors',
    });
    if (!response.ok) {
      throw new StmApiError(`Custom API returned HTTP ${response.status}.`, {
        code: 'CUSTOM_HTTP',
        status: response.status,
      });
    }
    return await response.json();
  } catch (err) {
    if (err instanceof StmApiError) throw err;
    if (err.name === 'AbortError') throw new StmApiError('The custom STM API timed out.', { code: 'TIMEOUT' });
    throw new StmApiError(`Custom API unreachable: ${err.message}`, { code: 'CUSTOM_UNREACHABLE' });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the current vehicle snapshot.
 * @param {{force?: boolean, signal?: AbortSignal}} [options]
 * @returns {Promise<{mode: string, source: string, vehicles: object[], updatedAt: string, stats?: object}>}
 */
export async function fetchVehicles(options = {}) {
  const custom = STM_API_CONFIG.customApi;

  if (custom.enabled && custom.baseUrl) {
    const payload = await requestDirect(joinUrl(custom.baseUrl, custom.vehiclesPath), STM_API_CONFIG.requestTimeoutMs);
    const vehicles = normalizePayload(payload, { source: 'pinkythegawd', speedUnit: custom.speedUnit });
    if (!vehicles.length) {
      throw new StmApiError('The custom STM API returned no usable vehicles.', { code: 'EMPTY_CUSTOM' });
    }
    return {
      mode: 'live',
      source: 'pinkythegawd',
      sourceLabel: 'pinkythegawd API',
      updatedAt: new Date().toISOString(),
      vehicles,
      stats: null,
    };
  }

  const url = joinUrl(STM_API_CONFIG.baseUrl, STM_API_CONFIG.endpoints.vehicles);
  const separator = url.includes('?') ? '&' : '?';
  const finalUrl = options.force ? `${url}${separator}force=1` : url;

  const payload = await requestJson(finalUrl, { headers: buildHeaders() });
  const canonical = normalizePayload(payload && payload.vehicles ? payload.vehicles : payload, {
    source: (payload && payload.source) || 'official-stm',
  });

  const vehicles = normalizePayload(canonical);
  if (!vehicles.length) {
    throw new StmApiError('No active STM buses were returned.', { code: 'EMPTY_FEED' });
  }

  return {
    mode: (payload && payload.mode) || 'live',
    source: (payload && payload.source) || 'official-stm',
    sourceLabel:
      (payload && payload.sourceLabel)
      || ((payload && payload.source) === 'pinkythegawd' ? 'pinkythegawd API' : 'STM GTFS-Realtime'),
    updatedAt: (payload && payload.updatedAt) || new Date().toISOString(),
    feedTimestamp: payload && payload.feedTimestamp,
    vehicles,
    stats: payload && payload.stats,
    cache: payload && payload.cache,
    stale: Boolean(payload && (payload.stale || payload.mode === 'stale')),
    error: payload && payload.error,
    attempts: (payload && payload.attempts) || [],
  };
}

/** Service advisories from the STM état du service endpoint. */
export async function fetchAlerts() {
  const custom = STM_API_CONFIG.customApi;
  if (custom.enabled && custom.baseUrl && custom.alertsPath) {
    try {
      const payload = await requestDirect(joinUrl(custom.baseUrl, custom.alertsPath), STM_API_CONFIG.requestTimeoutMs);
      const list = Array.isArray(payload) ? payload : payload.alerts || payload.data || [];
      return { alerts: Array.isArray(list) ? list : [], source: 'pinkythegawd' };
    } catch {
      // Fall through to the proxy.
    }
  }

  const payload = await requestJson(joinUrl(STM_API_CONFIG.baseUrl, STM_API_CONFIG.endpoints.alerts), {
    headers: buildHeaders(),
  });
  return {
    alerts: (payload && payload.alerts) || [],
    source: (payload && payload.source) || 'official-stm',
    updatedAt: payload && payload.updatedAt,
    rawCount: payload && payload.rawCount,
  };
}

/** Route catalogue used for search and route names. */
export async function fetchRoutes() {
  const payload = await requestJson(joinUrl(STM_API_CONFIG.baseUrl, STM_API_CONFIG.endpoints.routes), {
    headers: buildHeaders(),
  });
  const map = new Map(Object.entries((payload && payload.routes) || {}));
  return { routes: map, generatedAt: payload && payload.generatedAt };
}

export async function fetchHealth() {
  return requestJson(joinUrl(STM_API_CONFIG.baseUrl, STM_API_CONFIG.endpoints.health), {
    headers: buildHeaders(),
    timeoutMs: 4000,
  });
}

export { enrichRouteNames };
