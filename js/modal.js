// Fiche film en modale (#/film/ID).
import * as tmdb from './tmdb.js';
import * as store from './store.js';
import { state, isLogged } from './store.js';
import { esc, img, year, runtime, fmtDate, toast, avatarHTML, errorBlock, plural, CFG, $ } from './util.js';
import { cardHTML, refreshBadges, gaugeHTML, bindGauge } from './components.js';

const modal = () => document.getElementById('modal');
let current = null; // film affiché
let token = 0;
let onRequestClose = () => {};

export const isOpen = () => !modal().hidden;
export function setCloseHandler(fn) {
  onRequestClose = fn;
}

export function closeModal() {
  const el = modal();
  if (el.hidden) return;
  token++;
  stopVideo();
  el.hidden = true;
  el.innerHTML = '';
  current = null;
  document.body.classList.remove('modal-open');
}

function stopVideo() {
  const p = document.getElementById('player');
  if (p) p.innerHTML = '';
  document.getElementById('player-wrap')?.classList.remove('playing');
}

// ---------- Vidéos ----------
function rankVideos(videos, origLang) {
  const typeRank = (v) => (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2);
  const langRank = (v) => (v.iso_639_1 === 'fr' ? 0 : v.iso_639_1 === origLang ? 1 : v.iso_639_1 === 'en' ? 2 : 3);
  return (videos || [])
    .filter((v) => v.site === 'YouTube' && v.key)
    .sort(
      (a, b) =>
        typeRank(a) * 10 + langRank(a) - (typeRank(b) * 10 + langRank(b)) ||
        Number(b.official) - Number(a.official) ||
        (b.size || 0) - (a.size || 0)
    );
}

function videoLabel(v, origLang) {
  const lang = v.iso_639_1 === 'fr' ? 'VF' : v.iso_639_1 === origLang ? 'VO' : (v.iso_639_1 || '??').toUpperCase();
  const type = { Trailer: 'Bande-annonce', Teaser: 'Teaser', Clip: 'Extrait', Featurette: 'Making-of', 'Behind the Scenes': 'Coulisses' }[v.type] || v.type;
  return `${type} · ${lang}`;
}

function playVideo(key) {
  const p = document.getElementById('player');
  if (!p) return;
  const safe = encodeURIComponent(key);
  p.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${safe}?autoplay=1&rel=0&modestbranding=1" title="Bande-annonce" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  document.getElementById('player-wrap')?.classList.add('playing');
  document.getElementById('player-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Où regarder ----------
function providersHTML(wp) {
  const fr = wp?.results?.[CFG.REGION];
  if (!fr) return `<p class="muted">Aucune plateforme détectée en ${esc(CFG.REGION)}. Le film se cache dans les ombres.</p>`;
  const group = (label, list) =>
    list?.length
      ? `<div class="prov-group"><h4>${label}</h4><div class="prov-list">${list
          .map(
            (p) =>
              `<span class="prov" title="${esc(p.provider_name)}">${
                p.logo_path ? `<img src="${esc(img(p.logo_path, 'w92'))}" alt="${esc(p.provider_name)}" loading="lazy">` : esc(p.provider_name)
              }</span>`
          )
          .join('')}</div></div>`
      : '';
  const html = group('Streaming', fr.flatrate) + group('Location', fr.rent) + group('Achat', fr.buy) + group('Gratuit', fr.free || fr.ads);
  return (
    (html || '<p class="muted">Aucune offre pour l’instant.</p>') +
    `<p class="tiny muted">Données fournies par JustWatch${fr.link ? ` · <a href="${esc(fr.link)}" target="_blank" rel="noopener">voir les offres</a>` : ''}</p>`
  );
}

// ---------- Rendu ----------
export async function openMovie(id) {
  const el = modal();
  const my = ++token;
  if (el.hidden) {
    el.hidden = false;
    document.body.classList.add('modal-open');
  }
  stopVideo();
  el.innerHTML = `<div class="modal-backdrop" data-close></div>
    <div class="modal-panel" role="dialog" aria-modal="true" aria-label="Fiche film">
      <button class="modal-close" data-close aria-label="Fermer">✕</button>
      <div class="modal-loading"><span class="glitch-text" data-text="SYNCHRONISATION…">SYNCHRONISATION…</span></div>
    </div>`;
  bindClose(el);

  let m;
  try {
    m = await tmdb.movie(id);
  } catch (err) {
    if (my !== token) return;
    $('.modal-loading', el).outerHTML = errorBlock(err);
    return;
  }
  if (my !== token) return;
  current = m;
  render(m);
}

function bindClose(el) {
  el.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', (e) => {
      if (e.target === b || b.classList.contains('modal-close')) onRequestClose();
    })
  );
}

