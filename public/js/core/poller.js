/**
 * Real-time polling engine.
 *
 * - Fetches every 15 s without touching the map viewport.
 * - Immediately falls back to the built-in Montreal simulation if the live
 *   feed fails, and quietly retries the live API on every cycle.
 * - Keeps an accurate `nextSyncAt` timestamp for the countdown ring.
 */

import { store } from './store.js';
import { fetchVehicles } from '../services/stmApiService.js';
import { getVehicles as getSimulatedVehicles } from '../services/simulation.js';
import { APP_CONFIG } from '../config.js';

export function computeVehicleStats(vehicles) {
  const routes = new Set();
  let speedSum = 0;
  let moving = 0;
  let standing = 0;

  for (const vehicle of vehicles) {
    routes.add(vehicle.routeId);
    if (vehicle.speedKmh > 0.5) {
      speedSum += vehicle.speedKmh;
      moving += 1;
    } else {
      standing += 1;
    }
  }

  return {
    vehicles: vehicles.length,
    routes: routes.size,
    avgSpeedKmh: moving ? Math.round((speedSum / moving) * 10) / 10 : 0,
    moving,
    standing,
  };
}

export class Poller {
  /**
   * @param {{onCycle?: (result: object) => void, onTransition?: (from: string, to: string, detail: object) => void}} options
   */
  constructor(options = {}) {
    this.intervalMs = APP_CONFIG.polling.intervalMs;
    this.onCycle = options.onCycle || (() => {});
    this.onTransition = options.onTransition || (() => {});
    this.timer = null;
    this.busy = false;
    this.failures = 0;
    this.stopped = true;
    this.lastAttemptAt = 0;
  }

  get isBusy() {
    return this.busy;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.run({ reason: 'start' });
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  handleVisibility = () => {
    if (this.stopped) return;
    if (document.visibilityState === 'visible') {
      const last = store.get().lastSyncAt || 0;
      if (Date.now() - last > this.intervalMs * 1.4) {
        this.run({ force: true, reason: 'resume' });
      }
    } else {
      clearTimeout(this.timer);
      store.patch({ nextSyncAt: null });
    }
  };

  force() {
    if (this.busy) return false;
    this.run({ force: true, reason: 'manual' });
    return true;
  }

  schedule(delayMs) {
    clearTimeout(this.timer);
    if (this.stopped) return;
    const nextAt = Date.now() + delayMs;
    store.patch({ nextSyncAt: nextAt });
    this.timer = setTimeout(() => {
      if (document.visibilityState === 'hidden') {
        this.schedule(this.intervalMs);
        return;
      }
      this.run({ reason: 'timer' });
    }, delayMs);
  }

  async run({ force = false, reason = 'timer' } = {}) {
    if (this.stopped || this.busy) return;
    if (document.visibilityState === 'hidden' && reason !== 'start') {
      this.schedule(this.intervalMs);
      return;
    }

    this.busy = true;
    this.lastAttemptAt = Date.now();
    const previousMode = store.get().mode;

    store.patch({
      isSyncing: true,
      connection: 'syncing',
      nextSyncAt: this.lastAttemptAt + this.intervalMs,
    });

    try {
      const result = await fetchVehicles({ force });
      const stats = computeVehicleStats(result.vehicles);
      const isStale = result.mode === 'stale';

      store.setVehicles(result.vehicles, {
        mode: isStale ? 'stale' : 'live',
        connection: isStale ? 'stale' : 'connected',
        source: result.source,
        sourceLabel: result.sourceLabel,
        lastSyncAt: Date.now(),
        feedTimestamp: result.feedTimestamp || null,
        lastError: isStale ? result.error || 'Serving cached data' : null,
        stats,
        isSyncing: false,
      });

      this.failures = 0;

      if (previousMode === 'simulation') {
        this.onTransition('simulation', 'live', result);
      } else if (previousMode === 'connecting') {
        this.onTransition('connecting', 'live', result);
      } else if (isStale && previousMode === 'live') {
        this.onTransition('live', 'stale', result);
      }

      this.onCycle({ ...result, stats, mode: isStale ? 'stale' : 'live' });
    } catch (err) {
      this.failures += 1;
      const simulated = getSimulatedVehicles();
      const stats = computeVehicleStats(simulated);

      // Drop selections that do not exist in the simulated fleet.
      const state = store.get();
      const hasSelected = state.selectedVehicleId && simulated.some((v) => v.vehicleId === state.selectedVehicleId);
      const hasFollow = state.followVehicleId && simulated.some((v) => v.vehicleId === state.followVehicleId);

      store.setVehicles(simulated, {
        mode: 'simulation',
        connection: 'demo',
        source: 'simulation',
        sourceLabel: 'Fallback simulation',
        lastSyncAt: Date.now(),
        feedTimestamp: Math.floor(Date.now() / 1000),
        lastError: err.message,
        stats,
        isSyncing: false,
        selectedVehicleId: hasSelected ? state.selectedVehicleId : null,
        followVehicleId: hasFollow ? state.followVehicleId : null,
      });

      if (previousMode !== 'simulation') {
        this.onTransition(previousMode, 'simulation', { error: err });
      }

      this.onCycle({
        mode: 'simulation',
        source: 'simulation',
        sourceLabel: 'Fallback simulation',
        vehicles: simulated,
        stats,
        error: err,
      });
    } finally {
      this.busy = false;
      const elapsed = Date.now() - this.lastAttemptAt;
      this.schedule(Math.max(1200, this.intervalMs - elapsed));
    }
  }
}
