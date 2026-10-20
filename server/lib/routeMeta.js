'use strict';

/**
 * Loads the compact route catalogue generated from STM's GTFS static archive.
 * It supplies authentic headsigns, route names and per-route directions.
 */

const fs = require('node:fs');
const path = require('node:path');

const META_FILE = path.join(__dirname, '..', 'data', 'route-meta.json');

let cache = null;

function load() {
  if (cache) return cache;

  try {
    const payload = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    const map = new Map();
    for (const [routeId, route] of Object.entries(payload.routes || {})) {
      map.set(routeId, route);
    }
    cache = {
      generatedAt: payload.generatedAt || null,
      source: payload.source || null,
      routeCount: map.size,
      map,
    };
  } catch (err) {
    console.warn(`[route-meta] ${META_FILE} unavailable (${err.message}); headsigns will fall back to live data.`);
    cache = { generatedAt: null, source: null, routeCount: 0, map: new Map() };
  }

  return cache;
}

function getRoute(routeId) {
  return load().map.get(String(routeId)) || null;
}

function getSummary() {
  const meta = load();
  return { routeCount: meta.routeCount, generatedAt: meta.generatedAt };
}

function enrich(vehicle) {
  if (!vehicle || !vehicle.routeId) return vehicle;
  const route = getRoute(vehicle.routeId);
  if (!route) return vehicle;

  const direction = vehicle.directionId !== null && vehicle.directionId !== undefined
    ? route.directions[String(vehicle.directionId)]
    : null;

  return {
    ...vehicle,
    routeName: route.longName || vehicle.routeName || '',
    tripHeadsign: vehicle.tripHeadsign || (direction ? direction.headsign : null),
  };
}

module.exports = { getRoute, getSummary, enrich, load };
