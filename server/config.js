'use strict';

const path = require('node:path');
const { loadEnv } = require('./lib/env');

loadEnv(path.join(__dirname, '..', '.env'));

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const customBaseUrl = (process.env.CUSTOM_API_BASE_URL || '').trim().replace(/\/+$/, '');
const customKeyHeader = (process.env.CUSTOM_API_KEY_HEADER || 'x-api-key').trim();
const customKeyPrefix = (process.env.CUSTOM_API_KEY_PREFIX || '').trim();
const customKey = (process.env.CUSTOM_API_KEY || '').trim();

const customHeaders = {
  Accept: 'application/json',
  'User-Agent': 'STM-Live-Radar/1.0 (+https://github.com/pinkythegawd)',
};
if (customKey) {
  customHeaders[customKeyHeader] = customKeyPrefix ? `${customKeyPrefix} ${customKey}` : customKey;
}

module.exports = {
  port: int(process.env.PORT, 4173),
  host: process.env.HOST || '0.0.0.0',
  logRequests: process.env.LOG_REQUESTS !== 'false',

  stm: {
    apiKey: (process.env.STM_API_KEY || '').trim(),
    baseUrl: 'https://api.stm.info',
    vehiclePositionsUrl: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/vehiclePositions',
    tripUpdatesUrl: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/tripUpdates',
    serviceStatusUrl: 'https://api.stm.info/pub/od/i3/v2/messages/etatservice',
    timeoutMs: int(process.env.STM_TIMEOUT_MS, 12000),
    retryAttempts: int(process.env.STM_RETRY_ATTEMPTS, 2),
    retryBaseDelayMs: int(process.env.STM_RETRY_BASE_MS, 400),
    retryMaxDelayMs: int(process.env.STM_RETRY_MAX_MS, 1500),
  },

  /**
   * Optional JSON API by pinkythegawd / MikePinku. Leave CUSTOM_API_BASE_URL
   * empty to use STM's official GTFS-Realtime feed instead. When configured it
   * is tried first and the official feed acts as the automatic fallback.
   */
  customApi: {
    baseUrl: customBaseUrl,
    vehiclesPath: process.env.CUSTOM_API_VEHICLES_PATH || '/vehicles',
    alertsPath: process.env.CUSTOM_API_ALERTS_PATH || '/alerts',
    routesPath: process.env.CUSTOM_API_ROUTES_PATH || '/routes',
    headers: customHeaders,
    timeoutMs: int(process.env.CUSTOM_API_TIMEOUT_MS, 10000),
    enabled: Boolean(customBaseUrl),
  },

  cache: {
    vehiclesTtlMs: int(process.env.VEHICLES_CACHE_MS, 8000),
    forceMinIntervalMs: 2500,
    alertsTtlMs: int(process.env.ALERTS_CACHE_MS, 60000),
  },

  limits: {
    maxVehicles: 2500,
    maxAlerts: 400,
  },
};
