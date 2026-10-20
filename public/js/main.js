/**
 * STM Live Radar — application bootstrap and interaction wiring.
 */

import { APP_CONFIG } from './config.js';
import {
  store,
  selectFilteredVehicles,
} from './core/store.js';
import { Poller } from './core/poller.js';
import { MapController } from './map/mapController.js';
import { CommandBar } from './ui/commandBar.js';
import { Sidebar } from './ui/sidebar.js';
import { AlertsDrawer } from './ui/alertsDrawer.js';
import { toast } from './ui/toasts.js';
import { fetchAlerts, fetchRoutes } from './services/stmApiService.js';
import { getAlerts as getSimulatedAlerts } from './services/simulation.js';
import { haversineMeters } from './utils/geo.js';
import { debounce, formatNumber } from './utils/format.js';
import { initI18n, onLangChange, setLang, t, tn } from './i18n.js';

initI18n();

const commandBar = new CommandBar();
const sidebar = new Sidebar();
const alertsDrawer = new AlertsDrawer();

let poller = null;
let mapController = null;
let alertsTimer = null;
let lastFollowId = null;

/* ── Boot ──────────────────────────────────────────────────────────────────── */

function boot() {
  if (!window.L) {
    commandBar.setLoadingMessage(t('toast.mapFailed'));
    toast(t('toast.leaflet'), 'error', 8000);
    return;
  }

  mapController = new MapController(document.getElementById('map'), {
    onSelect: (vehicleId) => selectVehicle(vehicleId, { focus: false }),
    onToggleFollow: (vehicleId) => toggleFollow(vehicleId),
    onToggleFavorite: (routeId) => toggleFavorite(routeId),
    getSelectedId: () => store.get().selectedVehicleId,
    getFollowId: () => store.get().followVehicleId,
    isFavorite: (routeId) => store.get().favorites.includes(String(routeId)),
    isFollowing: (vehicleId) => store.get().followVehicleId === vehicleId,
    onTileError: () => toast(t('toast.tileError'), 'warn', 6000),
  });
  mapController.init();

  // Mobile starts with the sheet collapsed; desktop shows the legend.
  if (window.matchMedia('(max-width: 900px)').matches) {
    store.patch({ legendOpen: false });
  }
  applyLegend(store.get());

  wireUi();
  wireKeyboard();
  onLangChange(handleLanguageChange);

  store.subscribe(onStateChange);
  render(store.get());

  poller = new Poller({
    onCycle: onCycle,
    onTransition: onTransition,
  });
  poller.start();

  loadStaticData();

  setInterval(() => {
    commandBar.tick();
  }, APP_CONFIG.polling.countdownTickMs);

  setInterval(() => {
    sidebar.updateAges();
  }, APP_CONFIG.ui.ageRefreshMs);

  window.addEventListener('resize', debounce(() => {
    if (mapController) mapController.invalidate();
  }, 180));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mapController) {
      mapController.invalidate();
    }
  });
}

/* ── State → UI ───────────────────────────────────────────────────────────── */

function handleLanguageChange() {
  const state = store.get();

  // Simulated advisories are data strings generated on demand, so refresh them
  // with the newly selected language.
  if (state.alertSource === 'simulation' && state.alerts.length) {
    store.patch({ alerts: getSimulatedAlerts() });
  }

  const next = store.get();
  commandBar.update(next);
  sidebar.update(next, selectFilteredVehicles(next));
  if (next.alertsOpen) alertsDrawer.render(next);
  if (mapController) mapController.refreshLocalizedContent();
  updateMapOverlays(next);
  updateDocumentTitle(next);
}

function onStateChange(state) {
  render(state);
}

