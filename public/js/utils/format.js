/** Small formatting helpers shared by every UI module. */

import { getLocale, t } from '../i18n.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Human relative time from a Unix timestamp in seconds. */
export function timeAgo(unixSeconds, nowMs = Date.now()) {
  if (!unixSeconds) return '—';
  const seconds = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
  if (seconds < 3) return t('time.justNow');
  if (seconds < 60) return t('time.secondsAgo', { s: seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) {
    return rest
      ? t('time.minutesSecondsAgo', { m: minutes, s: rest })
      : t('time.minutesAgo', { m: minutes });
  }
  const hours = Math.floor(minutes / 60);
  return t('time.hoursAgo', { h: hours, m: minutes % 60 });
}

export function secondsAgo(unixSeconds) {
  if (!unixSeconds) return Infinity;
  return Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
}

export function formatClock(timestampMs = Date.now()) {
  const date = new Date(timestampMs);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatTime(unixSeconds) {
  if (!unixSeconds) return '—';
  const date = new Date(unixSeconds * 1000);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDay(unixSeconds) {
  if (!unixSeconds) return '';
  return new Date(unixSeconds * 1000).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
}

export function formatNumber(value) {
  return new Intl.NumberFormat(getLocale()).format(value || 0);
}

/** Locale-aware decimal, used by the average-speed stat. */
export function formatDecimal(value, digits = 1) {
  return new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Compass heading localized to the active language (fr: O/SO/NO). */
export function compassLabel(bearing) {
  if (bearing === null || bearing === undefined || bearing === '') return '—';
  const value = Number(bearing);
  if (!Number.isFinite(value)) return '—';
  const index = Math.round((((value % 360) + 360) % 360) / 45) % 8;
  return t(`compass.${COMPASS_POINTS[index]}`);
}

export function normaliseSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function debounce(fn, delay = 140) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const OCCUPANCY_STATES = {
  EMPTY: { level: 0, color: '#64748b' },
  MANY_SEATS_AVAILABLE: { level: 1, color: '#10b981' },
  FEW_SEATS_AVAILABLE: { level: 2, color: '#22c55e' },
  STANDING_ROOM_ONLY: { level: 3, color: '#f59e0b' },
  CRUSHED_STANDING_ROOM_ONLY: { level: 4, color: '#f97316' },
  FULL: { level: 4, color: '#ef4444' },
  NOT_ACCEPTING_PASSENGERS: { level: 4, color: '#ef4444' },
  NOT_BOARDABLE: { level: 4, color: '#ef4444' },
  NO_DATA_AVAILABLE: { level: 0, color: '#64748b' },
};

/** Map GTFS occupancy to a 0–4 meter level, a colour and translated labels. */
export function occupancyLevel(status) {
  const key = Object.prototype.hasOwnProperty.call(OCCUPANCY_STATES, status)
    ? status
    : 'NO_DATA_AVAILABLE';
  const state = OCCUPANCY_STATES[key];
  return {
    ...state,
    label: t(`occupancy.short.${key}`),
    longLabel: t(`occupancy.long.${key}`),
  };
}

export function isNightRoute(routeId) {
  const n = Number.parseInt(String(routeId).replace(/\D/g, ''), 10);
  return n >= 300 && n <= 399;
}
