// ============================================================
//  SYNAPSE — configuration
//  ⚠ Ce fichier est public une fois le site en ligne. Les valeurs
//  Supabase ci-dessous sont faites pour l'être (protégées par RLS).
//  Ne mets JAMAIS la clé service_role / secret ici.
// ============================================================
window.SYNAPSE_CONFIG = {
  // Relais TMDB (Edge Function Supabase) : la clé TMDB reste côté serveur,
  // dans le secret TMDB_TOKEN. Voir supabase/functions/tmdb/index.ts.
  TMDB_PROXY_URL: "https://gwotjgmqwgyidbushbvj.supabase.co/functions/v1/tmdb",

  // Alternative sans relais (clé visible publiquement) : clé v3 ou jeton v4 "eyJ…".
  // Ignorée si TMDB_PROXY_URL est renseigné.
  TMDB_API_KEY: "",

  // Supabase > Project Settings > API Keys. Laisser vide = mode lecture sans comptes.
  SUPABASE_URL: "https://gwotjgmqwgyidbushbvj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_qOVkGkLW0EwvxyiP_ecs9A_3pjwhZWH", // clé "publishable" (ou ancienne "anon")

  LANG: "fr-FR",
  REGION: "FR",
};
