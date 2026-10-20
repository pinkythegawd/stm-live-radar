/**
 * Leaflet map controller.
 *
 * Design goals:
 *  - Never destroy/recreate markers during a refresh (no flicker, popups stay).
 *  - Smoothly glide markers to new GPS coordinates. CSS transitions handle the
 *    whole fleet on the compositor; the selected/followed bus is animated in JS
 *    so its open popup stays glued to it.
 *  - Respect the user's viewport: syncs never recenter or change zoom.
 */

import { APP_CONFIG } from '../config.js';
import { escapeHtml } from '../utils/format.js';
import { renderPopup } from '../ui/templates.js';
import { t } from '../i18n.js';

const L = window.L;

function markerTitle(vehicle) {
  return t('map.markerTitle', { route: vehicle.routeId, fleet: vehicle.vehicleId });
}

function markerHtml(vehicle) {
  const route = String(vehicle.routeId);
  const long = route.length > 2;
  return `
    <div class="bus-marker" style="--bus-color:${escapeHtml(vehicle.color || '#009ee0')};--bearing:${Number(vehicle.bearing) || 0}deg">
      <div class="bus-marker__heading" aria-hidden="true">
        <svg viewBox="0 0 10 10"><path d="M5 0.4 9.4 9.2 5 7.1 0.6 9.2Z"/></svg>
      </div>
      <div class="bus-marker__pill ${long ? 'bus-marker__pill--long' : ''}">${escapeHtml(route)}</div>
    </div>`;
}

