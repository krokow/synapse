// Supabase : authentification + données utilisateurs.
import { CFG, hueFromString } from './util.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

let sb = null;

export const state = {
  enabled: false, // Supabase configuré et chargé
  user: null,
  profile: null,
  ratings: new Map(), // movie_id -> ligne ratings
  watchlist: new Map(), // movie_id -> ligne watchlist
};

export const bus = new EventTarget();
const emit = (type) => bus.dispatchEvent(new Event(type));

export const isLogged = () => Boolean(state.user && state.profile);

export async function initAuth() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return;
  try {
    const { createClient } = await import(SUPABASE_CDN);
    sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    state.enabled = true;
    const { data } = await sb.auth.getSession();
    await applySession(data.session);
    sb.auth.onAuthStateChange((_event, session) => {
      // Ne jamais awaiter d'appel Supabase ici (risque de blocage) : on diffère.
      setTimeout(() => applySession(session), 0);
    });
  } catch (err) {
    console.error('[SYNAPSE] Supabase indisponible', err);
    state.enabled = false;
    sb = null;
  }
}

async function applySession(session) {
  const prevId = state.user?.id ?? null;
  const nextUser = session?.user ?? null;
  state.user = nextUser;
  if ((nextUser?.id ?? null) === prevId) return;
  if (nextUser) {
    await loadUserData();
  } else {
    state.profile = null;
    state.ratings.clear();
    state.watchlist.clear();
  }
  emit('auth');
}

async function loadUserData() {
  const uid = state.user.id;
  const [p, r, w] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('ratings').select('*').eq('user_id', uid),
    sb.from('watchlist').select('*').eq('user_id', uid),
  ]);
  if (state.user?.id !== uid) return;
  state.profile = p.data || null;
  state.ratings = new Map((r.data || []).map((x) => [x.movie_id, x]));
  state.watchlist = new Map((w.data || []).map((x) => [x.movie_id, x]));
  if (!state.profile) console.warn('[SYNAPSE] Profil introuvable — le trigger SQL est-il installé ?');
}

function need() {
  if (!sb) throw new Error('Comptes désactivés : Supabase non configuré.');
  return sb;
}
function needUser() {
  need();
  if (!state.user) throw new Error('Connexion requise.');
  return state.user.id;
}
function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- Auth ----------
export async function usernameAvailable(name) {
  return check(await need().rpc('username_available', { name }));
}

export async function signUp({ username, email, password }) {
  const { data, error } = await need().auth.signUp({
    email,
    password,
    options: {
      data: { username, avatar_hue: hueFromString(username) },
      emailRedirectTo: location.origin + location.pathname,
    },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  const { data, error } = await need().auth.signInWithPassword({ email, password });
  if (error) throw error;
  await applySession(data.session);
}

export async function signOut() {
  await need().auth.signOut();
  await applySession(null);
}

// ---------- Profils ----------
export async function updateBio(bio) {
  const uid = needUser();
  const row = check(await sb.from('profiles').update({ bio }).eq('id', uid).select().single());
  state.profile = row;
  emit('data');
  return row;
}

export async function getProfileByUsername(username) {
  return check(await need().from('profiles').select('*').eq('username', username).maybeSingle());
}

export async function listProfiles() {
  return check(
    await need()
      .from('profiles')
      .select('id, username, avatar_hue, bio, created_at, ratings(count)')
      .order('created_at', { ascending: true })
  );
}

export async function getUserRatings(userId) {
  return check(
    await need().from('ratings').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
  );
}

export async function getUserWatchlist(userId) {
  return check(
    await need().from('watchlist').select('*').eq('user_id', userId).order('added_at', { ascending: false })
  );
}

export async function getMovieCommunity(movieId) {
  return check(
    await need()
      .from('ratings')
      .select('user_id, score, review, updated_at, profiles(username, avatar_hue)')
      .eq('movie_id', movieId)
      .order('updated_at', { ascending: false })
  );
}

// ---------- Notes & watchlist ----------
const meta = (m) => ({
  title: m.title || m.original_title || '',
  poster_path: m.poster_path || null,
  release_year: m.release_date ? parseInt(m.release_date.slice(0, 4), 10) || null : null,
});

export async function saveRating(movie, score, review) {
  const uid = needUser();
  const row = check(
    await sb
      .from('ratings')
      .upsert(
        {
          user_id: uid,
          movie_id: movie.id,
          score,
          review: review ? review.slice(0, 1000) : null,
          genre_ids: [...new Set((movie.genres || []).map((g) => g.id).concat(movie.genre_ids || []))],
          ...meta(movie),
        },
        { onConflict: 'user_id,movie_id' }
      )
      .select()
      .single()
  );
  state.ratings.set(movie.id, row);
  emit('data');
  return row;
}

export async function deleteRating(movieId) {
  const uid = needUser();
  check(await sb.from('ratings').delete().eq('user_id', uid).eq('movie_id', movieId));
  state.ratings.delete(movieId);
  emit('data');
}

export async function toggleWatchlist(movie) {
  const uid = needUser();
  if (state.watchlist.has(movie.id)) {
    check(await sb.from('watchlist').delete().eq('user_id', uid).eq('movie_id', movie.id));
    state.watchlist.delete(movie.id);
    emit('data');
    return false;
  }
  const row = check(
    await sb
      .from('watchlist')
      .upsert({ user_id: uid, movie_id: movie.id, ...meta(movie) }, { onConflict: 'user_id,movie_id' })
      .select()
      .single()
  );
  state.watchlist.set(movie.id, row);
  emit('data');
  return true;
}
