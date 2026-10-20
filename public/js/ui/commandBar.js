/** Top command bar: stats, connection state, countdown ring, alerts badge. */

import { APP_CONFIG } from '../config.js';
import { formatNumber, formatDecimal, formatClock } from '../utils/format.js';
import { t } from '../i18n.js';

const RING_CIRCUMFERENCE = 2 * Math.PI * 18;

const CONNECTION_KEYS = {
  syncing: ['connection.syncing', 'connection.syncingSource'],
  connected: ['connection.connected', 'connection.connectedSource'],
  stale: ['connection.stale', 'connection.staleSource'],
  demo: ['connection.demo', 'connection.demoSource'],
  offline: ['connection.offline', 'connection.offlineSource'],
};

export class CommandBar {
  constructor() {
    this.stats = {
      buses: document.getElementById('stat-buses'),
      routes: document.getElementById('stat-routes'),
      speed: document.getElementById('stat-speed'),
    };
    this.pill = document.getElementById('connection-pill');
    this.pillLabel = document.getElementById('connection-label');
    this.pillSource = document.getElementById('connection-source');
    this.modePill = document.getElementById('mode-pill');
    this.modeText = document.getElementById('mode-pill-text');
    this.progress = document.getElementById('sync-progress');
    this.seconds = document.getElementById('sync-seconds');
    this.ring = document.getElementById('sync-ring');
    this.forceBtn = document.getElementById('force-sync');
    this.alertsBadge = document.getElementById('alerts-badge');
    this.alertsBtn = document.getElementById('alerts-btn');
    this.mapUpdated = document.getElementById('map-updated');
    this.sheetCount = document.getElementById('sheet-count');
    this.sheetRoutes = document.getElementById('sheet-routes');
    this.sheetBusWord = document.getElementById('sheet-bus-word');
    this.sheetRouteWord = document.getElementById('sheet-route-word');
    this.loading = document.getElementById('loading');
    this.loadingText = document.getElementById('loading-text');
    this.state = null;

    this.progress.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    this.progress.style.strokeDashoffset = '0';

    this.forceBtn.addEventListener('click', () => {
      if (this.onForceSync) this.onForceSync();
    });
    this.alertsBtn.addEventListener('click', () => {
      if (this.onOpenAlerts) this.onOpenAlerts();
    });
  }

  bind(handlers) {
    this.onForceSync = handlers.onForceSync;
    this.onOpenAlerts = handlers.onOpenAlerts;
  }

  setSyncing(syncing) {
    this.forceBtn.classList.toggle('is-busy', syncing);
    this.ring.classList.toggle('is-syncing', syncing);
    this.forceBtn.disabled = syncing;
    this.forceBtn.setAttribute('aria-busy', syncing ? 'true' : 'false');
  }

  update(state) {
    this.state = state;

    const stats = state.stats || {};
    this.stats.buses.textContent = stats.vehicles ? formatNumber(stats.vehicles) : '—';
    this.stats.routes.textContent = stats.routes ? formatNumber(stats.routes) : '—';
    this.stats.speed.innerHTML = stats.avgSpeedKmh
      ? `${formatDecimal(stats.avgSpeedKmh)}<small>km/h</small>`
      : '—<small>km/h</small>';

    const connection = state.connection || 'syncing';
    this.pill.dataset.state = connection;
    const labels = CONNECTION_KEYS[connection] || CONNECTION_KEYS.syncing;
    this.pillLabel.textContent = t(labels[0]);
    this.pillSource.textContent =
      connection === 'demo'
        ? t('connection.fallbackSimulation')
        : state.sourceLabel || t(labels[1]);

    let mode = state.mode;
    if (mode === 'live') {
      this.modePill.dataset.mode = 'live';
      this.modeText.textContent = t('command.liveApi', {
        source: state.source === 'pinkythegawd' ? 'pinkythegawd' : t('command.stmRealtime'),
      });
    } else if (mode === 'stale') {
      this.modePill.dataset.mode = 'stale';
      this.modeText.textContent = t('command.cached');
    } else if (mode === 'simulation') {
      this.modePill.dataset.mode = 'simulation';
      this.modeText.textContent = t('command.simulation');
    } else {
      this.modePill.dataset.mode = 'connecting';
      this.modeText.textContent = t('command.connecting');
    }

    this.sheetCount.textContent = stats.vehicles ? formatNumber(stats.vehicles) : '—';
    this.sheetRoutes.textContent = stats.routes ? formatNumber(stats.routes) : '—';
    this.sheetBusWord.textContent = t(stats.vehicles === 1 ? 'sidebar.sheet.bus' : 'sidebar.sheet.buses');
    this.sheetRouteWord.textContent = t(stats.routes === 1 ? 'sidebar.sheet.route' : 'sidebar.sheet.routes');

    const alerts = state.alerts || [];
    if (alerts.length) {
      this.alertsBadge.hidden = false;
      const badgeText = alerts.length > 99 ? '99+' : String(alerts.length);
      this.alertsBadge.textContent = badgeText;
      this.alertsBtn.setAttribute('aria-label', t('alerts.openCount', { count: badgeText }));
    } else {
      this.alertsBadge.hidden = true;
      this.alertsBtn.setAttribute('aria-label', t('alerts.open'));
    }

    this.setSyncing(Boolean(state.isSyncing));

    if (state.lastSyncAt) {
      this.mapUpdated.textContent = t('command.updated', {
        clock: formatClock(state.lastSyncAt),
        source: state.connection === 'demo'
          ? t('connection.fallbackSimulation')
          : state.sourceLabel || t('command.sourceStm'),
      });
    }

    if (state.vehicles.length) {
      this.hideLoading();
    }

    this.tick();
  }

  tick() {
    const state = this.state;
    if (!state) return;

    if (state.isSyncing) {
      this.seconds.textContent = '••';
      this.progress.style.strokeDashoffset = '0';
      return;
    }

    if (!state.nextSyncAt) {
      if (state.connection === 'demo') {
        this.seconds.textContent = 'SIM';
        this.progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * 0.35);
      }
      return;
    }

    const remaining = Math.max(0, state.nextSyncAt - Date.now());
    const ratio = Math.max(0, Math.min(1, remaining / APP_CONFIG.polling.intervalMs));
    this.progress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - ratio));
    this.seconds.textContent = String(Math.ceil(remaining / 1000));
  }

  setLoadingMessage(text) {
    if (this.loadingText) this.loadingText.textContent = text;
  }

  hideLoading() {
    if (!this.loading || this.loading.classList.contains('is-done')) return;
    this.loading.classList.add('is-done');
    setTimeout(() => {
      if (this.loading) this.loading.hidden = true;
    }, 500);
  }
}