export class MapController {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.map = null;
    this.markers = new Map();
    this.animations = new Map();
    this.animationFrame = null;
    this.userMarker = null;
    this.userCircle = null;
    this.pendingPopupTimer = null;
    this.tileErrorShown = false;
    this.tilesAttribution = null;
    this.lastFollowPanAt = 0;
  }

  init() {
    const { map: mapConfig } = APP_CONFIG;

    this.map = L.map(this.container, {
      center: mapConfig.center,
      zoom: mapConfig.zoom,
      minZoom: mapConfig.minZoom,
      maxZoom: mapConfig.maxZoom,
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBounds: mapConfig.maxBounds,
      maxBoundsViscosity: 0.7,
      preferCanvas: true,
    });

    this.tilesAttribution = t('map.tilesAttribution');
    this.tiles = L.tileLayer(mapConfig.tileUrl, {
      attribution: this.tilesAttribution,
      maxZoom: mapConfig.maxZoom,
      maxNativeZoom: mapConfig.maxNativeZoom,
      detectRetina: false,
    }).addTo(this.map);

    if (mapConfig.labelUrl) {
      this.labels = L.tileLayer(mapConfig.labelUrl, {
        maxZoom: mapConfig.maxZoom,
        maxNativeZoom: mapConfig.maxNativeZoom,
        detectRetina: false,
        pane: 'overlayPane',
        interactive: false,
        opacity: 0.9,
      }).addTo(this.map);
    }

    this.tiles.on('tileerror', () => {
      if (this.tileErrorShown) return;
      this.tileErrorShown = true;
      if (this.options.onTileError) this.options.onTileError();
    });

    // Leaflet hard-codes the close-button label in English.
    this.map.on('popupopen', (event) => {
      const closeButton = event.popup.getElement()?.querySelector('.leaflet-popup-close-button');
      if (closeButton) closeButton.setAttribute('aria-label', t('map.closePopup'));
    });

    L.control.zoom({
      position: 'bottomright',
      zoomInTitle: t('map.zoomIn'),
      zoomOutTitle: t('map.zoomOut'),
    }).addTo(this.map);
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(this.map);

    // Disable marker glide while the map itself moves/zooms.
    const setMoving = () => this.container.classList.add('is-moving');
    const clearMoving = () => this.container.classList.remove('is-moving');
    this.map.on('movestart', setMoving);
    this.map.on('moveend', clearMoving);
    this.map.on('zoomstart', setMoving);
    this.map.on('zoomend', clearMoving);

    // Delegate popup actions (follow / favourite).
    this.container.addEventListener('click', (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      const { action } = actionEl.dataset;
      if (action === 'toggle-follow') {
        event.preventDefault();
        if (this.options.onToggleFollow) this.options.onToggleFollow(actionEl.dataset.vehicleId);
      } else if (action === 'toggle-favorite') {
        event.preventDefault();
        if (this.options.onToggleFavorite) this.options.onToggleFavorite(actionEl.dataset.routeId);
      }
    });

    if (this.options.onMapReady) this.options.onMapReady(this.map);
    return this.map;
  }

  isFavorite(routeId) {
    return this.options.isFavorite ? this.options.isFavorite(routeId) : false;
  }

  isFollowing(vehicleId) {
    return this.options.isFollowing ? this.options.isFollowing(vehicleId) : false;
  }

  popupHtml(vehicle) {
    return renderPopup(vehicle, {
      isFavorite: this.isFavorite(vehicle.routeId),
      isFollowing: this.isFollowing(vehicle.vehicleId),
    });
  }

  createMarker(vehicle) {
    const marker = L.marker([vehicle.latitude, vehicle.longitude], {
      icon: L.divIcon({
        className: 'bus-icon',
        html: markerHtml(vehicle),
        iconSize: [52, 36],
        iconAnchor: [26, 18],
        popupAnchor: [0, -15],
      }),
      riseOnHover: true,
      keyboard: false,
      title: markerTitle(vehicle),
      zIndexOffset: 100,
      autoPanOnFocus: false,
    });

    marker.bindPopup(() => this.popupHtml(this.markers.get(vehicle.vehicleId)?.vehicle || vehicle), {
      maxWidth: 320,
      minWidth: 300,
      className: 'bus-popup',
      closeButton: true,
      offset: [0, -2],
      autoPanPaddingTopLeft: [24, 90],
      autoPanPaddingBottomRight: [24, 50],
    });

    marker.on('click', () => {
      if (this.options.onSelect) this.options.onSelect(vehicle.vehicleId);
    });

    marker.on('popupopen', () => {
      const entry = this.markers.get(vehicle.vehicleId);
      if (entry && entry.element) entry.element.classList.add('has-popup');
    });
    marker.on('popupclose', () => {
      const entry = this.markers.get(vehicle.vehicleId);
      if (entry && entry.element) entry.element.classList.remove('has-popup');
    });

    marker.addTo(this.map);

    const entry = {
      marker,
      vehicle,
      element: marker.getElement() ? marker.getElement().querySelector('.bus-marker') : null,
      routeId: String(vehicle.routeId),
      dimmed: false,
      nearby: false,
      animation: null,
    };

    this.markers.set(vehicle.vehicleId, entry);
    if (entry.element) {
      entry.element.classList.add('is-new');
      setTimeout(() => entry.element && entry.element.classList.remove('is-new'), 400);
    }
    return entry;
  }

  updateMarker(entry, vehicle) {
    const previous = entry.vehicle;
    entry.vehicle = vehicle;

    if (entry.routeId !== String(vehicle.routeId)) {
      entry.routeId = String(vehicle.routeId);
      entry.marker.setIcon(L.divIcon({
        className: 'bus-icon',
        html: markerHtml(vehicle),
        iconSize: [52, 36],
        iconAnchor: [26, 18],
        popupAnchor: [0, -15],
      }));
      entry.element = entry.marker.getElement() ? entry.marker.getElement().querySelector('.bus-marker') : null;
    }

    if (entry.element) {
      entry.element.style.setProperty('--bearing', `${Number(vehicle.bearing) || 0}deg`);
      entry.element.style.setProperty('--bus-color', vehicle.color || '#009ee0');
    }

    // Selected/followed buses use JS interpolation so their popup tracks them.
    const isFocused = vehicle.vehicleId === this.options.getSelectedId?.()
      || vehicle.vehicleId === this.options.getFollowId?.();

    const from = entry.marker.getLatLng();
    const to = L.latLng(vehicle.latitude, vehicle.longitude);
    const distance = from.distanceTo(to);

    if (isFocused) {
      this.startJsAnimation(entry, from, to);
    } else if (distance > 1800) {
      // Route reassignment or GPS jump: snap instead of flying across the city.
      if (entry.element) entry.element.classList.add('no-anim');
      entry.marker.setLatLng(to);
      requestAnimationFrame(() => {
        if (entry.element) entry.element.classList.remove('no-anim');
      });
    } else {
      entry.marker.setLatLng(to);
    }

    if (entry.marker.isPopupOpen()) {
      entry.marker.setPopupContent(this.popupHtml(vehicle));
    }

    // Keep the tooltip accessible label current.
    entry.marker.options.title = markerTitle(vehicle);
    if (entry.marker.getElement()) entry.marker.getElement().setAttribute('title', entry.marker.options.title);

    // Follow camera once per refresh.
    if (vehicle.vehicleId === this.options.getFollowId?.()) {
      this.followVehicle(vehicle);
    }

    void previous;
  }

  startJsAnimation(entry, from, to) {
    const now = performance.now();
    const duration = APP_CONFIG.ui.markerAnimationMs;
    entry.animation = { from, to, start: now, duration };
    this.animations.set(entry.vehicle.vehicleId, entry);

    if (this.animationFrame) return;
    const fps = APP_CONFIG.ui.markerAnimationFps;
    const interval = 1000 / fps;
    let last = 0;

    const step = (timestamp) => {
      if (timestamp - last >= interval) {
        last = timestamp;
        for (const [id, item] of this.animations) {
          const anim = item.animation;
          if (!anim) {
            this.animations.delete(id);
            continue;
          }
          const progress = Math.min(1, (timestamp - anim.start) / anim.duration);
          const eased = 1 - (1 - progress) ** 3;
          const lat = anim.from.lat + (anim.to.lat - anim.from.lat) * eased;
          const lng = anim.from.lng + (anim.to.lng - anim.from.lng) * eased;
          item.marker.setLatLng([lat, lng]);
          if (progress >= 1) {
            item.animation = null;
            this.animations.delete(id);
          }
        }
      }
      if (this.animations.size) {
        this.animationFrame = requestAnimationFrame(step);
      } else {
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(step);
  }

  /**
   * Apply a full vehicle snapshot.
   * @param {object[]} vehicles
   * @param {{visibleIds?: Set<string>, selectedId?: string|null, followId?: string|null, nearbyIds?: Set<string>}} state
   */
  sync(vehicles, state = {}) {
    if (!this.map) return;

    const alive = new Set();
    const bounds = this.map.getBounds().pad(0.4);

    for (const vehicle of vehicles) {
      alive.add(vehicle.vehicleId);
      let entry = this.markers.get(vehicle.vehicleId);
      if (!entry) {
        entry = this.createMarker(vehicle);
      } else {
        this.updateMarker(entry, vehicle);
      }

      if (!entry.element) continue;

      const isVisible = state.visibleIds ? state.visibleIds.has(vehicle.vehicleId) : true;
      const isNearby = state.nearbyIds ? state.nearbyIds.has(vehicle.vehicleId) : false;
      const isSelected = state.selectedId === vehicle.vehicleId;
      const isFollowed = state.followId === vehicle.vehicleId;
      const isOnScreen = bounds.contains([vehicle.latitude, vehicle.longitude]);

      entry.element.classList.toggle('is-dimmed', !isVisible);
      entry.element.classList.toggle('is-nearby', isNearby);
      entry.element.classList.toggle('is-selected', isSelected);
      entry.element.classList.toggle('is-followed', isFollowed);

      // Render priority: selected > followed > nearby > on-screen > off-screen.
      const z = isSelected ? 900 : isFollowed ? 850 : isNearby ? 600 : isOnScreen ? 300 : 100;
      entry.marker.setZIndexOffset(z);
      entry.dimmed = !isVisible;
      entry.nearby = isNearby;
    }

    for (const [id, entry] of this.markers) {
      if (alive.has(id)) continue;
      entry.marker.remove();
      this.markers.delete(id);
      this.animations.delete(id);
    }
  }

  refreshPopup(vehicleId) {
    const entry = this.markers.get(vehicleId);
    if (!entry) return;
    if (entry.marker.isPopupOpen()) {
      entry.marker.setPopupContent(this.popupHtml(entry.vehicle));
    }
  }

  /** Re-render translated labels after an EN/FR switch. */
  refreshLocalizedContent() {
    for (const entry of this.markers.values()) {
      entry.marker.options.title = markerTitle(entry.vehicle);
      if (entry.marker.getElement()) {
        entry.marker.getElement().setAttribute('title', entry.marker.options.title);
      }
      if (entry.marker.isPopupOpen()) {
        entry.marker.setPopupContent(this.popupHtml(entry.vehicle));
      }
    }

    const closeButton = this.container.querySelector('.leaflet-popup-close-button');
    if (closeButton) closeButton.setAttribute('aria-label', t('map.closePopup'));

    if (this.map.attributionControl && this.tilesAttribution) {
      const next = t('map.tilesAttribution');
      if (next !== this.tilesAttribution) {
        this.map.attributionControl.removeAttribution(this.tilesAttribution);
        this.map.attributionControl.addAttribution(next);
        this.tilesAttribution = next;
        this.tiles.options.attribution = next;
      }
    }

    const zoomIn = this.container.querySelector('.leaflet-control-zoom-in');
    const zoomOut = this.container.querySelector('.leaflet-control-zoom-out');
    if (zoomIn) {
      zoomIn.setAttribute('title', t('map.zoomIn'));
      zoomIn.setAttribute('aria-label', t('map.zoomIn'));
    }
    if (zoomOut) {
      zoomOut.setAttribute('title', t('map.zoomOut'));
      zoomOut.setAttribute('aria-label', t('map.zoomOut'));
    }
  }

  focusVehicle(vehicle, options = {}) {
    const entry = this.markers.get(vehicle.vehicleId);
    if (!entry || !this.map) return false;

    clearTimeout(this.pendingPopupTimer);
    const target = [vehicle.latitude, vehicle.longitude];
    const zoom = Math.max(this.map.getZoom(), APP_CONFIG.map.focusZoom);

    if (options.fly === false) {
      this.map.panTo(target, { animate: true, duration: 0.7 });
      if (options.open !== false) entry.marker.openPopup();
      return true;
    }

    this.map.flyTo(target, zoom, { duration: 0.85, easeLinearity: 0.28 });
    if (options.open !== false) {
      this.pendingPopupTimer = setTimeout(() => {
        const current = this.markers.get(vehicle.vehicleId);
        if (current) current.marker.openPopup();
      }, APP_CONFIG.ui.markerAnimationMs * 0.85);
    }
    return true;
  }

  followVehicle(vehicle) {
    if (!this.map) return;
    const now = performance.now();
    if (now - this.lastFollowPanAt < 700) return;
    this.lastFollowPanAt = now;

    const center = this.map.getCenter();
    const target = L.latLng(vehicle.latitude, vehicle.longitude);
    if (center.distanceTo(target) < 8) return;

    if (this.map.getZoom() < APP_CONFIG.map.focusZoom - 0.5) {
      this.map.setView(target, APP_CONFIG.map.focusZoom, { animate: true });
    } else {
      this.map.panTo(target, { animate: true, duration: 0.9, easeLinearity: 0.3 });
    }
  }

  startFollowing(vehicle) {
    const entry = this.markers.get(vehicle.vehicleId);
    this.map.flyTo([vehicle.latitude, vehicle.longitude], APP_CONFIG.map.focusZoom, {
      duration: 0.8,
      easeLinearity: 0.3,
    });
    clearTimeout(this.pendingPopupTimer);
    this.pendingPopupTimer = setTimeout(() => {
      const current = this.markers.get(vehicle.vehicleId);
      if (current) current.marker.openPopup();
    }, 850);
    return Boolean(entry);
  }

  showUserLocation(latlng, radius) {
    this.clearUserLocation();

    this.userCircle = L.circle(latlng, {
      radius,
      color: '#38bdf8',
      weight: 1.5,
      opacity: 0.8,
      fillColor: '#0ea5e9',
      fillOpacity: 0.07,
      dashArray: '4 7',
      interactive: false,
    }).addTo(this.map);

    this.userMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'user-icon',
        html: '<div class="user-location"><span></span><i></i></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(this.map);

    this.map.flyTo(latlng, APP_CONFIG.nearMe.zoom, { duration: 1.1, easeLinearity: 0.25 });
  }

  clearUserLocation() {
    if (this.userCircle) {
      this.userCircle.remove();
      this.userCircle = null;
    }
    if (this.userMarker) {
      this.userMarker.remove();
      this.userMarker = null;
    }
  }

  resetView() {
    this.map.flyTo(APP_CONFIG.map.center, APP_CONFIG.map.zoom, { duration: 1.05 });
  }

  invalidate() {
    if (this.map) {
      requestAnimationFrame(() => this.map.invalidateSize({ animate: false }));
    }
  }

  openPopup(vehicleId) {
    const entry = this.markers.get(vehicleId);
    if (entry) entry.marker.openPopup();
  }
}
