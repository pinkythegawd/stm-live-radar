/**
 * Client-side data normalizer.
 *
 * The server already emits a canonical vehicle shape, but this adapter also
 * accepts flat JSON arrays and nested GTFS-Realtime JSON so the dashboard can
 * be pointed directly at pinkythegawd's API if desired.
 */

export const OCCUPANCY_LABELS = {
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

export const ROUTE_CATEGORIES = {
  local: { key: 'local', label: 'Local', color: '#009ee0' },
  night: { key: 'night', label: 'Night', color: '#6366f1' },
  express: { key: 'express', label: 'Express', color: '#a855f7' },
  shuttle: { key: 'shuttle', label: 'Shuttle', color: '#f59e0b' },
};

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function pick(source, paths, fallback = null) {
  for (const path of paths) {
    let cursor = source;
    let found = true;
    for (const part of path.split('.')) {
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

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBearing(value) {
  const n = num(value);
  if (n === null) return null;
  return ((n % 360) + 360) % 360;
}

export function compassFromBearing(bearing) {
  if (bearing === null || bearing === undefined) return '—';
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

export function getRouteCategory(routeId) {
  const numeric = Number.parseInt(String(routeId ?? '').replace(/[^\d]/g, ''), 10);
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
  return /^0\d+$/.test(text) ? text.replace(/^0+(?=\d)/, '') : text;
}

function normalizeOccupancy(value) {
  if (value === null || value === undefined || value === '') return 'NO_DATA_AVAILABLE';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    return [
      'EMPTY', 'MANY_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE', 'STANDING_ROOM_ONLY',
      'CRUSHED_STANDING_ROOM_ONLY', 'FULL', 'NOT_ACCEPTING_PASSENGERS',
      'NO_DATA_AVAILABLE', 'NOT_BOARDABLE',
    ][Number(value)] || 'NO_DATA_AVAILABLE';
  }
  const key = String(value).trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = {
    MANY_SEATS: 'MANY_SEATS_AVAILABLE',
    FEW_SEATS: 'FEW_SEATS_AVAILABLE',
    STANDING: 'STANDING_ROOM_ONLY',
    CRUSHED: 'CRUSHED_STANDING_ROOM_ONLY',
    SEATS_AVAILABLE: 'MANY_SEATS_AVAILABLE',
  };
  return OCCUPANCY_LABELS[key] ? key : aliases[key] || 'NO_DATA_AVAILABLE';
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
  return Math.min(seconds, Math.floor(Date.now() / 1000) + 120);
}

function finish(vehicle) {
  const category = getRouteCategory(vehicle.routeId);
  const bearing = normalizeBearing(vehicle.bearing);
  const occupancy = normalizeOccupancy(vehicle.occupancy);
  return {
    ...vehicle,
    bearing,
    compass: vehicle.compass || compassFromBearing(bearing),
    occupancy,
    occupancyLabel: vehicle.occupancyLabel || OCCUPANCY_LABELS[occupancy] || 'No occupancy data',
    category: vehicle.category || category.key,
    color: vehicle.color || category.color,
    speedKmh: Math.max(0, Math.min(120, Math.round((num(vehicle.speedKmh) || 0) * 10) / 10)),
    timestamp: normalizeTimestamp(vehicle.timestamp),
  };
}

/**
 * @param {object} raw
 * @param {{source?: string, speedUnit?: 'kmh'|'mps'|'auto', routeName?: string}} [options]
 */
export function normalizeVehicle(raw, options = {}) {
  if (!raw || typeof raw !== 'object') return null;

  // Fast path: the server's canonical shape.
  if (raw.vehicleId && raw.routeId && num(raw.latitude) !== null && num(raw.longitude) !== null) {
    return finish({
      vehicleId: String(raw.vehicleId).replace(/^#/, ''),
      routeId: cleanRouteId(raw.routeId) || '—',
      routeName: raw.routeName || options.routeName || '',
      tripHeadsign: raw.tripHeadsign || null,
      direction: raw.direction || raw.tripHeadsign || '—',
      directionId: raw.directionId ?? null,
      latitude: num(raw.latitude),
      longitude: num(raw.longitude),
      bearing: raw.bearing,
      compass: raw.compass,
      speedKmh: raw.speedKmh,
      occupancy: raw.occupancy,
      occupancyLabel: raw.occupancyLabel,
      timestamp: raw.timestamp,
      tripId: raw.tripId || null,
      currentStatus: raw.currentStatus || null,
      stopId: raw.stopId || null,
      category: raw.category,
      color: raw.color,
      source: raw.source || options.source || 'api',
    });
  }

  const nested = raw.vehicle && (raw.vehicle.position || raw.vehicle.trip);
  const base = nested ? raw.vehicle : raw;

  const latitude = num(pick(base, [
    'latitude', 'lat', 'position.latitude', 'position.lat', 'coordinates.latitude', 'location.lat',
  ]));
  const longitude = num(pick(base, [
    'longitude', 'lon', 'lng', 'long', 'position.longitude', 'position.lon', 'position.lng',
    'coordinates.longitude', 'location.lng',
  ]));
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const routeId = cleanRouteId(pick(base, [
    'routeId', 'route_id', 'routeShortName', 'route.shortName', 'line', 'trip.routeId', 'trip.route_id',
  ])) || '—';
  const tripId = pick(base, ['tripId', 'trip_id', 'trip.tripId', 'trip.trip_id'], null);
  const vehicleId = String(pick(base, [
    'vehicleId', 'vehicle_id', 'fleetId', 'fleetNumber', 'busNumber', 'label', 'vehicle.id', 'vehicle.vehicle.id', 'id',
  ], tripId || 'unknown')).replace(/^#/, '').trim();

  const directionId = num(pick(base, ['directionId', 'direction_id', 'direction.id', 'trip.directionId'], null));
  const headsign = pick(base, [
    'tripHeadsign', 'trip_headsign', 'headsign', 'destination', 'trip.tripHeadsign',
    'trip.headsign', 'trip.destination',
  ], null);

  let speedKmh = null;
  if (base.position && base.position.speed !== undefined) {
    const mps = num(base.position.speed);
    if (mps !== null) speedKmh = mps * 3.6;
  } else {
    const rawSpeed = num(pick(base, ['speedKmh', 'speed_kmh', 'speed']));
    if (rawSpeed !== null) {
      const unit = options.speedUnit === 'mps'
        || (options.speedUnit !== 'kmh' && pick(base, ['speedMps', 'speed_mps']) !== null)
        ? 'mps' : 'kmh';
      speedKmh = unit === 'mps' ? rawSpeed * 3.6 : rawSpeed;
    }
  }

  return finish({
    vehicleId,
    routeId,
    routeName: pick(base, ['routeName', 'route_name', 'route.longName'], '') || options.routeName || '',
    tripHeadsign: headsign,
    direction: headsign || '—',
    directionId,
    latitude,
    longitude,
    bearing: pick(base, ['bearing', 'heading', 'position.bearing'], null),
    speedKmh,
    occupancy: pick(base, ['occupancyStatus', 'occupancy_status', 'occupancy', 'crowding'], null),
    timestamp: pick(base, ['timestamp', 'lastUpdate', 'lastSeen', 'updatedAt', 'ts', 'vehicle.timestamp'], null),
    tripId: tripId ? String(tripId) : null,
    currentStatus: pick(base, ['currentStatus', 'current_status', 'status'], null),
    stopId: pick(base, ['stopId', 'stop_id', 'nextStop'], null),
    source: options.source || 'api',
  });
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [
    payload.vehicles, payload.buses, payload.data, payload.items, payload.results,
    payload.entity, payload.entities,
    payload.feed && payload.feed.entity,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && Array.isArray(candidate.vehicles)) return candidate.vehicles;
  }
  return [];
}

export function normalizePayload(payload, options = {}) {
  const items = extractArray(payload);
  const map = new Map();

  for (const item of items) {
    const candidate = item && item.vehicle && (item.vehicle.position || item.vehicle.trip)
      ? item.vehicle
      : item;
    const normalized = normalizeVehicle(candidate, options);
    if (!normalized) continue;
    const previous = map.get(normalized.vehicleId);
    if (!previous || previous.timestamp <= normalized.timestamp) map.set(normalized.vehicleId, normalized);
  }

  return [...map.values()];
}

/** Attach route names from the /api/routes catalogue when the feed omits them. */
export function enrichRouteNames(vehicles, catalogue) {
  if (!catalogue || !catalogue.size) return vehicles;
  return vehicles.map((vehicle) => {
    if (vehicle.routeName) return vehicle;
    const route = catalogue.get(String(vehicle.routeId));
    return route ? { ...vehicle, routeName: route.longName || '' } : vehicle;
  });
}
