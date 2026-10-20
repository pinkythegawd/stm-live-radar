'use strict';

/**
 * Live adapter for STM's official GTFS-Realtime v2 feed.
 * Docs: https://api.stm.info (apiKey header).
 */

const config = require('../config');
const { decodeFeed } = require('../lib/gtfsRt');
const { fetchWithRetry } = require('../lib/upstream');
const {
  getRouteCategory,
  headingToCompass,
  normalizeTimestamp,
  normalizeBearing,
  OCCUPANCY_LABELS,
} = require('../lib/normalizer');
const routeMeta = require('../lib/routeMeta');

class UpstreamError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'UpstreamError';
    this.statusCode = statusCode;
  }
}

function mapEntity(entity, feedTimestamp) {
  const v = entity && entity.vehicle;
  if (!v || !v.position) return null;

  const latitude = Number(v.position.latitude);
  const longitude = Number(v.position.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const routeId = v.trip && v.trip.routeId ? String(v.trip.routeId) : null;
  if (!routeId) return null;

  const directionId = v.trip.directionId === null || v.trip.directionId === undefined
    ? null
    : Number(v.trip.directionId);

  const meta = routeMeta.getRoute(routeId);
  const directionMeta = meta && directionId !== null
    ? meta.directions[String(directionId)]
    : null;
  const headsign = directionMeta ? directionMeta.headsign : null;

  const timestamp = normalizeTimestamp(v.timestamp || feedTimestamp);
  const bearing = normalizeBearing(v.position.bearing);
  const speedKmh = Number.isFinite(Number(v.position.speed))
    ? Math.max(0, Math.round(Number(v.position.speed) * 3.6 * 10) / 10)
    : 0;

  const occupancy = v.occupancyStatus && OCCUPANCY_LABELS[v.occupancyStatus]
    ? v.occupancyStatus
    : 'NO_DATA_AVAILABLE';

  const category = getRouteCategory(routeId);
  const vehicleId = (v.vehicle && v.vehicle.id) || entity.id || `trip-${v.trip.tripId || 'unknown'}`;

  return {
    vehicleId: String(vehicleId).replace(/^#/, ''),
    routeId,
    routeName: meta ? meta.longName : '',
    tripHeadsign: headsign,
    direction: headsign || '—',
    directionId,
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    bearing,
    compass: headingToCompass(bearing),
    speedKmh,
    occupancy,
    occupancyLabel: OCCUPANCY_LABELS[occupancy] || 'No occupancy data',
    timestamp,
    tripId: v.trip.tripId || null,
    currentStatus: v.currentStatus || null,
    stopId: v.stopId || null,
    category: category.key,
    color: category.color,
    source: 'official-stm',
  };
}

async function fetchVehicles() {
  if (!config.stm.apiKey) {
    throw new UpstreamError('STM_API_KEY is not configured', 503);
  }

  let res;
  try {
    res = await fetchWithRetry(
      config.stm.vehiclePositionsUrl,
      {
        headers: {
          apiKey: config.stm.apiKey,
          Accept: 'application/x-protobuf',
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
    throw new UpstreamError(`STM feed unreachable: ${err.message}`);
  }

  if (!res.ok) {
    throw new UpstreamError(`STM feed returned HTTP ${res.status}`, res.status === 429 ? 429 : 502);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const feed = decodeFeed(buffer);

  const byId = new Map();
  for (const entity of feed.entities) {
    const mapped = mapEntity(entity, feed.header.timestamp);
    if (!mapped) continue;
    const existing = byId.get(mapped.vehicleId);
    if (!existing || existing.timestamp <= mapped.timestamp) {
      byId.set(mapped.vehicleId, mapped);
    }
  }

  const vehicles = [...byId.values()].slice(0, config.limits.maxVehicles);
  if (!vehicles.length) {
    throw new UpstreamError('STM feed returned no usable vehicles');
  }

  return {
    vehicles,
    feedTimestamp: feed.header.timestamp || Math.floor(Date.now() / 1000),
    feedVersion: feed.header.gtfsRealtimeVersion || null,
    bytes: buffer.length,
  };
}

module.exports = { fetchVehicles, UpstreamError };
