// Composants HTML réutilisables : cartes, rangées, grilles, jauge d'impulsions.
import { esc, img, year, $$ } from './util.js';
import { state } from './store.js';

/** Normalise une ligne Supabase (ratings/watchlist) en objet "film" TMDB minimal. */
export function rowToMovie(r) {
  return {
    id: r.movie_id,
    title: r.title,
    poster_path: r.poster_path,
    release_date: r.release_year ? String(r.release_year) : '',
    vote_average: null,
  };
}

export function cardHTML(m, opts = {}) {
  const id = Number(m.id) | 0;
  const title = m.title || m.original_title || 'Sans titre';
  const poster = m.poster_path
    ? `<img src="${esc(img(m.poster_path, 'w342'))}" alt="" loading="lazy" decoding="async">`
    : `<div class="noposter"><span>${esc(title)}</span></div>`;
  const vote = typeof m.vote_average === 'number' && m.vote_count !== 0 ? m.vote_average.toFixed(1) : null;
  return `<a class="card" href="#/film/${id}" data-id="${id}" title="${esc(title)}">
    <div class="card-poster">
      ${poster}
      ${vote ? `<span class="badge badge-tmdb" title="Note TMDB">★ ${esc(vote)}</span>` : ''}
      ${opts.theirScore ? `<span class="badge badge-their" title="Sa note">${opts.theirScore | 0}</span>` : ''}
      <span class="badge badge-mine" title="Ta note" hidden></span>
      <span class="badge badge-wl" title="Dans ta watchlist" hidden>◆</span>
    </div>
    <div class="card-body">
      <h3 class="card-title">${esc(title)}</h3>
      <span class="card-year">${esc(year(m.release_date))}</span>
      ${opts.reason ? `<p class="card-reason">${opts.reason}</p>` : ''}
    </div>
  </a>`;
}

/** Met à jour les badges perso (note + watchlist) de toutes les cartes affichées. */
export function refreshBadges(root = document) {
  for (const card of $$('.card[data-id]', root)) {
    const id = Number(card.dataset.id);
    const mine = state.ratings.get(id);
    const b = card.querySelector('.badge-mine');
    if (b) {
      b.hidden = !mine;
      b.textContent = mine ? `⚡${mine.score}` : '';
    }
    const w = card.querySelector('.badge-wl');
    if (w) w.hidden = !state.watchlist.has(id);
  }
}

export function rowHTML(title, movies, opts = {}) {
  const items = (movies || []).filter((m) => m && m.id);
  const body = items.length
    ? `<div class="row-track">${items.map((m) => cardHTML(m, opts.cardOpts?.(m) || {})).join('')}</div>`
    : `<p class="muted row-empty">${esc(opts.empty || 'Aucun signal trouvé.')}</p>`;
  return `<section class="row" ${opts.id ? `id="${esc(opts.id)}"` : ''}>
    <header class="row-head">
      <h2 class="row-title">${opts.rawTitle ? title : esc(title)}</h2>
      ${opts.link ? `<a class="row-link" href="${esc(opts.link)}">tout voir ›</a>` : ''}
      ${items.length > 3 ? `<div class="row-arrows"><button class="row-arrow" data-dir="-1" aria-label="Défiler à gauche">‹</button><button class="row-arrow" data-dir="1" aria-label="Défiler à droite">›</button></div>` : ''}
    </header>
    ${body}
  </section>`;
}

export function rowSkeleton(title) {
  return `<section class="row"><header class="row-head"><h2 class="row-title">${esc(title)}</h2></header>
    <div class="row-track">${'<div class="card skeleton"><div class="card-poster"></div></div>'.repeat(8)}</div></section>`;
}

export function gridHTML(movies, opts = {}) {
  return (movies || [])
    .filter((m) => m && m.id)
    .map((m) => cardHTML(m, opts.cardOpts?.(m) || {}))
    .join('');
}

export function gridSkeleton(n = 12) {
  return '<div class="card skeleton"><div class="card-poster"></div></div>'.repeat(n);
}

// ---------- Jauge d'impulsions (10 segments) ----------
export function gaugeHTML(value = 0, { interactive = false, label = 'Impulsion' } = {}) {
  const v = Math.max(0, Math.min(10, Math.round(value)));
  const segs = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    const cls = `seg${n <= v ? ' on' : ''}`;
    return interactive
      ? `<button type="button" class="${cls}" data-v="${n}" aria-label="${n} sur 10"></button>`
      : `<span class="${cls}"></span>`;
  }).join('');
  return `<div class="gauge${interactive ? ' gauge-input' : ''}" ${
    interactive ? `role="slider" tabindex="0" aria-valuemin="1" aria-valuemax="10" aria-valuenow="${v}" aria-label="${esc(label)}"` : `aria-label="${v} sur 10"`
  } data-value="${v}">${segs}</div>`;
}

/** Rend une jauge interactive : aperçu au survol, clic/clavier pour choisir. */
export function bindGauge(el, onChange) {
  const segs = [...el.querySelectorAll('.seg')];
  const paint = (n, preview = false) => {
    segs.forEach((s, i) => {
      s.classList.toggle('on', i < n);
      s.classList.toggle('preview', preview && i < n);
    });
  };
  const current = () => Number(el.dataset.value) || 0;
  const set = (n) => {
    el.dataset.value = n;
    el.setAttribute('aria-valuenow', n);
    paint(n);
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
    onChange?.(n);
  };
  segs.forEach((s) => {
    s.addEventListener('mouseenter', () => paint(Number(s.dataset.v), true));
    s.addEventListener('focus', () => paint(Number(s.dataset.v), true));
    s.addEventListener('click', () => set(Number(s.dataset.v)));
  });
  el.addEventListener('mouseleave', () => paint(current()));
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      set(Math.min(10, current() + 1));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      set(Math.max(1, current() - 1));
    }
  });
}

// Défilement des rangées via les flèches (délégation globale).
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.row-arrow');
  if (!btn) return;
  const track = btn.closest('.row')?.querySelector('.row-track');
  if (track) track.scrollBy({ left: Number(btn.dataset.dir) * track.clientWidth * 0.85, behavior: 'smooth' });
});
