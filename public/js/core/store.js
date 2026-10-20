/**
 * Central observable store. UI modules subscribe once and patch state; every
 * listener receives the whole state plus the keys that changed.
 */

import { APP_CONFIG } from '../config.js';
import { readJson, writeJson } from '../utils/storage.js';
import { normaliseSearch } from '../utils/format.js';

const storedFavorites = readJson(APP_CONFIG.storageKeys.favorites, []);
const storedSidebar = readJson(APP_CONFIG.storageKeys.sidebar, { collapsed: false });

const initialState = {
  vehicles: [],
  vehicleMap: new Map(),
  routeCatalogue: new Map(),
  alerts: [],
  alertSource: 'official-stm',

  mode: 'connecting', // connecting | live | stale | simulation
  connection: 'syncing', // syncing | connected | stale | demo | offline
  source: '',
  sourceLabel: '',
  lastSyncAt: null,
  nextSyncAt: null,
  isSyncing: false,
  feedTimestamp: null,
  lastError: null,

  stats: { vehicles: 0, routes: 0, avgSpeedKmh: 0, moving: 0, standing: 0 },
  filter: { type: 'all', query: '' },
  favorites: Array.isArray(storedFavorites)
    ? [...new Set(storedFavorites.map(String))]
    : [],
  selectedVehicleId: null,
  followVehicleId: null,
  nearby: null, // { lat, lng, radius, ids: string[] }
  sidebarCollapsed: Boolean(storedSidebar.collapsed),
  sheetOpen: false,
  alertsOpen: false,
  legendOpen: true,
};

class Store {
  constructor(initial) {
    this.state = { ...initial };
    this.listeners = new Set();
  }

  get() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  patch(partial) {
    const changed = Object.keys(partial);
    let didChange = false;
    for (const key of changed) {
      if (this.state[key] !== partial[key]) {
        didChange = true;
        break;
      }
    }
    if (!didChange) return this.state;

    const previous = this.state;
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      try {
        listener(this.state, changed, previous);
      } catch (err) {
        console.error('[store] listener failed', err);
      }
    }
    return this.state;
  }

  setVehicles(vehicles, meta = {}) {
    const vehicleMap = new Map();
    for (const vehicle of vehicles) vehicleMap.set(vehicle.vehicleId, vehicle);
    return this.patch({ vehicles, vehicleMap, ...meta });
  }

  setFilter(partial) {
    return this.patch({ filter: { ...this.state.filter, ...partial } });
  }

  setQuery(query) {
    return this.setFilter({ query });
  }

  toggleFavorite(routeId) {
    const id = String(routeId);
    const favorites = this.state.favorites.includes(id)
      ? this.state.favorites.filter((route) => route !== id)
      : [...this.state.favorites, id];
    writeJson(APP_CONFIG.storageKeys.favorites, favorites);
    return this.patch({ favorites });
  }

  setSidebarCollapsed(collapsed) {
    writeJson(APP_CONFIG.storageKeys.sidebar, { collapsed });
    return this.patch({ sidebarCollapsed: collapsed });
  }
}

export const store = new Store(initialState);

/* ── Selectors ─────────────────────────────────────────────────────────────── */

export function matchesQuery(vehicle, rawQuery) {
  const query = normaliseSearch(rawQuery);
  if (!query) return true;

  const haystacks = [
    vehicle.routeId,
    vehicle.routeName,
    vehicle.tripHeadsign,
    vehicle.direction,
    vehicle.vehicleId,
  ];
  if (haystacks.some((value) => normaliseSearch(value).includes(query))) return true;

  // Allow "fleet 24019" and "#24019" searches without matching unrelated text.
  const fleetQuery = query.replace(/^#/, '').replace(/\s+/g, '');
  if (!/^\d{3,}$/.test(fleetQuery)) return false;
  return normaliseSearch(vehicle.vehicleId).includes(fleetQuery);
}

export function selectFilteredVehicles(state) {
  const { vehicles, filter, favorites } = state;
  const favoriteSet = new Set(favorites);

  return vehicles.filter((vehicle) => {
    if (filter.type === 'favorites' && !favoriteSet.has(String(vehicle.routeId))) return false;
    if (filter.type !== 'all' && filter.type !== 'favorites' && vehicle.category !== filter.type) return false;
    return matchesQuery(vehicle, filter.query);
  });
}

export function selectCounts(state) {
  const counts = { all: state.vehicles.length, local: 0, express: 0, night: 0, shuttle: 0, favorites: 0 };
  const favorites = new Set(state.favorites);
  for (const vehicle of state.vehicles) {
    if (counts[vehicle.category] !== undefined) counts[vehicle.category] += 1;
    if (favorites.has(String(vehicle.routeId))) counts.favorites += 1;
  }
  return counts;
}

export function routeSortValue(routeId) {
  const numeric = Number.parseInt(String(routeId).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(numeric) ? numeric : 9999;
}

export function sortVehicles(vehicles, favorites) {
  const favoriteSet = new Set(favorites.map(String));
  return [...vehicles].sort((a, b) => {
    const favA = favoriteSet.has(String(a.routeId)) ? 0 : 1;
    const favB = favoriteSet.has(String(b.routeId)) ? 0 : 1;
    if (favA !== favB) return favA - favB;
    const routeDiff = routeSortValue(a.routeId) - routeSortValue(b.routeId);
    if (routeDiff !== 0) return routeDiff;
    return String(a.vehicleId).localeCompare(String(b.vehicleId));
  });
}

export function selectFavoriteRouteStats(state) {
  const stats = new Map();
  const favoriteSet = new Set(state.favorites.map(String));
  for (const vehicle of state.vehicles) {
    if (!favoriteSet.has(String(vehicle.routeId))) continue;
    if (!stats.has(vehicle.routeId)) {
      stats.set(vehicle.routeId, {
        routeId: vehicle.routeId,
        count: 0,
        color: vehicle.color,
        name: vehicle.routeName,
      });
    }
    stats.get(vehicle.routeId).count += 1;
  }
  return [...stats.values()].sort((a, b) => routeSortValue(a.routeId) - routeSortValue(b.routeId));
}