function render(state) {
  const filtered = selectFilteredVehicles(state);

  if (state.nearby) {
    const ids = state.vehicles
      .filter((vehicle) => haversineMeters(
        { lat: vehicle.latitude, lng: vehicle.longitude },
        { lat: state.nearby.lat, lng: state.nearby.lng },
      ) <= state.nearby.radius)
      .map((vehicle) => vehicle.vehicleId);
    state.nearby = { ...state.nearby, ids };
  }

  const visibleIds = new Set(filtered.map((vehicle) => vehicle.vehicleId));
  const nearbyIds = new Set(state.nearby ? state.nearby.ids : []);

  commandBar.update(state);
  sidebar.update(state, filtered);

  if (mapController) {
    mapController.sync(state.vehicles, {
      visibleIds,
      selectedId: state.selectedVehicleId,
      followId: state.followVehicleId,
      nearbyIds,
    });
  }

  updateMapOverlays(state);
  updateFollow(state);
  updateDocumentTitle(state);

  if (state.followVehicleId !== lastFollowId) {
    if (lastFollowId && mapController) mapController.refreshPopup(lastFollowId);
    if (state.followVehicleId && mapController) mapController.refreshPopup(state.followVehicleId);
    lastFollowId = state.followVehicleId;
  }
}

function updateMapOverlays(state) {
  const followPill = document.getElementById('follow-pill');
  const followLabel = document.getElementById('follow-label');
  const vehicle = state.followVehicleId ? state.vehicleMap.get(state.followVehicleId) : null;

  if (vehicle) {
    followPill.hidden = false;
    followLabel.textContent = t('map.followLabel', {
      route: vehicle.routeId,
      fleet: vehicle.vehicleId,
    });
  } else {
    followPill.hidden = true;
  }

  const nearbySummary = document.getElementById('nearby-summary');
  const nearbySummaryCount = document.getElementById('nearby-summary-count');
  const nearbyCount = state.nearby ? state.nearby.ids.length : 0;
  nearbySummary.hidden = !state.nearby;
  nearbySummaryCount.textContent = formatNumber(nearbyCount);

  const nearBtn = document.getElementById('near-me-btn');
  nearBtn.classList.toggle('is-active', Boolean(state.nearby));
  nearBtn.setAttribute('aria-pressed', state.nearby ? 'true' : 'false');
}

function updateFollow(state) {
  if (!state.followVehicleId) return;
  const vehicle = state.vehicleMap.get(state.followVehicleId);
  if (!vehicle) {
    store.patch({ followVehicleId: null });
    toast(t('toast.busLeft'), 'warn');
    return;
  }
  if (mapController) mapController.followVehicle(vehicle);
}

function updateDocumentTitle(state) {
  const count = state.stats && state.stats.vehicles;
  document.title = count
    ? t('title.live', { count: formatNumber(count) })
    : t('title.default');
}

/* ── Data loading ─────────────────────────────────────────────────────────── */

async function loadStaticData() {
  try {
    const routes = await fetchRoutes();
    store.patch({ routeCatalogue: routes.routes });
  } catch {
    // The live feed already carries route names; the catalogue is a bonus.
  }

  refreshAlerts();
  alertsTimer = setInterval(refreshAlerts, 60000);
}

async function refreshAlerts() {
  try {
    const result = await fetchAlerts();
    if (result && Array.isArray(result.alerts) && result.alerts.length) {
      store.patch({ alerts: result.alerts, alertSource: result.source || 'official-stm' });
    } else if (store.get().mode === 'simulation' && !store.get().alerts.length) {
      store.patch({ alerts: getSimulatedAlerts(), alertSource: 'simulation' });
    }
  } catch {
    if (store.get().mode === 'simulation') {
      store.patch({ alerts: getSimulatedAlerts(), alertSource: 'simulation' });
    }
  }
}

function onCycle(result) {
  commandBar.hideLoading();

  if (result.mode === 'simulation' && !store.get().alerts.length) {
    store.patch({ alerts: getSimulatedAlerts(), alertSource: 'simulation' });
  }

  if (result.mode === 'live' && result.stats && result.stats.vehicles) {
    const source = result.source === 'pinkythegawd' ? t('command.pinkyApi') : t('command.stmRealtime');
    if (store.get().mode === 'live' && commandBar.loading && !commandBar.loading.hidden) {
      toast(t('toast.connected', {
        count: formatNumber(result.stats.vehicles),
        source,
      }), 'success');
    }
  }
}

