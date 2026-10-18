// SYNAPSE — point d'entrée : routage par hash, en-tête, liaison des modules.
import { $, $$, esc, avatarHTML, toast } from './util.js';
import * as tmdb from './tmdb.js';
import { initAuth, bus, state, isLogged } from './store.js';
import { refreshBadges } from './components.js';
import { openMovie, closeModal, isOpen, setCloseHandler, refreshUserParts } from './modal.js';
import { startBackground } from './bg.js';
import * as views from './views.js';

const main = document.getElementById('main');

const ROUTES = [
  [/^\/$/, views.home, 'flux'],
  [/^\/recherche$/, views.search, 'recherche'],
  [/^\/genre\/(\d+)$/, views.genre, 'flux'],
  [/^\/transmissions$/, views.transmissions, 'transmissions'],
  [/^\/roulette$/, views.roulette, 'roulette'],
  [/^\/reseau$/, views.reseau, 'reseau'],
  [/^\/profil\/([^/]+)$/, views.profil, 'profil'],
  [/^\/acces$/, views.auth, 'acces'],
];

let page = null; // { path, query, key } de la page rendue derrière la modale
let renderSeq = 0;
let filmFromApp = false; // la modale a été ouverte depuis une page du site
let onData = null; // rafraîchissement optionnel fourni par la page courante

function parseHash() {
  let h = location.hash.slice(1) || '/';
  if (!h.startsWith('/')) h = '/';
  const [path, qs] = h.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: new URLSearchParams(qs || '') };
}

function renderPage(path, query, key) {
  page = { path, query, key };
  const seq = ++renderSeq;
  const alive = () => seq === renderSeq;
  onData = null;
  let match = null;
  let view = null;
  let nav = '';
  for (const [re, fn, n] of ROUTES) {
    match = path.match(re);
    if (match) {
      view = fn;
      nav = n;
      break;
    }
  }
  if (!view) {
    main.innerHTML = `<div class="empty"><p class="empty-glyph">404</p><p>Aucun signal trouvé à cette adresse.</p><a class="btn btn-ghost" href="#/">Retour au Flux</a></div>`;
    return;
  }
  setActiveNav(nav);
  window.scrollTo(0, 0);
  main.classList.remove('page-in');
  void main.offsetWidth;
  main.classList.add('page-in');
  const params = match.slice(1).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  Promise.resolve(view(main, { alive, params, query, onData: (fn) => (onData = fn) })).catch((err) => {
    console.error(err);
    if (alive()) main.innerHTML = `<div class="empty"><p class="empty-glyph">⚠</p><p>Crash du nœud : ${esc(err.message)}</p></div>`;
  });
}

function route(force = false) {
  if (!tmdb.hasKey()) {
    views.configScreen(main);
    return;
  }
  const { path, query } = parseHash();
  const film = path.match(/^\/film\/(\d+)$/);
  if (film) {
    if (page === null) {
      filmFromApp = false;
      renderPage('/', new URLSearchParams(), '#/');
    } else if (!isOpen()) {
      filmFromApp = true;
    }
    openMovie(Number(film[1]));
    return;
  }
  const key = location.hash || '#/';
  const wasOpen = isOpen();
  closeModal();
  if (!force && wasOpen && key === page?.key) return; // simple fermeture de la modale
  renderPage(path, query, key);
}


// ---------- En-tête ----------
function setActiveNav(name) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

function renderAccount() {
  const box = $('#account');
  if (state.enabled && !state.ready) {
    box.innerHTML = `<span class="tag tag-ghost">sync…</span>`;
  } else if (!state.enabled) {
    box.innerHTML = `<span class="tag tag-ghost" title="Supabase non configuré">mode lecture</span>`;
  } else if (isLogged()) {
    const u = state.profile.username;
    box.innerHTML = `<a class="account-link" data-nav="profil" href="#/profil/${encodeURIComponent(u)}" title="Mon profil">${avatarHTML(u, state.profile.avatar_hue, 'sm')}<span class="account-name">${esc(u)}</span></a>`;
  } else {
    box.innerHTML = `<a class="btn btn-cyan btn-sm" data-nav="acces" href="#/acces">Connexion</a>`;
  }
  $$('[data-auth-only]').forEach((el) => (el.hidden = !isLogged()));
}

// ---------- Événements globaux ----------
window.addEventListener('hashchange', () => route());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen()) {
    e.preventDefault();
    closeModalFromUser();
  }
});
function closeModalFromUser() {
  if (filmFromApp) history.back();
  else location.replace(page?.key || '#/');
}
setCloseHandler(closeModalFromUser);

bus.addEventListener('auth', () => {
  renderAccount();
  // Les pages dépendent de l'état connecté : on rerend la page courante.
  if (page === null) return;
  if (isOpen()) {
    renderPage(page.path, page.query, page.key);
    refreshUserParts();
  } else {
    route(true);
  }
});
// Session restaurée : on ne rerend que ce qui dépend du compte.
const AUTH_PAGES = /^\/(transmissions|reseau|profil\/|acces)/;
bus.addEventListener('ready', () => {
  renderAccount();
  if (page === null) return;
  refreshUserParts();
  if (AUTH_PAGES.test(page.path)) {
    renderPage(page.path, page.query, page.key);
  } else {
    onData?.(); // ex. le Flux ajoute la rangée « Ta watchlist » sans tout recharger
    refreshBadges();
  }
});
bus.addEventListener('data', () => {
  onData?.();
  refreshBadges();
  renderAccount();
});

// ---------- Démarrage ----------
async function boot() {
  startBackground(document.getElementById('bg'));
  if (!tmdb.hasKey()) {
    renderAccount();
    views.configScreen(main);
    return;
  }

  const hadToken = /access_token=|error_description=/.test(location.hash);
  const errMatch = location.hash.match(/error_description=([^&]+)/);
  renderAccount();

  if (hadToken) {
    // Retour d'un lien de confirmation : supabase-js doit lire le jeton dans l'URL avant qu'on la nettoie.
    main.innerHTML = `<div class="boot"><span class="glitch-text" data-text="CONNEXION AU RÉSEAU…">CONNEXION AU RÉSEAU…</span></div>`;
    await initAuth();
    history.replaceState(null, '', location.pathname + location.search + '#/');
    if (errMatch) toast('Lien invalide : ' + decodeURIComponent(errMatch[1].replace(/\+/g, ' ')), 'err');
    else if (isLogged()) toast('Email confirmé. Connexion établie, choom.', 'ok');
    route();
    return;
  }
  // Le Flux s'affiche tout de suite ; le compte se branche en parallèle.
  route();
  initAuth();
}

boot();
