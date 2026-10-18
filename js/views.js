// Pages de l'application.
import * as tmdb from './tmdb.js';
import * as store from './store.js';
import { state, isLogged } from './store.js';
import { esc, img, year, toast, avatarHTML, errorBlock, plural, debounce, USERNAME_RE, fmtDate, $, $$ } from './util.js';
import { cardHTML, rowHTML, rowSkeleton, gridHTML, gridSkeleton, refreshBadges, rowToMovie, gaugeHTML } from './components.js';

const notSeen = (m) => !state.ratings.has(m.id) && !state.watchlist.has(m.id);

function needAccount(main, what) {
  if (!state.enabled) {
    main.innerHTML = `<div class="empty"><p class="empty-glyph">⌁</p><p>Mode lecture : les comptes sont désactivés sur ce nœud.</p><p class="muted">Configure Supabase dans <code>config.js</code> pour activer ${esc(what)}.</p></div>`;
    return true;
  }
  if (!isLogged()) {
    main.innerHTML = `<div class="empty"><p class="empty-glyph">⌁</p><p>Accès restreint. Branche-toi au Réseau pour accéder à ${esc(what)}.</p><a class="btn btn-pink" href="#/acces">Se connecter</a></div>`;
    return true;
  }
  return false;
}

// ============ ÉCRAN DE CONFIGURATION ============
export function configScreen(main) {
  main.innerHTML = `
    <section class="panel config">
      <h1 class="page-title glitch-text" data-text="SIGNAL ABSENT">SIGNAL ABSENT</h1>
      <p>Aucune clé TMDB détectée. SYNAPSE a besoin d'une source de données pour se connecter aux films.</p>
      <ol class="steps">
        <li>Crée un compte sur <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org</a>, puis va dans <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">Paramètres › API</a>.</li>
        <li>Copie la <strong>clé API (v3)</strong> ou le <strong>jeton d'accès en lecture (v4, commence par "eyJ")</strong>.</li>
        <li>Recommandé : stocke-la dans le secret <code>TMDB_TOKEN</code> du relais Supabase (<code>supabase/functions/tmdb</code>) et renseigne <code>TMDB_PROXY_URL</code> dans <code>config.js</code> : la clé reste invisible.</li>
        <li>Ou, plus simple mais visible publiquement : colle-la dans <code>TMDB_API_KEY</code> de <code>config.js</code>.</li>
        <li>Optionnel : renseigne <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> pour activer les comptes (sinon, mode lecture).</li>
        <li>Pousse sur GitHub et recharge la page.</li>
      </ol>
      <pre class="code">window.SYNAPSE_CONFIG = {
  TMDB_PROXY_URL: "https://xxxx.supabase.co/functions/v1/tmdb",
  TMDB_API_KEY: "",
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJ...",
  LANG: "fr-FR",
  REGION: "FR",
};</pre>
    </section>`;
}

// ============ FLUX (accueil) ============
function watchlistRow() {
  const wl = [...state.watchlist.values()].sort((a, b) => new Date(b.added_at) - new Date(a.added_at)).map(rowToMovie);
  return rowHTML('Ta watchlist', wl, { id: 'wl-row', empty: 'Ta watchlist est vide. Marque des films avec ◇ pour les retrouver ici.' });
}

