// ============================================================
//  SYNAPSE — configuration
//  Remplis les valeurs ci-dessous puis pousse le fichier sur GitHub.
//  ⚠ Ce fichier est public une fois le site en ligne : n'y mets que
//  la clé TMDB et la clé "anon" Supabase (jamais la clé service_role).
// ============================================================
window.SYNAPSE_CONFIG = {
  // Clé API v3 (32 caractères) OU jeton de lecture v4 (commence par "eyJ")
  // → https://www.themoviedb.org/settings/api
  TMDB_API_KEY: "",

  // Supabase > Project Settings > API
  // Laisser vide = mode lecture seule, sans comptes.
  SUPABASE_URL: "",       // ex. "https://abcdefgh.supabase.co"
  SUPABASE_ANON_KEY: "",  // clé "anon" / "publishable"

  LANG: "fr-FR",
  REGION: "FR",
};
