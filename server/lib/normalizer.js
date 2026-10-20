'use strict';

/**
 * Normalizes heterogeneous STM payloads into the single vehicle shape the
 * dashboard understands. It accepts:
 *   - the canonical JSON produced by this server,
 *   - flat arrays from a custom JSON API,
 *   - nested GTFS-Realtime JSON ({ entity: [{ vehicle: {...} }] }).
 */

const OCCUPANCY = {
  0: 'EMPTY',
  1: 'MANY_SEATS_AVAILABLE',
  2: 'FEW_SEATS_AVAILABLE',
  3: 'STANDING_ROOM_ONLY',
  4: 'CRUSHED_STANDING_ROOM_ONLY',
  5: 'FULL',
  6: 'NOT_ACCEPTING_PASSENGERS',
  7: 'NO_DATA_AVAILABLE',
  8: 'NOT_BOARDABLE',
};

const OCCUPANCY_LABELS = {
  EMPTY: 'Empty',
  MANY_SEATS_AVAILABLE: 'Many seats available',
  FEW_SEATS_AVAILABLE: 'Few seats available',
  STANDING_ROOM_ONLY: 'Standing room only',
  CRUSHED_STANDING_ROOM_ONLY: 'Crushed standing room',
  FULL: 'Full',
  NOT_ACCEPTING_PASSENGERS: 'Not accepting passengers',
  NO_DATA_AVAILABLE: 'No occupancy data',
  NOT_BOARDABLE: 'Not boardable',
};

const ROUTE_CATEGORIES = {
  local: { key: 'local', label: 'Local', color: '#009ee0' },
  night: { key: 'night', label: 'Night', color: '#6366f1' },
  express: { key: 'express', label: 'Express', color: '#10b981' },
  shuttle: { key: 'shuttle', label: 'Shuttle', color: '#f59e0b' },
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function pick(source, paths, fallback) {
  for (const path of paths) {
    const parts = path.split('.');
    let cursor = source;
    let found = true;
    for (const part of parts) {
      if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
        found = false;
        break;
      }
      cursor = cursor[part];
    }
    if (found && cursor !== null && cursor !== undefined && cursor !== '') return cursor;
  }
  return fallback;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') return Math.floor(Date.now() / 1000);
  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.floor(Date.now() / 1000);
  const seconds = numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  // Guard against clocks slightly ahead of ours.
  return Math.min(seconds, Math.floor(Date.now() / 1000) + 120);
}

function normalizeBearing(value) {
  const numeric = toNumber(value);
  if (numeric === null || Number.isNaN(numeric)) return null;
  return ((numeric % 360) + 360) % 360;
}

function normalizeOccupancy(value) {
  if (value === null || value === undefined || value === '') return 'NO_DATA_AVAILABLE';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    return OCCUPANCY[Number(value)] || 'NO_DATA_AVAILABLE';
  }
  const key = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (OCCUPANCY_LABELS[key]) return key;
  const aliases = {
    MANY_SEATS: 'MANY_SEATS_AVAILABLE',
    FEW_SEATS: 'FEW_SEATS_AVAILABLE',
    STANDING: 'STANDING_ROOM_ONLY',
    CRUSHED: 'CRUSHED_STANDING_ROOM_ONLY',
    EMPTY: 'EMPTY',
    FULL: 'FULL',
    SEATS_AVAILABLE: 'MANY_SEATS_AVAILABLE',
  };
  return aliases[key] || 'NO_DATA_AVAILABLE';
}

function headingToCompass(bearing) {
  if (bearing === null || bearing === undefined) return '—';
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return COMPASS[index];
}

function bearingToFrench(bearing) {
  const compass = headingToCompass(bearing);
  const map = { N: 'Nord', NE: 'Nord-est', E: 'Est', SE: 'Sud-est', S: 'Sud', SW: 'Sud-ouest', W: 'Ouest', NW: 'Nord-ouest' };
  return map[compass] || '—';
}

