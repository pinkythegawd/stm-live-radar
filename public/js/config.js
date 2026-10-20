/**
 * STM Live Radar — application configuration.
 *
 * The API transport configuration lives at the top of
 * `js/services/stmApiService.js` (base URL, endpoints, headers, keys).
 * This file only holds presentation and polling defaults.
 */

export const APP_CONFIG = {
  appName: 'STM Live Radar',
  attribution: {
    name: 'pinkythegawd (MikePinku)',
    url: 'https://github.com/pinkythegawd',
  },

  map: {
    center: [45.5017, -73.5673],
    zoom: 12,
    minZoom: 10,
    maxZoom: 19,
    focusZoom: 15,
    // Esri World Dark Gray Canvas — keyless, dark, and production-friendly.
    tileUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labelUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 16,
    maxBounds: [
      [45.32, -74.12],
      [45.78, -73.38],
    ],
  },

  polling: {
    intervalMs: 15000,
    requestTimeoutMs: 12000,
    countdownTickMs: 200,
  },

  nearMe: {
    radiusMeters: 2000,
    zoom: 14,
  },

  ui: {
    maxFeedItems: 160,
    ageRefreshMs: 2000,
    markerAnimationMs: 1100,
    markerAnimationFps: 20,
    toastDurationMs: 4200,
  },

  storageKeys: {
    favorites: 'stm-live-radar:favorites:v1',
    sidebar: 'stm-live-radar:sidebar:v1',
  },
};