export async function home(main, { alive, onData }) {
  main.innerHTML = `
    <section class="hero hero-loading" id="hero"></section>
    <nav class="chips" id="genre-chips" aria-label="Genres"></nav>
    <div id="rows">
      ${rowSkeleton('Tendances de la semaine')}
      ${rowSkeleton('Au cinéma')}
      ${rowSkeleton('Les mieux notés')}
    </div>`;

  tmdb.genres().then((gs) => {
    if (!alive()) return;
    $('#genre-chips').innerHTML = gs.map((g) => `<a class="chip" href="#/genre/${g.id | 0}">${esc(g.name)}</a>`).join('');
  }).catch(() => {});

  const [tr, np, top] = await Promise.allSettled([tmdb.trending(), tmdb.nowPlaying(), tmdb.topRated()]);
  if (!alive()) return;
  if (tr.status === 'rejected' && np.status === 'rejected' && top.status === 'rejected') {
    main.innerHTML = errorBlock(tr.reason);
    return;
  }

  const trending = tr.value?.results || [];
  const heroPool = trending.filter((m) => m.backdrop_path).slice(0, 6);
  const h = heroPool[Math.floor(Math.random() * heroPool.length)];
  const hero = $('#hero');
  if (h) {
    hero.classList.remove('hero-loading');
    hero.style.setProperty('--bgimg', `url('${img(h.backdrop_path, 'w1280')}')`);
    hero.innerHTML = `
      <div class="hero-content">
        <p class="hero-kicker">// Signal le plus fort du Réseau</p>
        <h1 class="hero-title">${esc(h.title)}</h1>
        <p class="hero-meta">${esc(year(h.release_date))} · ★ ${esc((h.vote_average || 0).toFixed(1))}</p>
        <p class="hero-overview">${esc(h.overview || '')}</p>
        <div class="hero-actions">
          <a class="btn btn-pink" href="#/film/${h.id | 0}">▶ Accéder à la fiche</a>
          <a class="btn btn-ghost" href="#/roulette">⟳ Roulette neuronale</a>
        </div>
      </div>`;
  } else {
    hero.remove();
  }

  let html = '';
  html += rowHTML('Tendances de la semaine', trending);
  html += rowHTML('Au cinéma', np.value?.results);
  html += rowHTML('Les mieux notés', top.value?.results);
  if (isLogged()) html += watchlistRow();
  $('#rows').innerHTML = html;
  refreshBadges(main);
  onData(() => {
    const row = $('#wl-row');
    if (row) row.outerHTML = watchlistRow();
  });
}

// ============ GENRE ============
export async function genre(main, { alive, params }) {
  const id = Number(params[0]);
  main.innerHTML = `<header class="page-head"><h1 class="page-title" id="g-title">Genre</h1><p class="muted">Les signaux les plus populaires de cette fréquence.</p></header>
    <div class="grid" id="g-grid">${gridSkeleton()}</div>
    <div class="more"><button class="btn btn-ghost" id="g-more" hidden>Charger plus</button></div>`;
  tmdb.genreMap().then((map) => {
    if (alive()) $('#g-title').textContent = map.get(id) || 'Genre inconnu';
  }).catch(() => {});

  let page = 0;
  const grid = $('#g-grid');
  const more = $('#g-more');
  const load = async () => {
    more.disabled = true;
    try {
      const data = await tmdb.discover({ with_genres: id, page: page + 1, 'vote_count.gte': 50 });
      if (!alive()) return;
      if (page === 0) grid.innerHTML = '';
      page = data.page;
      grid.insertAdjacentHTML('beforeend', gridHTML(data.results));
      if (!grid.children.length) grid.innerHTML = '<p class="muted">Aucun signal trouvé.</p>';
      refreshBadges(grid);
      more.hidden = page >= Math.min(data.total_pages, 500);
      more.disabled = false;
    } catch (err) {
      if (alive()) (page === 0 ? (grid.innerHTML = errorBlock(err)) : toast('Chargement interrompu.', 'err'));
      more.disabled = false;
    }
  };
  more.addEventListener('click', load);
  await load();
}

// ============ RECHERCHE ============
export async function search(main, { alive, query }) {
  const q0 = query.get('q') || '';
  main.innerHTML = `
    <header class="page-head"><h1 class="page-title">Recherche</h1></header>
    <form class="terminal" id="s-form" role="search">
      <span class="terminal-prefix" aria-hidden="true">&gt;_</span>
      <input id="s-input" type="search" autocomplete="off" spellcheck="false" placeholder="titre du film…" aria-label="Rechercher un film" value="${esc(q0)}">
      <span class="terminal-cursor" aria-hidden="true"></span>
    </form>
    <p class="muted" id="s-status"></p>
    <div class="grid" id="s-grid"></div>
    <div class="more"><button class="btn btn-ghost" id="s-more" hidden>Charger plus</button></div>`;

  const input = $('#s-input');
  const grid = $('#s-grid');
  const status = $('#s-status');
  const more = $('#s-more');
  let q = '';
  let page = 0;
  let seq = 0;

  const run = async (append = false) => {
    const my = ++seq;
    if (!q) {
      grid.innerHTML = '';
      status.textContent = 'En attente d’une requête…';
      more.hidden = true;
      return;
    }
    if (!append) {
      page = 0;
      grid.innerHTML = gridSkeleton(8);
      status.textContent = 'Balayage du Réseau…';
    }
    try {
      const data = await tmdb.search(q, page + 1);
      if (!alive() || my !== seq) return;
      page = data.page;
      if (!append) grid.innerHTML = '';
      grid.insertAdjacentHTML('beforeend', gridHTML(data.results));
      refreshBadges(grid);
      status.textContent = data.total_results
        ? `${plural(data.total_results, 'signal capté', 'signaux captés')} pour « ${q} »`
        : `Aucun signal trouvé pour « ${q} ».`;
      more.hidden = page >= data.total_pages;
    } catch (err) {
      if (alive() && my === seq) grid.innerHTML = errorBlock(err);
    }
  };

  const onInput = debounce(() => {
    q = input.value.trim();
    history.replaceState(null, '', q ? `#/recherche?q=${encodeURIComponent(q)}` : '#/recherche');
    run();
  }, 350);
  input.addEventListener('input', onInput);
  $('#s-form').addEventListener('submit', (e) => {
    e.preventDefault();
    input.blur();
  });
  more.addEventListener('click', () => run(true));
  input.focus();
  q = q0.trim();
  await run();
}

