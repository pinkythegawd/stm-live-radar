/** HTML templates shared by the sidebar, map popups and alerts drawer. */

import { escapeHtml, timeAgo, occupancyLevel, compassLabel } from '../utils/format.js';
import { getLang, getLocale, t } from '../i18n.js';

function alertText(alert) {
  const french = getLang() === 'fr';
  return {
    title: (french ? alert.titleFr : alert.titleEn) || alert.title || '',
    description: (french ? alert.descriptionFr : alert.descriptionEn) || alert.description || '',
  };
}

export function routeBadge(routeId, color, className = '') {
  const id = String(routeId ?? '—');
  const long = id.length > 2 ? ' route-badge--long' : '';
  return `<div class="route-badge${long} ${className}" style="--route-color:${escapeHtml(color || '#009ee0')}">${escapeHtml(id)}</div>`;
}

export function occupancySegments(level) {
  return [0, 1, 2, 3].map((index) => `<i class="${index < level ? 'on' : ''}"></i>`).join('');
}

function statusLabel(status) {
  const key = ['IN_TRANSIT_TO', 'STOPPED_AT', 'INCOMING_AT'].includes(status)
    ? status
    : 'moving';
  return t(`status.${key}`);
}

export function renderVehicleCard(vehicle, options = {}) {
  const occ = occupancyLevel(vehicle.occupancy);
  const routeColor = vehicle.color || '#009ee0';
  const headsign = vehicle.tripHeadsign || vehicle.direction || t('vehicle.destinationUnavailable');
  const routeName = vehicle.routeName
    ? t('vehicle.routeWithName', { route: vehicle.routeId, name: vehicle.routeName })
    : t('vehicle.route', { route: vehicle.routeId });
  const isFavorite = Boolean(options.isFavorite);
  const age = timeAgo(vehicle.timestamp);
  const stale = age.includes('m') || age.includes('h');
  const pinLabel = t(isFavorite ? 'vehicle.unpin' : 'vehicle.pin');
  const pinAria = t(isFavorite ? 'vehicle.unpinAria' : 'vehicle.pinAria', {
    route: escapeHtml(vehicle.routeId),
  });
  const cardAria = t('vehicle.cardAria', {
    route: escapeHtml(vehicle.routeId),
    headsign: escapeHtml(headsign),
    fleet: escapeHtml(vehicle.vehicleId),
  });

  return `
    <article class="vehicle-card ${options.isSelected ? 'is-selected' : ''} ${options.isFollowed ? 'is-followed' : ''}"
             role="listitem" tabindex="0" data-vehicle-id="${escapeHtml(vehicle.vehicleId)}"
             style="--route-color:${escapeHtml(routeColor)}"
             aria-label="${cardAria}">
      ${routeBadge(vehicle.routeId, routeColor)}
      <div class="vehicle-card__main">
        <div class="vehicle-card__headsign"><span>${escapeHtml(headsign)}</span></div>
        <div class="vehicle-card__route">${escapeHtml(routeName)}</div>
        <div class="vehicle-card__meta">
          <span>#${escapeHtml(vehicle.vehicleId)}</span>
          <span><b>${Math.round(vehicle.speedKmh)}</b> km/h</span>
          <span class="age ${stale ? 'is-stale' : ''}" data-ping="${vehicle.timestamp}">${escapeHtml(age)}</span>
        </div>
      </div>
      <div class="vehicle-card__side">
        <button class="card-star ${isFavorite ? 'is-fav' : ''}" type="button"
                data-action="toggle-favorite" data-route-id="${escapeHtml(vehicle.routeId)}"
                aria-label="${pinAria}"
                aria-pressed="${isFavorite}" title="${pinLabel}">${isFavorite ? '★' : '☆'}</button>
        <div class="occ-mini" data-level="${occ.level}" data-occ-color="${occ.color}"
             style="--occ-color:${occ.color}" title="${escapeHtml(occ.longLabel)}">
          <i></i><i></i><i></i><i></i>
        </div>
      </div>
    </article>
  `;
}

export function renderSkeletons(count = 7) {
  return Array.from({ length: count }, () => '<div class="skeleton" aria-hidden="true"></div>').join('');
}

export function renderEmptyState({ hasVehicles, query, filter }) {
  if (!hasVehicles) {
    return `
      <div class="feed-empty">
        <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path d="M4 17V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10M4 13h16M8 20v-2M16 20v-2M7 7h10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <b>${t('empty.noBusesTitle')}</b>
        <p>${t('empty.noBusesBody')}</p>
        <button type="button" data-action="force-sync">${t('empty.forceSync')}</button>
      </div>`;
  }

  const reason = filter === 'favorites'
    ? t('empty.pinHint')
    : query
      ? t('empty.queryHint', { query: escapeHtml(query) })
      : t('empty.filterHint');

  return `
    <div class="feed-empty">
      <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m16.5 16.5 4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <b>${t('empty.noMatchTitle')}</b>
      <p>${reason}</p>
      <button type="button" data-action="clear-filters">${t('empty.clearFilters')}</button>
    </div>`;
}