function onTransition(from, to, detail) {
  if (to === 'simulation') {
    toast(t('toast.simulation'), 'warn', 6500);
    if (!store.get().alerts.length) {
      store.patch({ alerts: getSimulatedAlerts(), alertSource: 'simulation' });
    }
  } else if (to === 'live' && from === 'simulation') {
    toast(t('toast.liveRestored'), 'success');
  } else if (to === 'stale' && from === 'live') {
    toast(t('toast.delayed'), 'warn');
  } else if (to === 'live' && from === 'connecting') {
    const source = detail.source === 'pinkythegawd' ? t('command.pinkyApi') : t('command.stmRealtime');
    toast(t('toast.liveConnected', { source }), 'success');
  }
}

/* ── Actions ──────────────────────────────────────────────────────────────── */

function selectVehicle(vehicleId, options = {}) {
  const state = store.get();
  const vehicle = state.vehicleMap.get(vehicleId);
  if (!vehicle) return;

  store.patch({
    selectedVehicleId: vehicleId,
    sheetOpen: options.focus === false ? state.sheetOpen : false,
  });

  if (mapController) {
    mapController.focusVehicle(vehicle, { fly: options.fly !== false, open: options.open !== false });
  }
}

function toggleFavorite(routeId) {
  const wasFavorite = store.get().favorites.includes(String(routeId));
  store.toggleFavorite(routeId);
  toast(
    t(wasFavorite ? 'toast.routeUnpinned' : 'toast.routePinned', { route: routeId }),
    'info',
    2400,
  );

  const selected = store.get().selectedVehicleId;
  if (selected && mapController) mapController.refreshPopup(selected);
}

function toggleFollow(vehicleId) {
  const state = store.get();
  const vehicle = state.vehicleMap.get(vehicleId);
  if (!vehicle) return;

  if (state.followVehicleId === vehicleId) {
    store.patch({ followVehicleId: null });
    toast(t('toast.followStopped'), 'info', 2200);
    return;
  }

  store.patch({
    followVehicleId: vehicleId,
    selectedVehicleId: vehicleId,
    sheetOpen: false,
  });

  if (mapController) mapController.startFollowing(vehicle);
  toast(t('toast.locked', {
    route: vehicle.routeId,
    fleet: vehicle.vehicleId,
  }), 'success', 2600);
}

function stopFollow() {
  if (!store.get().followVehicleId) return;
  store.patch({ followVehicleId: null });
  toast(t('toast.followStopped'), 'info', 2200);
}

function setFilterType(type) {
  if (type === 'favorites' && !store.get().favorites.length) {
    toast(t('toast.pinFirst'), 'info');
    return;
  }
  store.setFilter({ type });
}

function clearFilters() {
  store.setFilter({ type: 'all', query: '' });
  sidebar.search.value = '';
  sidebar.clearSearch.hidden = true;
}

function filterByRoute(routeId) {
  store.setFilter({ type: 'all', query: String(routeId) });
  sidebar.clearSearch.hidden = false;
  if (window.matchMedia('(max-width: 900px)').matches) {
    store.patch({ sheetOpen: false });
  }
}

function nearMe() {
  const state = store.get();
  if (state.nearby) {
    clearNearMe();
    return;
  }

  if (!navigator.geolocation) {
    toast(t('toast.geoUnsupported'), 'error');
    return;
  }

  const button = document.getElementById('near-me-btn');
  button.classList.add('is-busy');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      button.classList.remove('is-busy');
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const radius = APP_CONFIG.nearMe.radiusMeters;
      const ids = store.get().vehicles
        .filter((vehicle) => haversineMeters(
          { lat: vehicle.latitude, lng: vehicle.longitude },
          { lat, lng },
        ) <= radius)
        .map((vehicle) => vehicle.vehicleId);

      store.patch({
        nearby: { lat, lng, radius, ids },
        sheetOpen: false,
      });

      if (mapController) mapController.showUserLocation([lat, lng], radius);
      toast(tn('toast.nearby', ids.length, { n: formatNumber(ids.length) }), 'success', 3800);
    },
    (error) => {
      button.classList.remove('is-busy');
      const messages = {
        1: t('toast.geoDenied'),
        2: t('toast.geoUnavailable'),
        3: t('toast.geoTimeout'),
      };
      toast(messages[error.code] || t('toast.geoUnknown'), 'error', 5000);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
  );
}