// ============ TRANSMISSIONS (pour toi) ============
export async function transmissions(main, { alive }) {
  if (needAccount(main, 'tes Transmissions')) return;
  main.innerHTML = `<header class="page-head"><h1 class="page-title">Transmissions</h1>
    <p class="muted">Des signaux calculés à partir des films auxquels tu as envoyé une impulsion de 7 ou plus.</p></header>
    <div id="t-body"><div class="grid">${gridSkeleton(10)}</div></div>`;

  const liked = [...state.ratings.values()]
    .filter((r) => r.score >= 7)
    .sort((a, b) => b.score - a.score || new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 15);
  const body = $('#t-body');
  if (!liked.length) {
    body.innerHTML = `<div class="empty"><p class="empty-glyph">⌁</p><p>Pas encore assez d'impulsions fortes pour calibrer tes Transmissions.</p>
      <p class="muted">Note au moins un film 7/10 ou plus, choom.</p><a class="btn btn-pink" href="#/">Explorer le Flux</a></div>`;
    return;
  }

  const results = await Promise.allSettled(liked.map((r) => tmdb.recommendations(r.movie_id)));
  if (!alive()) return;
  const agg = new Map();
  results.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    for (const m of res.value.results || []) {
      if (!notSeen(m)) continue;
      let e = agg.get(m.id);
      if (!e) agg.set(m.id, (e = { movie: m, count: 0, sources: [] }));
      e.count++;
      e.sources.push(liked[i]);
    }
  });
  const ranked = [...agg.values()]
    .sort((a, b) => b.count - a.count || (b.movie.vote_average || 0) - (a.movie.vote_average || 0))
    .slice(0, 40);

  const reason = (e) => {
    const [first, ...rest] = e.sources;
    return `parce que tu as aimé <strong>${esc(first.title || 'un film')}</strong>${rest.length ? ` <span class="muted">+${rest.length}</span>` : ''}`;
  };

  // Genre préféré : pondéré par la note, sur les films aimés.
  const gScore = new Map();
  for (const r of state.ratings.values()) {
    if (r.score < 7) continue;
    for (const g of r.genre_ids || []) gScore.set(g, (gScore.get(g) || 0) + r.score);
  }
  const favGenre = [...gScore.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  body.innerHTML = `
    <section class="row"><header class="row-head"><h2 class="row-title">Signaux détectés</h2></header>
      ${ranked.length ? `<div class="grid">${gridHTML(ranked.map((e) => e.movie), { cardOpts: (m) => ({ reason: reason(agg.get(m.id)) }) })}</div>` : '<p class="muted">Tu as déjà tout vu. Impressionnant, choom.</p>'}
    </section>
    <div id="t-genre"></div>`;
  refreshBadges(body);

  if (favGenre) {
    try {
      const [map, data] = await Promise.all([
        tmdb.genreMap(),
        tmdb.discover({ with_genres: favGenre, 'vote_count.gte': 300, 'vote_average.gte': 6.5, sort_by: 'popularity.desc' }),
      ]);
      if (!alive()) return;
      const name = map.get(favGenre) || 'ton genre préféré';
      $('#t-genre').innerHTML = rowHTML(`Ta fréquence dominante : <span class="accent">${esc(name)}</span>`, data.results.filter(notSeen), {
        rawTitle: true,
        link: `#/genre/${favGenre | 0}`,
      });
      refreshBadges($('#t-genre'));
    } catch {}
  }
}

