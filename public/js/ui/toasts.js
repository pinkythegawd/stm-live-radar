/** Lightweight toast notifications. */

import { APP_CONFIG } from '../config.js';

const MAX_TOASTS = 3;
const container = document.getElementById('toasts');

export function toast(message, type = 'info', duration = APP_CONFIG.ui.toastDurationMs) {
  if (!container) return;
  if (container.children.length >= MAX_TOASTS) {
    container.firstElementChild.remove();
  }

  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.type = type;
  el.textContent = message;
  container.append(el);

  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 260);
  }, duration);
}
