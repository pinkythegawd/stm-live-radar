'use strict';

/**
 * STM Live Radar — application server.
 *
 * Responsibilities:
 *   1. Serve the zero-build frontend from /public.
 *   2. Hide the STM API key behind a same-origin proxy (and avoid CORS).
 *   3. Try pinkythegawd's JSON API first when configured, then STM's official
 *      GTFS-Realtime feed, with a short-lived cache shared by all clients.
 *   4. Expose service alerts and route metadata to the dashboard.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const config = require('./config');
const { sendJson, sendError } = require('./lib/http');
const { TtlCache } = require('./lib/cache');
const routeMeta = require('./lib/routeMeta');
const official = require('./sources/stmOfficial');
const customApi = require('./sources/customApi');
const alertsSource = require('./sources/alerts');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const STARTED_AT = Date.now();

const vehicleCache = new TtlCache(config.cache.vehiclesTtlMs, config.cache.forceMinIntervalMs);
const alertCache = new TtlCache(config.cache.alertsTtlMs, 5000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), microphone=(), camera=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://server.arcgisonline.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

function computeStats(vehicles) {
  const routes = new Set();
  let speedSum = 0;
  let moving = 0;
  let standing = 0;
  const occupancy = {};

  for (const vehicle of vehicles) {
    routes.add(vehicle.routeId);
    if (vehicle.speedKmh > 0.5) {
      speedSum += vehicle.speedKmh;
      moving += 1;
    } else {
      standing += 1;
    }
    occupancy[vehicle.occupancy] = (occupancy[vehicle.occupancy] || 0) + 1;
  }

  return {
    vehicles: vehicles.length,
    routes: routes.size,
    avgSpeedKmh: moving ? Math.round((speedSum / moving) * 10) / 10 : 0,
    moving,
    standing,
    occupancy,
  };
}

/** Try the custom API first (if configured), then the official STM feed. */
async function loadVehicles() {
  const attempts = [];

  if (config.customApi.enabled) {
    const startedAt = Date.now();
    try {
      const result = await customApi.fetchVehicles();
      attempts.push({ source: 'pinkythegawd', ok: true, ms: Date.now() - startedAt, vehicles: result.vehicles.length });
      return { ...result, source: 'pinkythegawd', attempts };
    } catch (err) {
      attempts.push({ source: 'pinkythegawd', ok: false, ms: Date.now() - startedAt, error: err.message });
    }
  }

  if (config.stm.apiKey) {
    const startedAt = Date.now();
    try {
      const result = await official.fetchVehicles();
      attempts.push({ source: 'official-stm', ok: true, ms: Date.now() - startedAt, vehicles: result.vehicles.length });
      return { ...result, source: 'official-stm', attempts };
    } catch (err) {
      attempts.push({ source: 'official-stm', ok: false, ms: Date.now() - startedAt, error: err.message });
    }
  }

  const error = new Error(
    attempts.length
      ? attempts.map((a) => `${a.source}: ${a.error}`).join(' · ')
      : 'No live source configured. Set STM_API_KEY or CUSTOM_API_BASE_URL in .env.',
  );
  error.attempts = attempts;
  throw error;
}

function sourceLabel(source) {
  return source === 'pinkythegawd' ? 'pinkythegawd API' : 'STM GTFS-Realtime';
}

async function handleVehicles(req, res, url) {
  const force = url.searchParams.get('force') === '1';

  try {
    const result = await vehicleCache.get(loadVehicles, { force });
    const payload = {
      mode: 'live',
      source: result.source,
      sourceLabel: sourceLabel(result.source),
      updatedAt: new Date().toISOString(),
      feedTimestamp: result.feedTimestamp,
      feedVersion: result.feedVersion,
      vehicles: result.vehicles,
      stats: computeStats(result.vehicles),
      cache: result.cache,
      cacheAgeMs: result.ageMs || 0,
      upstreamMs: result.upstreamMs || null,
      attempts: result.attempts || [],
    };

    sendJson(res, 200, payload, {
      'Server-Timing': `upstream;dur=${result.upstreamMs || 0}`,
    });
  } catch (err) {
    // If we have a recent good snapshot, serve it as "stale" instead of failing.
    const last = vehicleCache.peek();
    if (last) {
      sendJson(res, 200, {
        mode: 'stale',
        source: last.source,
        sourceLabel: sourceLabel(last.source),
        updatedAt: new Date(last.fetchedAt || Date.now()).toISOString(),
        feedTimestamp: last.feedTimestamp,
        vehicles: last.vehicles,
        stats: computeStats(last.vehicles),
        stale: true,
        error: err.message,
        attempts: err.attempts || [],
      });
      return;
    }

    sendError(res, 502, 'UPSTREAM_UNAVAILABLE', 'Live bus data is temporarily unavailable.', {
      attempts: err.attempts || [],
    });
  }
}