// ============ ROULETTE ============
export async function roulette(main, { alive }) {
  main.innerHTML = `
    <header class="page-head center"><h1 class="page-title">Roulette neuronale</h1>
    <p class="muted">Un film bien noté, validé par des milliers de votes, que tu n'as jamais noté. Le hasard fait le reste.</p></header>
    <div class="roulette">
      <div class="roulette-screen" id="r-screen"><p class="muted">Prêt à tirer, choom ?</p></div>
      <button class="btn btn-yellow btn-big" id="r-spin">⟳ Lancer la roulette</button>
    </div>`;
  const screen = $('#r-screen');
  const btn = $('#r-spin');

  const spin = async () => {
    btn.disabled = true;
    screen.classList.add('glitching');
    screen.innerHTML = `<span class="glitch-text big" data-text="INJECTION…">INJECTION…</span>`;
    const t0 = performance.now();
    try {
      const base = { sort_by: 'vote_average.desc', 'vote_count.gte': 1500, 'vote_average.gte': 7 };
      const first = await tmdb.discover({ ...base, page: 1 });
      const pages = Math.max(1, Math.min(first.total_pages || 1, 500));
      let pick = null;
      let pool = [];
      for (let i = 0; i < 6 && !pick; i++) {
        const page = 1 + Math.floor(Math.random() * pages);
        const data = page === 1 ? first : await tmdb.discover({ ...base, page });
        pool = data.results || [];
        const cands = pool.filter((m) => !state.ratings.has(m.id));
        if (cands.length) pick = cands[Math.floor(Math.random() * cands.length)];
      }
      if (!alive()) return;
      // Défilement glitché de titres pendant ~1,4 s
      const titles = pool.map((m) => m.title).filter(Boolean);
      while (performance.now() - t0 < 1400 && alive()) {
        const t = titles[Math.floor(Math.random() * titles.length)] || '???';
        screen.innerHTML = `<span class="glitch-text big" data-text="${esc(t)}">${esc(t)}</span>`;
        await new Promise((r) => setTimeout(r, 90));
      }
      if (!alive()) return;
      screen.classList.remove('glitching');
      if (!pick) {
        screen.innerHTML = '<p>Aucun signal trouvé. Tu as tout noté ?</p>';
      } else {
        screen.innerHTML = `
          <div class="roulette-result">
            ${cardHTML(pick)}
            <div>
              <h2 class="hero-title">${esc(pick.title)}</h2>
              <p class="muted">${esc(year(pick.release_date))} · ★ ${esc((pick.vote_average || 0).toFixed(1))} · ${esc(plural(pick.vote_count || 0, 'vote', 'votes'))}</p>
              <p>${esc((pick.overview || '').slice(0, 320))}${(pick.overview || '').length > 320 ? '…' : ''}</p>
              <a class="btn btn-pink" href="#/film/${pick.id | 0}">▶ Ouvrir la fiche</a>
            </div>
          </div>`;
        refreshBadges(screen);
      }
    } catch (err) {
      screen.classList.remove('glitching');
      if (alive()) screen.innerHTML = errorBlock(err);
    }
    btn.disabled = false;
    btn.textContent = '⟳ Relancer';
  };
  btn.addEventListener('click', spin);
}

// ============ LE RÉSEAU ============
export async function reseau(main, { alive }) {
  if (!state.enabled) {
    main.innerHTML = `<div class="empty"><p class="empty-glyph">⌁</p><p>Le Réseau est hors ligne : Supabase n'est pas configuré.</p></div>`;
    return;
  }
  main.innerHTML = `<header class="page-head"><h1 class="page-title">Le Réseau</h1>
    <p class="muted">Tous les nœuds connectés à SYNAPSE.</p></header>
    <form class="terminal terminal-sm" onsubmit="return false"><span class="terminal-prefix">&gt;_</span><input id="n-filter" type="search" placeholder="filtrer les nœuds…" aria-label="Filtrer"></form>
    <div class="nodes" id="n-list"><p class="muted">Cartographie du Réseau…</p></div>`;
  try {
    const rows = await store.listProfiles();
    if (!alive()) return;
    const list = rows
      .map((p) => ({ ...p, count: p.ratings?.[0]?.count ?? 0 }))
      .sort((a, b) => b.count - a.count || a.username.localeCompare(b.username));
    const box = $('#n-list');
    const draw = (f = '') => {
      const items = list.filter((p) => p.username.toLowerCase().includes(f.toLowerCase()));
      box.innerHTML = items.length
        ? items
            .map(
              (p) => `<a class="node${state.user?.id === p.id ? ' node-me' : ''}" href="#/profil/${encodeURIComponent(p.username)}">
                ${avatarHTML(p.username, p.avatar_hue, 'lg')}
                <div class="node-info">
                  <strong>${esc(p.username)}</strong>${state.user?.id === p.id ? ' <span class="tag">toi</span>' : ''}
                  <span class="muted">${esc(p.bio ? p.bio.slice(0, 90) : 'Nœud silencieux.')}</span>
                </div>
                <span class="node-count"><b>${p.count | 0}</b><small>${p.count > 1 ? 'films notés' : 'film noté'}</small></span>
              </a>`
            )
            .join('')
        : '<p class="muted">Aucun nœud trouvé.</p>';
    };
    draw();
    $('#n-filter').addEventListener('input', (e) => draw(e.target.value.trim()));
  } catch (err) {
    if (alive()) $('#n-list').innerHTML = errorBlock(err);
  }
}

