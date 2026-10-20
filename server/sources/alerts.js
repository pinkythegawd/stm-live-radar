'use strict';

/**
 * Service-status adapter (STM "État du service" v2).
 * Returns normalized, de-duplicated, currently-active advisories.
 */

const crypto = require('node:crypto');
const config = require('../config');
const { fetchWithRetry } = require('../lib/upstream');

const SEVERE_PATTERN = /(annul|cancel|interromp|disrupt|suspend|ferme|closed|détour|detour|retard|delay|panne|outage)/i;

function pickText(entries, prefer = 'fr') {
  if (!Array.isArray(entries)) return null;
  const preferred = entries.find((e) => e && String(e.language || '').startsWith(prefer) && e.text);
  if (preferred) return preferred.text;
  const fallback = entries.find((e) => e && e.text);
  return fallback ? fallback.text : null;
}

function normalizePeriod(activePeriods) {
  const period = Array.isArray(activePeriods) ? activePeriods[0] : activePeriods;
  if (!period || typeof period !== 'object') return { start: null, end: null };
  return {
    start: period.start || period.start_time || null,
    end: period.end || period.end_time || null,
  };
}

function toUnix(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function hashId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
}

function normalizeAlerts(payload) {
  const raw = payload && Array.isArray(payload.alerts) ? payload.alerts : [];
  const now = Math.floor(Date.now() / 1000);
  const grouped = new Map();

  for (const alert of raw) {
    const descriptionFr = pickText(alert.description_texts, 'fr') || '';
    const descriptionEn = pickText(alert.description_texts, 'en') || descriptionFr;
    if (!descriptionFr && !descriptionEn) continue;

    const routes = [...new Set(
      (alert.informed_entities || [])
        .map((entity) => entity && (entity.route_short_name || entity.route_id))
        .filter(Boolean)
        .map((route) => String(route).replace(/^0+(?=\d)/, '')),
    )];

    const stops = [...new Set(
      (alert.informed_entities || [])
        .map((entity) => entity && entity.stop_code)
        .filter(Boolean)
        .map(String),
    )];

    const period = normalizePeriod(alert.active_periods);
    const start = toUnix(period.start);
    const end = toUnix(period.end);

    // Keep currently active notices and those starting within the next week.
    if (end && end < now) continue;
    if (start && start > now + 7 * 24 * 3600) continue;

    const titleFr = pickText(alert.header_texts, 'fr') || 'Avis de service';
    const titleEn = pickText(alert.header_texts, 'en') || titleFr;
    const severity = SEVERE_PATTERN.test(
      `${titleFr} ${titleEn} ${descriptionFr} ${descriptionEn}`,
    ) ? 'warning' : 'info';
    const key = `${descriptionFr || descriptionEn}|${start || ''}|${end || ''}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: hashId(key),
        title: titleFr,
        titleFr,
        titleEn,
        description: descriptionFr || descriptionEn,
        descriptionFr: descriptionFr || descriptionEn,
        descriptionEn,
        routes,
        stops,
        severity,
        start,
        end,
      });
    } else {
      const existing = grouped.get(key);
      for (const route of routes) {
        if (!existing.routes.includes(route)) existing.routes.push(route);
      }
      for (const stop of stops) {
        if (!existing.stops.includes(stop)) existing.stops.push(stop);
      }
    }
  }

  const alerts = [...grouped.values()]
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'warning' ? -1 : 1;
      return (b.start || 0) - (a.start || 0);
    })
    .slice(0, config.limits.maxAlerts);

  return {
    alerts,
    rawCount: raw.length,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

async function fetchAlerts() {
  if (!config.stm.apiKey) {
    return { alerts: [], rawCount: 0, updatedAt: Math.floor(Date.now() / 1000), skipped: 'no-key' };
  }

  let res;
  try {
    res = await fetchWithRetry(
      config.stm.serviceStatusUrl,
      {
        headers: {
          apiKey: config.stm.apiKey,
          Accept: 'application/json',
          'User-Agent': 'STM-Live-Radar/1.0',
        },
      },
      {
        attempts: config.stm.retryAttempts,
        timeoutMs: config.stm.timeoutMs,
        baseDelayMs: config.stm.retryBaseDelayMs,
        maxDelayMs: config.stm.retryMaxDelayMs,
      },
    );
  } catch (err) {
    throw new Error(`Service status unreachable: ${err.message}`);
  }

  if (!res.ok) throw new Error(`Service status returned HTTP ${res.status}`);
  const payload = await res.json();
  return normalizeAlerts(payload);
}

module.exports = { fetchAlerts, normalizeAlerts };