function getRouteCategory(routeId) {
  const numeric = Number.parseInt(String(routeId || '').replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(numeric)) return ROUTE_CATEGORIES.local;
  if (numeric >= 700) return ROUTE_CATEGORIES.shuttle;
  if (numeric >= 400) return ROUTE_CATEGORIES.express;
  if (numeric >= 300) return ROUTE_CATEGORIES.night;
  if (numeric >= 250) return ROUTE_CATEGORIES.shuttle;
  return ROUTE_CATEGORIES.local;
}

function cleanRouteId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  // Some JSON APIs return "036"; STM uses "36".
  if (/^0\d+$/.test(text)) return text.replace(/^0+(?=\d)/, '');
  return text;
}

function deriveDirection(headsign, directionId, bearing) {
  if (headsign) {
    if (/^(est|ouest|nord|sud|east|west|north|south)\b/i.test(headsign)) {
      return headsign.split(/[—-]/)[0].trim();
    }
    return headsign;
  }
  if (bearing !== null && bearing !== undefined) return bearingToFrench(bearing);
  if (directionId === 0) return 'Direction 0';
  if (directionId === 1) return 'Direction 1';
  return '—';
}

/**
 * Normalize one raw vehicle object.
 * @param {object} raw
 * @param {{speedUnit?: 'kmh'|'mps'|'auto', source?: string, routeMeta?: object}} options
 */
