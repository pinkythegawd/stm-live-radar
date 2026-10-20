/** Service-alerts drawer. */

import { renderAlertCard } from './templates.js';
import { selectFilteredVehicles } from '../core/store.js';
import { formatNumber } from '../utils/format.js';
import { t, tn } from '../i18n.js';

export class AlertsDrawer {
  constructor() {
    this.overlay = document.getElementById('alerts-overlay');
    this.list = document.getElementById('alerts-list');
    this.meta = document.getElementById('alerts-meta');
    this.closeBtn = document.getElementById('alerts-close');
    this.activeOnly = document.getElementById('alerts-active-only');
    this.state = null;
    this.handlers = {};
    this.openState = false;

    this.closeBtn.addEventListener('click', () => this.requestClose());
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.requestClose();
    });
    this.activeOnly.addEventListener('change', () => this.render(this.state));

    this.list.addEventListener('click', (event) => {
      const route = event.target.closest('[data-action="alert-route"]');
      if (route) {
        if (this.handlers.onRouteFilter) this.handlers.onRouteFilter(route.dataset.routeId);
        return;
      }
      const more = event.target.closest('[data-action="expand-alert"]');
      if (more) {
        const card = more.closest('.alert-card');
        const expanded = card.classList.toggle('is-expanded');
        more.textContent = t(expanded ? 'alert.showLess' : 'alert.showMore');
      }
    });
  }

  bind(handlers) {
    this.handlers = handlers;
  }

  requestClose() {
    if (this.handlers.onClose) this.handlers.onClose();
  }

  open(state) {
    this.state = state;
    this.openState = true;
    this.overlay.hidden = false;
    this.render(state);
    setTimeout(() => this.closeBtn.focus(), 30);
  }

  close() {
    this.openState = false;
    this.overlay.hidden = true;
  }

  render(state) {
    this.state = state;
    if (!state) return;

    const activeRoutes = new Set(
      selectFilteredVehicles(state).map((vehicle) => String(vehicle.routeId)),
    );
    let alerts = state.alerts || [];

    if (this.activeOnly.checked) {
      alerts = alerts.filter((alert) => {
        if (!alert.routes || !alert.routes.length) return true;
        return alert.routes.some((route) => activeRoutes.has(String(route)));
      });
    }

    const activeRouteCount = new Set(alerts.flatMap((alert) => alert.routes || [])).size;
    const notices = tn('alerts.notices', alerts.length, { n: formatNumber(alerts.length) });
    const routes = tn('alerts.routes', activeRouteCount, { n: formatNumber(activeRouteCount) });
    const source = state.alertSource === 'pinkythegawd'
      ? 'pinkythegawd API'
      : state.alertSource === 'simulation'
        ? t('alerts.sourceSimulation')
        : t('alerts.sourceOfficial');
    this.meta.textContent = `${notices} · ${routes}${state.alertSource ? ` · ${source}` : ''}`;

    if (!alerts.length) {
      this.list.innerHTML = `<div class="drawer-empty">${t(this.activeOnly.checked
        ? 'alerts.emptyActive'
        : 'alerts.empty')}</div>`;
      return;
    }

    this.list.innerHTML = alerts.slice(0, 220).map(renderAlertCard).join('');
  }
}
