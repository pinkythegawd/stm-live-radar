/** Sidebar / bottom-sheet: search, filters, pinned routes and live vehicle feed. */

import { APP_CONFIG } from '../config.js';
import {
  selectCounts,
  selectFavoriteRouteStats,
  sortVehicles,
} from '../core/store.js';
import {
  renderVehicleCard,
  renderEmptyState,
  renderFavoriteRoute,
  renderSkeletons,
} from './templates.js';
import { debounce, formatNumber, timeAgo } from '../utils/format.js';
import { getLang, t } from '../i18n.js';

const FILTER_TITLE_KEYS = {
  all: 'feed.live',
  local: 'feed.local',
  express: 'feed.express',
  night: 'feed.night',
  shuttle: 'feed.shuttle',
  favorites: 'feed.favorites',
};

export class Sidebar {
  constructor() {
    this.sidebar = document.getElementById('sidebar');
    this.app = document.getElementById('app');
    this.feed = document.getElementById('vehicle-feed');
    this.search = document.getElementById('search-input');
    this.clearSearch = document.getElementById('search-clear');
    this.chips = document.getElementById('filter-chips');
    this.favoritesPanel = document.getElementById('favorites-panel');
    this.favoritesChips = document.getElementById('favorites-chips');
    this.feedTitle = document.getElementById('feed-title');
    this.feedCount = document.getElementById('feed-count');
    this.nearbyBanner = document.getElementById('nearby-banner');
    this.nearbyCount = document.getElementById('nearby-count');
    this.alertsStrip = document.getElementById('alerts-strip');
    this.alertsStripCount = document.getElementById('alerts-strip-count');
    this.alertsStripText = document.getElementById('alerts-strip-text');
    this.handle = document.getElementById('sheet-handle');

    this.cardNodes = new Map();
    this.favoriteSignature = '';
    this.state = null;
    this.handlers = {};
    this.drag = null;
    this.suppressHandleClick = false;
    this.renderSkeletons();

    this.onSearch = debounce((value) => {
      if (this.handlers.onSearch) this.handlers.onSearch(value);
    }, 130);

    this.bindEvents();
  }

  renderSkeletons() {
    this.feed.innerHTML = renderSkeletons(7);
  }

  bind(handlers) {
    this.handlers = handlers;
  }

