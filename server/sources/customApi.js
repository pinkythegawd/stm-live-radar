'use strict';

/**
 * Optional adapter for pinkythegawd's JSON STM API.
 *
 * Set CUSTOM_API_BASE_URL (and, when needed, CUSTOM_API_KEY) in `.env`.
 * The vehicle payload may be a flat array or a nested GTFS-RT JSON document;
 * both are normalized by `server/lib/normalizer.js`.
 */

const config = require('../config');
const { normalizePayload } = require('../lib/normalizer');
const routeMeta = require('../lib/routeMeta');

class CustomApiError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'CustomApiError';
    this.statusCode = statusCode;
  }
}

function withRouteMeta() {
  return { routeMeta: routeMeta.load().map, source: 'pinkythegawd' };
}

async function requestJson(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: config.customApi.headers,
      signal: AbortSignal.timeout(config.customApi.timeoutMs),
    });
  } catch (err) {
    throw new CustomApiError(`Custom API unreachable: ${err.message}`);
  }

  if (!res.ok) {
    throw new CustomApiError(`Custom API returned HTTP ${res.status}`, res.status === 429 ? 429 : 502);
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    // Tolerate JSON labelled as text/plain, but reject HTML error pages.
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new CustomApiError('Custom API did not return JSON');
    }
  }

  return res.json();
}

async function fetchVehicles() {
  if (!config.customApi.enabled) {
    throw new CustomApiError('Custom API is not configured', 503);
  }

  const url = `${config.customApi.baseUrl}${config.customApi.vehiclesPath}`;
  const payload = await requestJson(url);
  const vehicles = normalizePayload(payload, withRouteMeta());

  if (!vehicles.length) {
    throw new CustomApiError('Custom API returned no usable vehicles');
  }

  return {
    vehicles,
    feedTimestamp: Math.floor(Date.now() / 1000),
    feedVersion: 'custom-json',
    bytes: null,
  };
}

async function fetchAlerts() {
  if (!config.customApi.enabled) return null;
  const url = `${config.customApi.baseUrl}${config.customApi.alertsPath}`;
  const payload = await requestJson(url);
  const list = Array.isArray(payload)
    ? payload
    : payload.alerts || payload.data || payload.messages || [];
  if (!Array.isArray(list)) return [];
  return list.map((alert, index) => {
    const title = alert.title || alert.header || '';
    const description = alert.description || alert.body || '';
    return {
      id: String(alert.id || `custom-${index}`),
      title,
      titleFr: alert.titleFr || alert.title_fr || '',
      titleEn: alert.titleEn || alert.title_en || '',
      description,
      descriptionFr: alert.descriptionFr || alert.description_fr || '',
      descriptionEn: alert.descriptionEn || alert.description_en || '',
      routes: alert.routes || (alert.route ? [String(alert.route)] : []),
      severity: alert.severity === 'warning' ? 'warning' : 'info',
      start: alert.start || null,
      end: alert.end || null,
      source: 'pinkythegawd',
    };
  });
}

module.exports = { fetchVehicles, fetchAlerts, CustomApiError };