function render(m) {
  const el = modal();
  const title = m.title || m.original_title;
  const orig = m.original_language;
  const videos = rankVideos(m.videos?.results, orig);
  const main = videos[0];
  const director = (m.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name);
  const cast = (m.credits?.cast || []).slice(0, 12);
  let recos = m.recommendations?.results || [];
  if (!recos.length) recos = m.similar?.results || [];
  recos = recos.slice(0, 20);

  el.querySelector('.modal-panel').innerHTML = `
    <button class="modal-close" data-close aria-label="Fermer">✕</button>
    <div class="m-hero" style="${m.backdrop_path ? `--bgimg:url('${esc(img(m.backdrop_path, 'w1280'))}')` : ''}">
      <div class="m-hero-inner">
        <div class="m-poster">${m.poster_path ? `<img src="${esc(img(m.poster_path, 'w342'))}" alt="Affiche de ${esc(title)}">` : `<div class="noposter"><span>${esc(title)}</span></div>`}</div>
        <div class="m-head">
          <h2 class="m-title">${esc(title)}</h2>
          ${m.original_title && m.original_title !== title ? `<p class="muted m-orig">${esc(m.original_title)}</p>` : ''}
          <p class="m-meta">
            <span>${esc(year(m.release_date))}</span>
            ${m.runtime ? `<span>${esc(runtime(m.runtime))}</span>` : ''}
            ${(m.genres || []).map((g) => `<a class="chip chip-sm" href="#/genre/${g.id | 0}">${esc(g.name)}</a>`).join('')}
          </p>
          <div class="m-score">
            <span class="m-tmdb">★ ${m.vote_average ? esc(m.vote_average.toFixed(1)) : '—'}<small>/10 · TMDB · ${esc(plural(m.vote_count || 0, 'vote', 'votes'))}</small></span>
          </div>
          ${director.length ? `<p class="m-director"><span class="muted">Réalisation</span> ${esc(director.join(', '))}</p>` : ''}
          <div class="m-actions">
            ${main ? `<button class="btn btn-pink" data-play="${esc(main.key)}">▶ Bande-annonce</button>` : '<button class="btn" disabled>Pas de bande-annonce</button>'}
            <button class="btn btn-ghost" id="m-wl"></button>
            <button class="btn btn-ghost" id="m-copy">⧉ Copier le lien</button>
          </div>
        </div>
      </div>
    </div>

    <div class="m-body">
      <div class="player-wrap" id="player-wrap">
        <div class="player" id="player"></div>
      </div>
      ${
        videos.length > 1
          ? `<div class="m-videos">${videos
              .slice(0, 12)
              .map((v) => `<button class="chip" data-play="${esc(v.key)}" title="${esc(v.name)}">▶ ${esc(videoLabel(v, orig))}</button>`)
              .join('')}</div>`
          : ''
      }

      <section class="m-section">
        <h3 class="m-h">Synopsis</h3>
        <p class="m-overview">${esc(m.overview || 'Aucun synopsis en français. Les données sont corrompues, choom.')}</p>
      </section>

      <section class="m-section m-cols">
        <div>
          <h3 class="m-h">Envoyer une impulsion</h3>
          <div id="m-rate"></div>
        </div>
        <div>
          <h3 class="m-h">Où regarder</h3>
          ${providersHTML(m['watch/providers'])}
        </div>
      </section>

      ${
        cast.length
          ? `<section class="m-section"><h3 class="m-h">Casting</h3><div class="cast">${cast
              .map(
                (c) => `<div class="cast-item">
                  <div class="cast-photo">${c.profile_path ? `<img src="${esc(img(c.profile_path, 'w185'))}" alt="" loading="lazy">` : '<span>?</span>'}</div>
                  <strong>${esc(c.name)}</strong><span class="muted">${esc(c.character || '')}</span>
                </div>`
              )
              .join('')}</div></section>`
          : ''
      }

      <section class="m-section">
        <h3 class="m-h">Avis du Réseau</h3>
        <div id="m-community"><p class="muted">Lecture des impulsions…</p></div>
      </section>

      ${
        recos.length
          ? `<section class="m-section"><h3 class="m-h">Connexions proches</h3><div class="row"><div class="row-track">${recos
              .map((r) => cardHTML(r))
              .join('')}</div></div></section>`
          : ''
      }
    </div>`;

  bindClose(el);
  el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => playVideo(b.dataset.play)));
  $('#m-copy', el).addEventListener('click', copyLink);
  $('#m-wl', el).addEventListener('click', toggleWl);
  // Les films proches remplacent la fiche courante sans empiler l'historique.
  el.querySelectorAll('.m-body .card').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      location.replace(a.getAttribute('href'));
    })
  );
  el.querySelector('.modal-panel').scrollTop = 0;
  renderUserBits();
  loadCommunity(m.id);
}