async function handleAlerts(req, res) {
  try {
    const result = await alertCache.get(async () => {
      if (config.customApi.enabled) {
        try {
          const customAlerts = await customApi.fetchAlerts();
          if (customAlerts && customAlerts.length) {
            return {
              alerts: customAlerts,
              rawCount: customAlerts.length,
              updatedAt: Math.floor(Date.now() / 1000),
              source: 'pinkythegawd',
            };
          }
        } catch {
          // Fall through to STM's official service status endpoint.
        }
      }
      const officialAlerts = await alertsSource.fetchAlerts();
      return { ...officialAlerts, source: 'official-stm' };
    });

    sendJson(res, 200, {
      updatedAt: result.updatedAt,
      source: result.source || 'official-stm',
      rawCount: result.rawCount || 0,
      alerts: result.alerts || [],
      cache: result.cache,
    });
  } catch (err) {
    // Alerts are decorative: never break the dashboard because of them.
    sendJson(res, 200, {
      updatedAt: Math.floor(Date.now() / 1000),
      source: 'unavailable',
      rawCount: 0,
      alerts: [],
      error: err.message,
    });
  }
}

function handleRoutes(req, res) {
  const meta = routeMeta.load();
  const routes = {};
  for (const [routeId, route] of meta.map) {
    // Only surface bus routes in the picker; metro is out of scope.
    if (route.type !== 3) continue;
    routes[routeId] = {
      shortName: route.shortName,
      longName: route.longName,
      directions: route.directions,
    };
  }
  sendJson(res, 200, {
    generatedAt: meta.generatedAt,
    source: meta.source,
    routeCount: Object.keys(routes).length,
    routes,
  });
}

function handleHealth(req, res) {
  sendJson(res, 200, {
    ok: true,
    app: 'stm-live-radar',
    version: '1.0.0',
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    sources: {
      pinkythegawd: {
        configured: config.customApi.enabled,
        baseUrl: config.customApi.enabled ? config.customApi.baseUrl : null,
      },
      officialStm: {
        configured: Boolean(config.stm.apiKey),
      },
    },
    routeMeta: routeMeta.getSummary(),
    cache: {
      vehiclesTtlMs: config.cache.vehiclesTtlMs,
      alertsTtlMs: config.cache.alertsTtlMs,
    },
  });
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are supported.');
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(url.pathname);
  } catch {
    sendError(res, 400, 'BAD_PATH', 'Malformed URL path.');
    return;
  }

  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';
  if (relativePath.endsWith('/')) relativePath += 'index.html';

  const resolved = path.resolve(PUBLIC_DIR, `.${relativePath}`);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    sendError(res, 403, 'FORBIDDEN', 'Path escapes the public directory.');
    return;
  }

  fs.stat(resolved, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      // Friendly SPA-ish fallback for extension-less paths, but never for
      // dotfiles (.env, .git) or explicit missing assets.
      if (!path.extname(relativePath) && !/(^|\/)\.[^/]/.test(relativePath)) {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        fs.readFile(indexPath, (readErr, html) => {
          if (readErr) return sendError(res, 404, 'NOT_FOUND', 'Not found.');
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': MIME['.html'],
            'Cache-Control': 'no-cache',
          });
          return res.end(req.method === 'HEAD' ? undefined : html);
        });
        return;
      }
      sendError(res, 404, 'NOT_FOUND', 'Not found.');
      return;
    }

    const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ...SECURITY_HEADERS, ETag: etag, 'Cache-Control': 'no-cache' });
      res.end();
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      ETag: etag,
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(resolved);
    stream.on('error', () => {
      if (!res.headersSent) sendError(res, 500, 'READ_ERROR', 'Unable to read file.');
      else res.destroy();
    });
    stream.pipe(res);
  });
}

function handleRequest(req, res) {
  const startedAt = process.hrtime.bigint();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

  res.on('finish', () => {
    if (!config.logRequests) return;
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(`${req.method} ${url.pathname}${url.search} → ${res.statusCode} (${ms.toFixed(0)}ms)`);
  });

  // Same-origin app: no CORS headers required, but OPTIONS is answered cleanly.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { Allow: 'GET, HEAD, OPTIONS' });
    res.end();
    return;
  }

  if (url.pathname.startsWith('/api/') && req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and HEAD are supported.');
  }

  if (url.pathname === '/api/health') return handleHealth(req, res);
  if (url.pathname === '/api/vehicles') return handleVehicles(req, res, url);
  if (url.pathname === '/api/alerts') return handleAlerts(req, res);
  if (url.pathname === '/api/routes') return handleRoutes(req, res);
  if (url.pathname.startsWith('/api/')) {
    return sendError(res, 404, 'UNKNOWN_ENDPOINT', `No API route for ${url.pathname}`);
  }

  return serveStatic(req, res, url);
}

module.exports = { handleRequest };

// Local development / self-hosting entry point. On Vercel the exported handler
// is invoked by the functions in /api instead, so we must not listen there.
if (require.main === module) {
  const server = http.createServer(handleRequest);

  server.listen(config.port, config.host, () => {
    const meta = routeMeta.getSummary();
    console.log('');
    console.log('  STM LIVE RADAR');
    console.log(`  ▸ Dashboard : http://localhost:${config.port}`);
    console.log(`  ▸ Sources   : ${config.customApi.enabled ? 'pinkythegawd API → ' : ''}${config.stm.apiKey ? 'STM GTFS-Realtime' : 'simulation only (no key)'}`);
    console.log(`  ▸ Routes    : ${meta.routeCount} loaded${meta.generatedAt ? ` (GTFS ${meta.generatedAt.slice(0, 10)})` : ''}`);
    console.log(`  ▸ Polling   : 15s client · ${config.cache.vehiclesTtlMs / 1000}s server cache`);
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use. Set PORT in .env or stop the other process.`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} received — closing server.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