// ============ PROFIL ============
function computeSync(mine, theirs) {
  const common = theirs.filter((r) => mine.has(r.movie_id));
  if (!common.length) return null;
  const diff = common.reduce((s, r) => s + Math.abs(r.score - mine.get(r.movie_id).score), 0) / common.length;
  return { pct: Math.round(100 * (1 - diff / 9)), common };
}

export async function profil(main, ctx) {
  const { alive, params } = ctx;
  if (!state.enabled) {
    main.innerHTML = `<div class="empty"><p class="empty-glyph">⌁</p><p>Profils indisponibles : Supabase n'est pas configuré.</p></div>`;
    return;
  }
  const username = params[0];
  main.innerHTML = `<p class="muted">Localisation du nœud ${esc(username)}…</p>`;
  let p, ratings, wl, gmap;
  try {
    p = await store.getProfileByUsername(username);
    if (!alive()) return;
    if (!p) {
      main.innerHTML = `<div class="empty"><p class="empty-glyph">⌀</p><p>Nœud « ${esc(username)} » introuvable sur le Réseau.</p><a class="btn btn-ghost" href="#/reseau">Voir le Réseau</a></div>`;
      return;
    }
    [ratings, wl, gmap] = await Promise.all([store.getUserRatings(p.id), store.getUserWatchlist(p.id), tmdb.genreMap().catch(() => new Map())]);
  } catch (err) {
    if (alive()) main.innerHTML = errorBlock(err);
    return;
  }
  if (!alive()) return;

  const isMe = state.user?.id === p.id;
  // Sur son propre profil (ou pour la sync), une note modifiée dans la fiche rafraîchit la page.
  if (isLogged()) ctx.onData(() => profil(main, ctx));
  const n = ratings.length;
  const avg = n ? ratings.reduce((s, r) => s + r.score, 0) / n : 0;
  const hist = Array(10).fill(0);
  ratings.forEach((r) => hist[r.score - 1]++);
  const hmax = Math.max(1, ...hist);
  const gcount = new Map();
  ratings.forEach((r) => (r.genre_ids || []).forEach((g) => gcount.set(g, (gcount.get(g) || 0) + 1)));
  const topG = [...gcount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  let syncHTML = '';
  if (!isMe && isLogged()) {
    const s = computeSync(state.ratings, ratings);
    syncHTML = s
      ? `<div class="sync" style="--p:${s.pct}">
          <div class="sync-ring"><span>${s.pct}<small>%</small></span></div>
          <div><h3 class="m-h">Sync neuronale</h3>
            <p>${esc(s.pct >= 80 ? 'Connexion quasi fusionnelle.' : s.pct >= 60 ? 'Bonne synchronisation.' : s.pct >= 40 ? 'Signal instable.' : 'Fréquences opposées.')}</p>
            <p class="muted tiny">Calculée sur ${esc(plural(s.common.length, 'film noté', 'films notés'))} en commun.</p></div>
        </div>`
      : `<div class="sync sync-none"><div><h3 class="m-h">Sync neuronale</h3><p class="muted">Aucun film en commun : pas encore de synapse entre vous.</p></div></div>`;
  }

  main.innerHTML = `
    <section class="profile-head panel">
      ${avatarHTML(p.username, p.avatar_hue, 'xl')}
      <div class="profile-id">
        <h1 class="page-title">${esc(p.username)}</h1>
        <p class="muted tiny">Nœud actif depuis le ${esc(fmtDate(p.created_at))}</p>
        <p class="profile-bio" id="p-bio">${esc(p.bio || (isMe ? 'Aucune bio. Présente-toi au Réseau.' : 'Nœud silencieux.'))}</p>
        ${isMe ? `<div class="profile-actions"><button class="btn btn-ghost btn-sm" id="p-edit">✎ Modifier la bio</button><button class="btn btn-ghost btn-sm" id="p-logout">⏻ Déconnexion</button></div>` : ''}
      </div>
      ${syncHTML}
    </section>

    <section class="stats">
      <div class="stat panel"><span class="big-num">${n}</span><span class="muted">${n > 1 ? 'films notés' : 'film noté'}</span></div>
      <div class="stat panel"><span class="big-num">${n ? esc(avg.toFixed(1)) : '–'}</span><span class="muted">impulsion moyenne</span>${n ? gaugeHTML(avg) : ''}</div>
      <div class="stat panel stat-wide">
        <span class="muted">Répartition des impulsions</span>
        <div class="histo">${hist
          .map((c, i) => `<div class="histo-col" title="${c} × ${i + 1}/10"><span class="histo-bar" style="height:${Math.round((c / hmax) * 100)}%"></span><small>${i + 1}</small></div>`)
          .join('')}</div>
      </div>
      <div class="stat panel">
        <span class="muted">Top genres</span>
        ${topG.length ? `<ol class="top-genres">${topG.map(([g, c]) => `<li><a href="#/genre/${g | 0}">${esc(gmap.get(g) || 'Genre ' + g)}</a> <span class="muted">${c}</span></li>`).join('')}</ol>` : '<p class="muted">—</p>'}
      </div>
    </section>

    <div class="tabs" role="tablist">
      <button class="tab active" data-tab="rated" role="tab">Films notés <span class="muted">${n}</span></button>
      <button class="tab" data-tab="wl" role="tab">Watchlist <span class="muted">${wl.length}</span></button>
    </div>
    <div class="grid" id="tab-rated">${
      n ? gridHTML(ratings.map(rowToMovie), { cardOpts: (m) => (isMe ? {} : { theirScore: ratings.find((r) => r.movie_id === m.id)?.score }) }) : '<p class="muted">Aucune impulsion envoyée pour l’instant.</p>'
    }</div>
    <div class="grid" id="tab-wl" hidden>${wl.length ? gridHTML(wl.map(rowToMovie)) : '<p class="muted">Watchlist vide.</p>'}</div>`;

  refreshBadges(main);
  $$('.tab', main).forEach((t) =>
    t.addEventListener('click', () => {
      $$('.tab', main).forEach((x) => x.classList.toggle('active', x === t));
      $('#tab-rated').hidden = t.dataset.tab !== 'rated';
      $('#tab-wl').hidden = t.dataset.tab !== 'wl';
    })
  );

  if (isMe) {
    $('#p-logout').addEventListener('click', async () => {
      await store.signOut();
      toast('Déconnexion. À plus dans le Réseau, choom.', 'ok');
      location.hash = '#/';
    });
    $('#p-edit').addEventListener('click', () => {
      const bio = $('#p-bio');
      bio.outerHTML = `<form id="p-bio-form" class="bio-form">
        <textarea id="p-bio-input" maxlength="280" rows="3">${esc(state.profile?.bio || '')}</textarea>
        <div><button class="btn btn-pink btn-sm">Enregistrer</button> <button type="button" class="btn btn-ghost btn-sm" id="p-cancel">Annuler</button></div>
      </form>`;
      $('#p-edit').hidden = true;
      $('#p-cancel').addEventListener('click', () => profil(main, ctx));
      $('#p-bio-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await store.updateBio($('#p-bio-input').value.trim());
          toast('Bio mise à jour.', 'ok'); // la page se rerend via onData
        } catch (err) {
          toast('Échec : ' + err.message, 'err');
        }
      });
    });
  }
}