function normalizeVehicle(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const speedUnit = options.speedUnit || 'auto';
  const nested = raw.vehicle && (raw.vehicle.position || raw.vehicle.trip);
  const base = nested ? raw.vehicle : raw;

  const latitude = toNumber(
    pick(base, ['latitude', 'lat', 'position.latitude', 'position.lat', 'coordinates.latitude', 'coordinates.lat', 'location.lat', 'gps.lat']),
  );
  const longitude = toNumber(
    pick(base, ['longitude', 'lon', 'lng', 'long', 'position.longitude', 'position.lon', 'position.lng', 'coordinates.longitude', 'coordinates.lon', 'location.lng', 'gps.lng']),
  );

  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const rawRouteId = pick(base, [
    'routeId', 'route_id', 'routeShortName', 'route.shortName', 'route.short_name',
    'line', 'lineId', 'trip.routeId', 'trip.route.route_id', 'trip.route_id',
  ]);
  const routeId = cleanRouteId(rawRouteId) || '—';

  const tripId = pick(base, ['tripId', 'trip_id', 'trip.tripId', 'trip.trip_id', 'journeyId'], null);
  const vehicleId = String(
    pick(base, ['vehicleId', 'vehicle_id', 'fleetId', 'fleet_id', 'fleetNumber', 'busNumber', 'bus', 'label', 'vehicle.id', 'vehicle.vehicle.id', 'id'], tripId || 'unknown'),
  ).replace(/^#/, '').trim();

  const directionId = toNumber(pick(base, ['directionId', 'direction_id', 'direction.id', 'trip.directionId', 'trip.direction_id'], null));

  const meta = options.routeMeta && routeId !== '—'
    ? options.routeMeta.get(routeId)
    : null;
  const directionMeta = meta && directionId !== null
    ? meta.directions[String(directionId)]
    : null;

  const rawHeadsign = pick(base, [
    'tripHeadsign', 'trip_headsign', 'headsign', 'destination', 'towards',
    'trip.tripHeadsign', 'trip.headsign', 'trip.destination', 'trip.trip_headsign',
  ], null);
  const headsign = (rawHeadsign && String(rawHeadsign).trim())
    || (directionMeta && directionMeta.headsign)
    || null;

  const bearing = normalizeBearing(pick(base, ['bearing', 'heading', 'bearingDegrees', 'position.bearing', 'trip.bearing'], null));

  let speedKmh = null;
  if (base.position && base.position.speed !== undefined) {
    // GTFS-Realtime speeds are metres per second.
    speedKmh = toNumber(base.position.speed) !== null ? toNumber(base.position.speed) * 3.6 : null;
  } else {
    const rawSpeed = pick(base, ['speedKmh', 'speed_kmh', 'speedKmhAverage', 'speed'], null);
    const parsedSpeed = toNumber(rawSpeed);
    if (parsedSpeed !== null) {
      const unit = speedUnit === 'auto'
        ? (pick(base, ['speedMps', 'speed_mps']) !== null ? 'mps' : 'kmh')
        : speedUnit;
      speedKmh = unit === 'mps' ? parsedSpeed * 3.6 : parsedSpeed;
    }
  }
  if (speedKmh !== null) speedKmh = Math.max(0, Math.min(120, speedKmh));

  const occupancy = normalizeOccupancy(pick(base, [
    'occupancyStatus', 'occupancy_status', 'occupancy', 'crowding', 'load',
    'vehicle.occupancyStatus', 'vehicle.occupancy_status',
  ], null));

  const timestamp = normalizeTimestamp(pick(base, [
    'timestamp', 'lastUpdate', 'last_update', 'lastSeen', 'last_seen', 'updatedAt', 'updated_at', 'ts',
    'vehicle.timestamp',
  ], null));

  const category = getRouteCategory(routeId);

  return {
    vehicleId,
    routeId,
    routeName: (meta && meta.longName) || String(pick(base, ['routeName', 'route_name', 'route.longName', 'route.long_name'], '') || ''),
    tripHeadsign: headsign,
    direction: deriveDirection(headsign, directionId, bearing),
    directionId,
    latitude,
    longitude,
    bearing,
    compass: headingToCompass(bearing),
    speedKmh: speedKmh === null ? 0 : Math.round(speedKmh * 10) / 10,
    occupancy,
    occupancyLabel: OCCUPANCY_LABELS[occupancy] || 'No occupancy data',
    timestamp,
    tripId: tripId ? String(tripId) : null,
    currentStatus: pick(base, ['currentStatus', 'current_status', 'status'], null),
    stopId: pick(base, ['stopId', 'stop_id', 'nextStop', 'next_stop'], null),
    category: category.key,
    color: category.color,
    source: options.source || 'api',
  };
}

/** Extract the vehicle array from common JSON envelopes. */
function extractVehicleArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [
    payload.vehicles,
    payload.buses,
    payload.data,
    payload.items,
    payload.results,
    payload.entity,
    payload.entities,
    payload.feed && payload.feed.entity,
    payload.GtfsRealtime && payload.GtfsRealtime.entity,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && Array.isArray(candidate.vehicles)) return candidate.vehicles;
  }
  return [];
}

function normalizePayload(payload, options = {}) {
  const items = extractVehicleArray(payload);
  const limit = options.limit || 2500;
  const byId = new Map();

  for (const item of items) {
    // Nested GTFS-RT entities wrap the vehicle in `vehicle`.
    const candidate = item && item.vehicle && (item.vehicle.position || item.vehicle.trip)
      ? item.vehicle
      : item;
    const normalized = normalizeVehicle(candidate, options);
    if (!normalized || normalized.routeId === '—') continue;

    const existing = byId.get(normalized.vehicleId);
    if (!existing || existing.timestamp <= normalized.timestamp) {
      byId.set(normalized.vehicleId, normalized);
    }
    if (byId.size >= limit) break;
  }

  return [...byId.values()];
}

module.exports = {
  OCCUPANCY,
  OCCUPANCY_LABELS,
  ROUTE_CATEGORIES,
  normalizeVehicle,
  normalizePayload,
  getRouteCategory,
  headingToCompass,
  bearingToFrench,
  normalizeOccupancy,
  normalizeTimestamp,
  normalizeBearing,
  cleanRouteId,
};
