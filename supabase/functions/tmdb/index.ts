// SYNAPSE — relais TMDB (Supabase Edge Function).
// Le token TMDB reste côté serveur (secret TMDB_TOKEN) : le navigateur ne le voit jamais.
//
// Secrets à définir (Edge Functions › Secrets) :
//   TMDB_TOKEN       jeton de lecture v4 ("eyJ…") ou clé v3
//   ALLOWED_ORIGINS  origines autorisées, séparées par des virgules
//                    ex. "https://krokow.github.io,http://localhost:8000"
// La vérification JWT doit être désactivée pour cette fonction.

const TMDB = 'https://api.themoviedb.org/3';

// Seuls les endpoints utilisés par le site sont relayés.
const ALLOWED_PATH =
  /^\/(trending\/movie\/week|movie\/(now_playing|top_rated|popular|\d{1,9}(\/(recommendations|videos))?)|search\/movie|discover\/movie|genre\/movie\/list)$/;

const ALLOWED_PARAMS = new Set([
  'language',
  'region',
  'page',
  'query',
  'include_adult',
  'sort_by',
  'with_genres',
  'vote_count.gte',
  'vote_average.gte',
  'append_to_response',
  'include_video_language',
]);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const originOk = allowed.length === 0 || allowed.includes(origin);

  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed.length === 0 ? '*' : originOk ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    Vary: 'Origin',
  };
  const reply = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json; charset=utf-8', ...extra },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return reply(405, { status_message: 'Méthode non autorisée' });
  if (!originOk) return reply(403, { status_message: 'Origine non autorisée' });

  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '';
  if (!ALLOWED_PATH.test(path)) return reply(400, { status_message: 'Chemin non autorisé' });

  const token = Deno.env.get('TMDB_TOKEN')?.trim();
  if (!token) return reply(500, { status_message: 'Secret TMDB_TOKEN manquant' });

  const target = new URL(TMDB + path);
  for (const [k, v] of url.searchParams) {
    if (ALLOWED_PARAMS.has(k)) target.searchParams.set(k, v.slice(0, 200));
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token.startsWith('eyJ')) headers.Authorization = `Bearer ${token}`;
  else target.searchParams.set('api_key', token);

  try {
    const res = await fetch(target, { headers });
    const body = await res.text();
    return reply(res.status, body, {
      'cache-control': res.ok ? 'public, max-age=3600' : 'no-store',
    });
  } catch {
    return reply(502, { status_message: 'TMDB injoignable' });
  }
});
