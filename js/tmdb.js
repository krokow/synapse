// Client TMDB v3 avec cache mémoire.
import { CFG } from './util.js';

const BASE = 'https://api.themoviedb.org/3';
const cache = new Map();

// Relais (Edge Function Supabase) prioritaire : la clé reste alors côté serveur.
const useProxy = () => Boolean(CFG.TMDB_PROXY_URL);
export const hasKey = () => useProxy() || Boolean(CFG.TMDB_API_KEY);
const isV4 = () => !useProxy() && CFG.TMDB_API_KEY.startsWith('eyJ');

export async function get(path, params = {}) {
  const url = new URL(useProxy() ? CFG.TMDB_PROXY_URL : BASE + path);
  const all = { language: CFG.LANG, ...params };
  if (useProxy()) all.path = path;
  else if (!isV4()) all.api_key = CFG.TMDB_API_KEY;
  for (const [k, v] of Object.entries(all)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const key = url.toString();
  if (cache.has(key)) return cache.get(key);

  const headers = { accept: 'application/json' };
  if (isV4()) headers.Authorization = `Bearer ${CFG.TMDB_API_KEY}`;

  const p = fetch(key, { headers }).then(async (res) => {
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).status_message || '';
      } catch {}
      throw new Error(`TMDB ${res.status}${detail ? ' — ' + detail : ''}`);
    }
    return res.json();
  });
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

const R = () => ({ region: CFG.REGION });

export const trending = () => get('/trending/movie/week');
export const nowPlaying = () => get('/movie/now_playing', R());
export const topRated = () => get('/movie/top_rated', R());
export const popular = (page = 1) => get('/movie/popular', { ...R(), page });
export const search = (query, page = 1) => get('/search/movie', { query, page, include_adult: false, ...R() });
export const discover = (params = {}) =>
  get('/discover/movie', { include_adult: false, sort_by: 'popularity.desc', ...R(), ...params });
export const recommendations = (id) => get(`/movie/${id}/recommendations`);

export async function genres() {
  const data = await get('/genre/movie/list');
  return data.genres || [];
}

export async function genreMap() {
  return new Map((await genres()).map((g) => [g.id, g.name]));
}

export async function movie(id) {
  const m = await get(`/movie/${id}`, {
    append_to_response: 'videos,credits,recommendations,similar,watch/providers',
    include_video_language: 'fr,en,null',
  });
  // Repli : aucune vidéo FR/EN → on tente la langue originale (VO).
  const hasYT = (m.videos?.results || []).some((v) => v.site === 'YouTube');
  if (!hasYT && m.original_language && !['fr', 'en'].includes(m.original_language)) {
    try {
      const v = await get(`/movie/${id}/videos`, { language: m.original_language });
      m.videos = { results: v.results || [] };
    } catch {}
  }
  return m;
}