// ============ ACCÈS (connexion / inscription) ============
export function auth(main, { query }) {
  if (!state.enabled) {
    main.innerHTML = `<div class="empty"><p class="empty-glyph">⌁</p><p>Mode lecture : les comptes sont désactivés (Supabase non configuré).</p><a class="btn btn-ghost" href="#/">Retour au Flux</a></div>`;
    return;
  }
  if (isLogged()) {
    location.replace(`#/profil/${encodeURIComponent(state.profile.username)}`);
    return;
  }
  const mode = query.get('mode') === 'inscription' ? 'signup' : 'login';
  main.innerHTML = `
    <section class="auth panel">
      <div class="tabs" role="tablist">
        <button class="tab ${mode === 'login' ? 'active' : ''}" data-mode="login">Connexion</button>
        <button class="tab ${mode === 'signup' ? 'active' : ''}" data-mode="signup">Inscription</button>
      </div>
      <form id="a-form" novalidate>
        <label class="field" id="a-user-field" ${mode === 'login' ? 'hidden' : ''}>
          <span class="field-label">Pseudo</span>
          <input id="a-user" autocomplete="username" maxlength="20" placeholder="3 à 20 caractères : lettres, chiffres, _ et -">
          <span class="field-hint" id="a-user-hint"></span>
        </label>
        <label class="field"><span class="field-label">Email</span><input id="a-email" type="email" autocomplete="email" required></label>
        <label class="field"><span class="field-label">Mot de passe</span><input id="a-pass" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="6" required></label>
        <p class="form-error" id="a-error" role="alert"></p>
        <button class="btn btn-pink btn-block" id="a-submit">${mode === 'login' ? 'Se brancher au Réseau' : 'Créer mon nœud'}</button>
      </form>
    </section>`;

  $$('.tab', main).forEach((t) =>
    t.addEventListener('click', () => location.replace(t.dataset.mode === 'signup' ? '#/acces?mode=inscription' : '#/acces'))
  );

  const err = $('#a-error');
  const userInput = $('#a-user');
  const hint = $('#a-user-hint');
  const checkUser = debounce(async () => {
    const u = userInput.value.trim();
    hint.className = 'field-hint';
    if (!u) return (hint.textContent = '');
    if (!USERNAME_RE.test(u)) {
      hint.textContent = '3 à 20 caractères : lettres, chiffres, _ et - uniquement.';
      hint.classList.add('bad');
      return;
    }
    hint.textContent = 'Vérification…';
    try {
      const ok = await store.usernameAvailable(u);
      if (userInput.value.trim() !== u) return;
      hint.textContent = ok ? '✓ Pseudo disponible' : '✕ Pseudo déjà pris';
      hint.classList.add(ok ? 'good' : 'bad');
    } catch {
      hint.textContent = '';
    }
  }, 400);
  userInput.addEventListener('input', checkUser);

  $('#a-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const email = $('#a-email').value.trim();
    const password = $('#a-pass').value;
    const btn = $('#a-submit');
    if (!email || !password) return (err.textContent = 'Email et mot de passe requis.');
    btn.disabled = true;
    try {
      if (mode === 'login') {
        await store.signIn({ email, password });
        toast('Connexion établie, choom.', 'ok');
        location.hash = '#/';
      } else {
        const username = userInput.value.trim();
        if (!USERNAME_RE.test(username)) throw new Error('Pseudo invalide : 3 à 20 caractères, lettres, chiffres, _ et -.');
        if (password.length < 6) throw new Error('Mot de passe trop court (6 caractères minimum).');
        if (!(await store.usernameAvailable(username))) throw new Error('Ce pseudo est déjà pris par un autre nœud.');
        const { needsConfirmation } = await store.signUp({ username, email, password });
        if (needsConfirmation) {
          $('.auth').innerHTML = `<div class="empty"><p class="empty-glyph">✉</p><p>Nœud créé. Vérifie ta boîte mail pour confirmer ton adresse, puis reviens te connecter.</p><a class="btn btn-ghost" href="#/acces">Connexion</a></div>`;
          return;
        }
        toast('Nœud créé. Connexion établie, choom.', 'ok');
        location.hash = '#/';
      }
    } catch (e2) {
      const m = String(e2.message || e2);
      err.textContent = /invalid login/i.test(m)
        ? 'Identifiants rejetés. Accès refusé.'
        : /email not confirmed/i.test(m)
        ? 'Email pas encore confirmé. Vérifie ta boîte mail.'
        : /already registered/i.test(m)
        ? 'Cet email est déjà relié au Réseau.'
        : /database error/i.test(m)
        ? 'Création du profil impossible (pseudo pris ou schéma SQL non installé).'
        : m;
      btn.disabled = false;
    }
  });
}