/** Parties qui dépendent de l'utilisateur (note, watchlist). */
export function renderUserBits() {
  const el = modal();
  if (!current || el.hidden) return;
  const m = current;
  const wl = $('#m-wl', el);
  if (wl) {
    const inWl = state.watchlist.has(m.id);
    wl.textContent = inWl ? '◆ Dans ta watchlist' : '◇ Watchlist';
    wl.classList.toggle('active', inWl);
  }
  refreshBadges(el);

  const box = $('#m-rate', el);
  if (!box) return;
  if (!state.enabled) {
    box.innerHTML = `<p class="muted">Mode lecture : les comptes sont désactivés sur ce nœud.</p>`;
    return;
  }
  if (!isLogged()) {
    box.innerHTML = `<p class="muted">Connecte-toi au Réseau pour noter ce film.</p><a class="btn btn-cyan" href="#/acces">Se connecter</a>`;
    return;
  }
  const mine = state.ratings.get(m.id);
  box.innerHTML = `
    ${gaugeHTML(mine?.score || 0, { interactive: true, label: 'Ta note' })}
    <p class="gauge-readout"><span id="m-score-val">${mine ? mine.score : '–'}</span>/10 <span class="muted" id="m-score-hint">${mine ? 'impulsion enregistrée' : 'clique sur un segment'}</span></p>
    <label class="field">
      <span class="field-label">Critique (optionnelle)</span>
      <textarea id="m-review" maxlength="1000" rows="3" placeholder="Transmets ton ressenti au Réseau…">${esc(mine?.review || '')}</textarea>
      <span class="counter"><span id="m-count">${(mine?.review || '').length}</span>/1000</span>
    </label>
    <div class="m-rate-actions">
      <button class="btn btn-pink" id="m-save">Enregistrer</button>
      ${mine ? '<button class="btn btn-ghost" id="m-del">Supprimer</button>' : ''}
    </div>`;
  const gauge = $('.gauge', box);
  let score = mine?.score || 0;
  bindGauge(gauge, (n) => {
    score = n;
    $('#m-score-val', box).textContent = n;
    $('#m-score-hint', box).textContent = mine && mine.score === n ? 'impulsion enregistrée' : 'non enregistrée';
  });
  const ta = $('#m-review', box);
  ta.addEventListener('input', () => ($('#m-count', box).textContent = ta.value.length));
  $('#m-save', box).addEventListener('click', async (e) => {
    if (!score) return toast('Choisis une intensité d’impulsion d’abord.', 'warn');
    e.target.disabled = true;
    try {
      await store.saveRating(m, score, ta.value.trim());
      toast(`Impulsion ${score}/10 transmise, choom.`, 'ok');
      renderUserBits();
      loadCommunity(m.id);
    } catch (err) {
      toast('Échec de transmission : ' + err.message, 'err');
      e.target.disabled = false;
    }
  });
  $('#m-del', box)?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await store.deleteRating(m.id);
      toast('Impulsion effacée du Réseau.', 'ok');
      renderUserBits();
      loadCommunity(m.id);
    } catch (err) {
      toast('Échec : ' + err.message, 'err');
      e.target.disabled = false;
    }
  });
}

async function toggleWl() {
  if (!current) return;
  if (!state.enabled) return toast('Mode lecture : pas de watchlist sans comptes.', 'warn');
  if (!isLogged()) return toast('Connecte-toi pour gérer ta watchlist, choom.', 'warn');
  try {
    const added = await store.toggleWatchlist(current);
    toast(added ? 'Ajouté à ta watchlist.' : 'Retiré de ta watchlist.', 'ok');
    renderUserBits();
  } catch (err) {
    toast('Échec : ' + err.message, 'err');
  }
}

async function copyLink() {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Lien copié. Partage le signal.', 'ok');
}

async function loadCommunity(movieId) {
  const box = document.getElementById('m-community');
  if (!box) return;
  if (!state.enabled) {
    box.innerHTML = '<p class="muted">Le Réseau communautaire est hors ligne (mode lecture).</p>';
    return;
  }
  const my = token;
  try {
    const rows = await store.getMovieCommunity(movieId);
    if (my !== token || !document.getElementById('m-community')) return;
    if (!rows.length) {
      box.innerHTML = '<p class="muted">Aucune impulsion du Réseau pour l’instant. Sois le premier nœud à t’allumer.</p>';
      return;
    }
    const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
    const reviews = rows.filter((r) => r.review).slice(0, 10);
    box.innerHTML = `
      <div class="community-avg">
        <span class="big-num">${esc(avg.toFixed(1))}</span>
        <div>${gaugeHTML(avg)}<p class="muted">${esc(plural(rows.length, 'nœud a noté', 'nœuds ont noté'))} ce film</p></div>
      </div>
      ${
        reviews.length
          ? `<ul class="reviews">${reviews
              .map((r) => {
                const u = r.profiles?.username || 'nœud-fantôme';
                return `<li class="review">
                  <a class="review-head" href="#/profil/${encodeURIComponent(u)}">${avatarHTML(u, r.profiles?.avatar_hue, 'sm')}<strong>${esc(u)}</strong></a>
                  <span class="review-score">⚡${r.score | 0}/10</span>
                  <span class="muted tiny">${esc(fmtDate(r.updated_at))}</span>
                  <p>${esc(r.review)}</p>
                </li>`;
              })
              .join('')}</ul>`
          : '<p class="muted">Pas encore de critique écrite.</p>'
      }`;
  } catch (err) {
    if (my === token) box.innerHTML = `<p class="muted">Impossible de lire le Réseau : ${esc(err.message)}</p>`;
  }
}