function clearNearMe() {
  store.patch({ nearby: null });
  if (mapController) mapController.clearUserLocation();
}

function toggleLegend() {
  const next = !store.get().legendOpen;
  store.patch({ legendOpen: next });
  applyLegend(store.get());
}

function applyLegend(state) {
  const legend = document.getElementById('legend');
  const button = document.getElementById('legend-btn');
  legend.classList.toggle('is-hidden', !state.legendOpen);
  button.setAttribute('aria-pressed', state.legendOpen ? 'true' : 'false');
}

function toggleSidebar() {
  const next = !store.get().sidebarCollapsed;
  store.setSidebarCollapsed(next);
  setTimeout(() => {
    if (mapController) mapController.invalidate();
  }, 420);
}

function toggleSheet(open) {
  store.patch({ sheetOpen: open });
  setTimeout(() => {
    if (mapController) mapController.invalidate();
  }, 420);
}

function openAlerts() {
  store.patch({ alertsOpen: true });
  alertsDrawer.open(store.get());
}

function closeAlerts() {
  store.patch({ alertsOpen: false });
  alertsDrawer.close();
}

function forceSync() {
  if (!poller) return;
  const started = poller.force();
  toast(
    t(started ? 'toast.forceSyncing' : 'toast.syncBusy'),
    started ? 'info' : 'warn',
    2000,
  );
}

/* ── UI wiring ────────────────────────────────────────────────────────────── */

function wireUi() {
  document.getElementById('lang-switch').addEventListener('click', (event) => {
    const button = event.target.closest('[data-lang]');
    if (button) setLang(button.dataset.lang);
  });

  commandBar.bind({
    onForceSync: forceSync,
    onOpenAlerts: openAlerts,
  });

  sidebar.bind({
    onSearch: (query) => store.setQuery(query),
    onFilter: setFilterType,
    onSelect: (vehicleId) => selectVehicle(vehicleId, { focus: true }),
    onToggleFavorite: toggleFavorite,
    onFavoriteRoute: filterByRoute,
    onClearFilters: clearFilters,
    onForceSync: forceSync,
    onOpenAlerts: openAlerts,
    onClearNearby: clearNearMe,
    onSheetToggle: toggleSheet,
  });

  alertsDrawer.bind({
    onClose: closeAlerts,
    onRouteFilter: (routeId) => {
      closeAlerts();
      filterByRoute(routeId);
    },
  });

  document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
  document.getElementById('near-me-btn').addEventListener('click', nearMe);
  document.getElementById('nearby-summary-clear').addEventListener('click', clearNearMe);
  document.getElementById('reset-view-btn').addEventListener('click', () => {
    if (mapController) mapController.resetView();
  });
  document.getElementById('legend-btn').addEventListener('click', toggleLegend);
  document.getElementById('follow-stop').addEventListener('click', stopFollow);

  document.getElementById('search-clear').addEventListener('click', () => {
    sidebar.clearSearchInput();
  });

  window.addEventListener('beforeunload', () => {
    if (alertsTimer) clearInterval(alertsTimer);
    if (poller) poller.stop();
  });
}

function wireKeyboard() {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target && (
      target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.tagName === 'SELECT'
      || target.isContentEditable
    );

    if (event.key === '/' && !typing) {
      event.preventDefault();
      if (window.matchMedia('(max-width: 900px)').matches) store.patch({ sheetOpen: true });
      sidebar.focusSearch();
      return;
    }

    if (event.key === 'Escape') {
      if (store.get().alertsOpen) {
        closeAlerts();
        return;
      }
      if (typing) {
        target.blur();
        if (store.get().filter.query) clearFilters();
        return;
      }
      if (store.get().followVehicleId) {
        stopFollow();
        return;
      }
      if (store.get().selectedVehicleId) {
        store.patch({ selectedVehicleId: null });
      }
      return;
    }

    if (typing) return;

    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      forceSync();
    } else if (event.key.toLowerCase() === 'l') {
      toggleLegend();
    } else if (event.key.toLowerCase() === 'n') {
      nearMe();
    }
  });
}

/* ── Go ─────────────────────────────────────────────────────────────────────── */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
