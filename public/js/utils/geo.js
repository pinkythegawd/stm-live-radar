/** Geospatial helpers (metres, bearing, interpolation). */

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export function haversineMeters(a, b) {
  const lat1 = toRad(a.lat ?? a[0]);
  const lon1 = toRad(a.lng ?? a[1]);
  const lat2 = toRad(b.lat ?? b[0]);
  const lon2 = toRad(b.lng ?? b[1]);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingBetween(a, b) {
  const lat1 = toRad(a.lat ?? a[0]);
  const lat2 = toRad(b.lat ?? b[0]);
  const dLon = toRad((b.lng ?? b[1]) - (a.lng ?? a[1]));
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function interpolate(a, b, t) {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

/** Distance in metres covered by a route polyline. */
export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/** Position + heading at `alongMeters` from the start of a polyline. */
export function pointAlongPolyline(points, cumulative, total, alongMeters) {
  const clamped = Math.max(0, Math.min(total, alongMeters));
  let index = 0;
  for (let i = 1; i < cumulative.length; i += 1) {
    if (clamped <= cumulative[i]) {
      index = i - 1;
      break;
    }
    index = i - 1;
  }
  const start = points[index];
  const end = points[index + 1] || points[index];
  const segment = cumulative[index + 1] - cumulative[index] || 1;
  const t = Math.max(0, Math.min(1, (clamped - cumulative[index]) / segment));
  const position = interpolate(start, end, t);
  return {
    lat: position.lat,
    lng: position.lng,
    bearing: bearingBetween(start, end),
    segment: index,
  };
}

export function isInsideBounds(lat, lng, bounds) {
  const [[south, west], [north, east]] = bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