export function renderPopup(vehicle, options = {}) {
  const occ = occupancyLevel(vehicle.occupancy);
  const routeColor = vehicle.color || '#009ee0';
  const isFavorite = Boolean(options.isFavorite);
  const isFollowing = Boolean(options.isFollowing);
  const headsign = vehicle.tripHeadsign || vehicle.direction || t('vehicle.destinationUnavailable');
  const routeName = vehicle.routeName
    ? t('vehicle.routeWithName', { route: vehicle.routeId, name: vehicle.routeName })
    : t('vehicle.route', { route: vehicle.routeId });
  const bearing = vehicle.bearing === null || vehicle.bearing === undefined ? '—' : `${Math.round(vehicle.bearing)}°`;
  const fleetId = String(vehicle.vehicleId);
  const pinLabel = t(isFavorite ? 'vehicle.unpin' : 'vehicle.pin');
  const pinAria = t(isFavorite ? 'vehicle.unpinAria' : 'vehicle.pinAria', {
    route: escapeHtml(vehicle.routeId),
  });

  return `
    <div class="telemetry" style="--route-color:${escapeHtml(routeColor)};--occ-color:${occ.color}">
      <div class="telemetry__bar"></div>
      <div class="telemetry__body">
        <div class="telemetry__top">
          <div class="telemetry__badge">${escapeHtml(vehicle.routeId)}</div>
          <div>
            <div class="telemetry__headsign">${escapeHtml(headsign)}</div>
            <div class="telemetry__route">${escapeHtml(routeName)} · ${escapeHtml(t('popup.direction', { direction: vehicle.direction || '—' }))}</div>
          </div>
        </div>

        <div class="telemetry__fleet">
          <span>${t('popup.fleet')}</span><b>#${escapeHtml(fleetId)}</b>
          <span class="spacer"></span>
          <span class="telemetry__status" style="color:${vehicle.speedKmh > 1 ? '#10b981' : '#f59e0b'}">${escapeHtml(statusLabel(vehicle.currentStatus))}</span>
        </div>

        <div class="telemetry__grid">
          <div class="telemetry__cell">
            <span>${t('popup.speed')}</span>
            <b>${Math.round(vehicle.speedKmh)} <small>km/h</small></b>
          </div>
          <div class="telemetry__cell">
            <span>${t('popup.heading')}</span>
            <b>${escapeHtml(compassLabel(vehicle.bearing))} <small>${escapeHtml(bearing)}</small></b>
          </div>
          <div class="telemetry__cell">
            <span>${t('popup.lastPing')}</span>
            <b class="is-live" data-ping="${vehicle.timestamp}">${escapeHtml(timeAgo(vehicle.timestamp))}</b>
          </div>
          <div class="telemetry__cell">
            <span>${t('popup.occupancy')}</span>
            <b style="color:${occ.color}">${escapeHtml(occ.label)}</b>
          </div>
        </div>

        <div class="telemetry__occ">
          <div class="telemetry__occ-head">
            <span>${t('popup.load')}</span>
            <b>${escapeHtml(occ.longLabel)}</b>
          </div>
          <div class="occ-track">${occupancySegments(occ.level)}</div>
        </div>

        <div class="telemetry__actions">
          <button class="btn btn--primary btn--follow ${isFollowing ? 'is-active' : ''}" type="button"
                  data-action="toggle-follow" data-vehicle-id="${escapeHtml(fleetId)}">
            ${isFollowing ? t('popup.stopFollow') : t('popup.follow')}
          </button>
          <button class="btn btn--star ${isFavorite ? 'is-fav' : ''}" type="button"
                  data-action="toggle-favorite" data-route-id="${escapeHtml(vehicle.routeId)}"
                  aria-label="${pinAria}"
                  aria-pressed="${isFavorite}" title="${pinLabel}">${isFavorite ? '★' : '☆'}</button>
        </div>
      </div>
    </div>
  `;
}

export function renderFavoriteRoute(route, isActive) {
  const label = route.name || t('vehicle.route', { route: route.routeId });
  return `
    <button class="fav-route ${isActive ? 'is-active' : ''}" type="button"
            data-action="filter-favorite" data-route-id="${escapeHtml(route.routeId)}"
            style="--route-color:${escapeHtml(route.color || '#009ee0')}"
            title="${escapeHtml(label)}">
      <span class="fav-route__dot"></span>
      <span class="fav-route__num">${escapeHtml(route.routeId)}</span>
      <span class="fav-route__count">${route.count}</span>
    </button>
  `;
}

export function renderAlertCard(alert) {
  const routes = (alert.routes || []).slice(0, 8)
    .map((route) => `<button class="alert-route" type="button" data-action="alert-route" data-route-id="${escapeHtml(route)}">${escapeHtml(route)}</button>`)
    .join('');
  const text = alertText(alert);

  const start = alert.start
    ? new Date(alert.start * 1000).toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : t('alert.active');

  return `
    <article class="alert-card" data-severity="${escapeHtml(alert.severity || 'info')}">
      <div class="alert-card__top">
        <h3>${escapeHtml(text.title || t('alert.serviceNotice'))}</h3>
        <span class="alert-card__time">${escapeHtml(start)}</span>
      </div>
      ${routes ? `<div class="alert-card__routes">${routes}</div>` : ''}
      <p>${escapeHtml(text.description)}</p>
      ${(alert.stops && alert.stops.length) ? `<div class="alert-card__stops">${t('alert.stops')} ${escapeHtml(alert.stops.slice(0, 12).join(', '))}</div>` : ''}
      <button class="alert-card__more" type="button" data-action="expand-alert">${t('alert.showMore')}</button>
    </article>
  `;
}