  bindEvents() {
    this.search.addEventListener('input', (event) => {
      this.clearSearch.hidden = !event.target.value;
      this.onSearch(event.target.value);
    });

    this.clearSearch.addEventListener('click', () => {
      this.search.value = '';
      this.clearSearch.hidden = true;
      this.search.focus();
      if (this.handlers.onSearch) this.handlers.onSearch('');
    });

    this.chips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (!chip || !this.handlers.onFilter) return;
      this.handlers.onFilter(chip.dataset.filter);
    });

    this.favoritesChips.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-action="filter-favorite"]');
      if (!chip || !this.handlers.onFavoriteRoute) return;
      this.handlers.onFavoriteRoute(chip.dataset.routeId);
    });

    this.feed.addEventListener('click', (event) => {
      const star = event.target.closest('[data-action="toggle-favorite"]');
      if (star) {
        event.stopPropagation();
        if (this.handlers.onToggleFavorite) this.handlers.onToggleFavorite(star.dataset.routeId);
        return;
      }

      const clear = event.target.closest('[data-action="clear-filters"]');
      if (clear) {
        if (this.handlers.onClearFilters) this.handlers.onClearFilters();
        return;
      }

      const sync = event.target.closest('[data-action="force-sync"]');
      if (sync) {
        if (this.handlers.onForceSync) this.handlers.onForceSync();
        return;
      }

      const card = event.target.closest('.vehicle-card');
      if (card && this.handlers.onSelect) this.handlers.onSelect(card.dataset.vehicleId);
    });

    this.feed.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('.vehicle-card');
      if (!card) return;
      event.preventDefault();
      if (this.handlers.onSelect) this.handlers.onSelect(card.dataset.vehicleId);
    });

    this.alertsStrip.addEventListener('click', (event) => {
      if (event.target.closest('[data-open-alerts]') && this.handlers.onOpenAlerts) {
        this.handlers.onOpenAlerts();
      }
    });

    document.getElementById('nearby-clear').addEventListener('click', () => {
      if (this.handlers.onClearNearby) this.handlers.onClearNearby();
    });

    this.handle.addEventListener('click', () => {
      if (this.suppressHandleClick) return;
      if (this.handlers.onSheetToggle && this.state) {
        this.handlers.onSheetToggle(!this.state.sheetOpen);
      }
    });

    this.handle.addEventListener('pointerdown', (event) => this.onDragStart(event));
    this.handle.addEventListener('pointermove', (event) => this.onDragMove(event));
    this.handle.addEventListener('pointerup', (event) => this.onDragEnd(event));
    this.handle.addEventListener('pointercancel', (event) => this.onDragEnd(event));
  }

  isMobile() {
    return window.matchMedia('(max-width: 900px)').matches;
  }

  onDragStart(event) {
    if (!this.isMobile()) return;
    this.drag = {
      startY: event.clientY,
      open: Boolean(this.state && this.state.sheetOpen),
      height: this.sidebar.offsetHeight,
      delta: 0,
      moved: false,
    };
    this.sidebar.classList.add('is-dragging');
    try { this.handle.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  }

  onDragMove(event) {
    if (!this.drag) return;
    const delta = event.clientY - this.drag.startY;
    this.drag.delta = delta;
    if (Math.abs(delta) > 5) this.drag.moved = true;

    const base = this.drag.open ? 0 : Math.max(0, this.drag.height - 74);
    const y = Math.max(0, Math.min(this.drag.height, base + delta));
    this.sidebar.style.transform = `translateY(${y}px)`;
  }

  onDragEnd() {
    if (!this.drag) return;
    const { delta, open, moved } = this.drag;
    this.drag = null;
    this.sidebar.classList.remove('is-dragging');
    this.sidebar.style.transform = '';

    if (!moved) return;
    this.suppressHandleClick = true;
    setTimeout(() => { this.suppressHandleClick = false; }, 300);

    if (this.handlers.onSheetToggle) {
      if (delta < -45 && !open) this.handlers.onSheetToggle(true);
      else if (delta > 45 && open) this.handlers.onSheetToggle(false);
    }
  }

  update(state, filtered) {
    this.state = state;
    const counts = selectCounts(state);
    const favorites = new Set(state.favorites.map(String));

    this.app.classList.toggle('is-collapsed', Boolean(state.sidebarCollapsed));
    this.sidebar.classList.toggle('is-open', Boolean(state.sheetOpen));
    this.handle.setAttribute('aria-expanded', state.sheetOpen ? 'true' : 'false');
    const toggle = document.getElementById('sidebar-toggle');
    toggle.setAttribute(
      'aria-label',
      t(state.sidebarCollapsed ? 'sidebar.expand' : 'sidebar.collapse'),
    );
    toggle.setAttribute(
      'title',
      t(state.sidebarCollapsed ? 'sidebar.expandTitle' : 'sidebar.collapseTitle'),
    );

    for (const el of this.chips.querySelectorAll('[data-count]')) {
      const key = el.dataset.count;
      el.textContent = String(counts[key] ?? 0);
    }
    for (const chip of this.chips.querySelectorAll('[data-filter]')) {
      chip.classList.toggle('is-active', chip.dataset.filter === state.filter.type);
    }

    if (document.activeElement !== this.search && this.search.value !== state.filter.query) {
      this.search.value = state.filter.query;
      this.clearSearch.hidden = !state.filter.query;
    }

    const favoriteStats = selectFavoriteRouteStats(state);
    this.favoritesPanel.hidden = favoriteStats.length === 0;
    const favSignature = `${getLang()}|${favoriteStats
      .map((route) => `${route.routeId}:${route.count}:${state.filter.query === route.routeId}`)
      .join('|')}`;
    if (favSignature !== this.favoriteSignature) {
      this.favoriteSignature = favSignature;
      this.favoritesChips.innerHTML = favoriteStats
        .map((route) => renderFavoriteRoute(route, state.filter.query === route.routeId))
        .join('');
    }

    const nearbyIds = state.nearby ? state.nearby.ids || [] : [];
    this.nearbyBanner.hidden = !state.nearby;
    this.nearbyCount.textContent = String(nearbyIds.length);

    const alertCount = state.alerts ? state.alerts.length : 0;
    this.alertsStrip.hidden = alertCount === 0;
    this.alertsStripCount.textContent = String(alertCount);
    this.alertsStripText.textContent = t(alertCount === 1 ? 'alertsStrip.one' : 'alertsStrip.other');

    this.feedTitle.textContent = t(FILTER_TITLE_KEYS[state.filter.type] || 'feed.live');
    this.feedCount.textContent = t('feed.count', {
      shown: formatNumber(filtered.length),
      total: formatNumber(state.vehicles.length),
    });
    this.feed.setAttribute('aria-busy', state.isSyncing ? 'true' : 'false');

    this.renderFeed(state, filtered, favorites);
  }

  renderFeed(state, filtered, favorites) {
    if (state.mode === 'connecting' && !state.vehicles.length) {
      if (!this.feed.querySelector('.skeleton')) this.renderSkeletons();
      return;
    }

    if (!filtered.length) {
      this.cardNodes.clear();
      this.feed.innerHTML = renderEmptyState({
        hasVehicles: state.vehicles.length > 0,
        query: state.filter.query,
        filter: state.filter.type,
      });
      return;
    }

    if (this.feed.querySelector('.skeleton')) {
      this.feed.innerHTML = '';
      this.cardNodes.clear();
    }

    const max = APP_CONFIG.ui.maxFeedItems;
    const list = sortVehicles(filtered, state.favorites).slice(0, max);
    const wanted = new Set(list.map((vehicle) => vehicle.vehicleId));
    const existingMore = this.feed.querySelector('.feed-more');
    if (existingMore) existingMore.remove();

    // Remove cards that no longer match.
    for (const [id, node] of this.cardNodes) {
      if (!wanted.has(id)) {
        node.remove();
        this.cardNodes.delete(id);
      }
    }

    for (const vehicle of list) {
      const isFavorite = favorites.has(String(vehicle.routeId));
      const signature = [
        getLang(),
        vehicle.routeId,
        vehicle.tripHeadsign,
        vehicle.routeName,
        Math.round(vehicle.speedKmh),
        vehicle.occupancy,
        isFavorite ? '1' : '0',
        state.selectedVehicleId === vehicle.vehicleId ? '1' : '0',
        state.followVehicleId === vehicle.vehicleId ? '1' : '0',
      ].join('|');

      let node = this.cardNodes.get(vehicle.vehicleId);
      if (!node || node.dataset.signature !== signature) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderVehicleCard(vehicle, {
          isFavorite,
          isSelected: state.selectedVehicleId === vehicle.vehicleId,
          isFollowed: state.followVehicleId === vehicle.vehicleId,
        }).trim();
        const next = wrapper.firstElementChild;
        next.dataset.signature = signature;
        if (node) {
          node.replaceWith(next);
        }
        this.cardNodes.set(vehicle.vehicleId, next);
        node = next;
      }
    }

    // Re-order keyed nodes without rebuilding the list.
    let reference = null;
    const moreAfter = filtered.length > max;
    const desired = list.map((vehicle) => this.cardNodes.get(vehicle.vehicleId)).filter(Boolean);
    desired.forEach((node, index) => {
      const current = this.feed.children[index];
      if (current !== node) this.feed.insertBefore(node, current || null);
    });

    if (moreAfter) {
      const more = document.createElement('div');
      more.className = 'feed-more';
      more.textContent = t('feed.more', {
        shown: formatNumber(max),
        total: formatNumber(filtered.length),
      });
      this.feed.append(more);
    }

    void reference;
  }

  updateAges() {
    const now = Date.now();
    const elements = document.querySelectorAll('[data-ping]');
    for (const el of elements) {
      el.textContent = timeAgo(Number(el.dataset.ping), now);
    }
  }

  focusSearch() {
    this.search.focus();
    this.search.select();
  }

  clearSearchInput() {
    if (!this.search.value) return false;
    this.search.value = '';
    this.clearSearch.hidden = true;
    if (this.handlers.onSearch) this.handlers.onSearch('');
    return true;
  }
}
