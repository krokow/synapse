// Utilitaires partagés : config, échappement, DOM, avatars, toasts.

export const CFG = Object.assign(
  { TMDB_API_KEY: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', LANG: 'fr-FR', REGION: 'FR' },
  window.SYNAPSE_CONFIG || {}
);
for (const k of Object.keys(CFG)) if (typeof CFG[k] === 'string') CFG[k] = CFG[k].trim();

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
/** Échappe une valeur pour insertion en HTML (texte ou attribut). */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

export function hueFromString(s) {
  let h = 0;
  for (const ch of String(s).toLowerCase()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

/** Avatar généré : initiale sur une couleur néon dérivée du pseudo. */
export function avatarHTML(username, hue, size = 'md') {
  const u = String(username || '?');
  const h = Number.isFinite(hue) ? hue : hueFromString(u);
  const initial = [...u][0].toUpperCase();
  return `<span class="avatar avatar-${size}" style="--h:${Math.round(h) % 360}" aria-hidden="true">${esc(initial)}</span>`;
}

const IMG_BASE = 'https://image.tmdb.org/t/p/';
export function img(path, size = 'w342') {
  return path ? IMG_BASE + size + path : '';
}

export function year(date) {
  return date ? String(date).slice(0, 4) : '—';
}

export function runtime(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

export function toast(msg, type = 'info') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 3600);
}

/** Message d'erreur "street" à partir d'une erreur technique. */
export function streetError(err) {
  const msg = String(err?.message || err || '');
  if (/401|invalid api key|authentication/i.test(msg)) return 'Clé TMDB rejetée. Vérifie config.js, choom.';
  if (/failed to fetch|network/i.test(msg)) return 'Signal coupé. Vérifie ta connexion.';
  return 'Interférence sur la ligne : ' + msg;
}

export function errorBlock(err) {
  return `<div class="empty"><p class="empty-glyph">⚠</p><p>${esc(streetError(err))}</p></div>`;
}
