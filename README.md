# SYN//APSE

> Connecte-toi à ce que tu vas aimer.

Application web **100 % statique** (HTML / CSS / JS vanilla en modules ES, sans build) de découverte et de notation de films, au look cyberpunk « réseau neuronal ». Déployable telle quelle sur GitHub Pages.

- **Flux** : hero tendance, rangées Tendances / Au cinéma / Mieux notés / Ta watchlist, puces de genres.
- **Fiche film** (`#/film/ID`, partageable) : bande-annonce intégrée (VF › VO › teaser), où regarder en France, casting, connexions proches, notation en **impulsions** (jauge 10 segments), critique, watchlist, avis du Réseau.
- **Transmissions** : recommandations personnalisées à partir de tes films notés 7+, et ta fréquence (genre) dominante.
- **Roulette neuronale**, **Le Réseau** (liste des nœuds), **Profils** avec stats, histogramme, top genres et **Sync neuronale** (% de compatibilité).

## Application installable (PWA)

SYNAPSE s'installe comme une vraie app (icône, plein écran, sans barre de navigateur) :
- **Android / Chrome / Edge** : bouton **⇩ Installer** dans la barre du haut, ou menu du navigateur › *Installer l'application*.
- **iPhone / iPad** : Safari › bouton Partager › *Sur l'écran d'accueil*.

Le service worker (`sw.js`) garde en cache le site, les affiches et les films déjà consultés : l'app s'ouvre et reste consultable **hors ligne** (les notes et la connexion nécessitent le réseau). Après une modification importante du site, incrémente `VERSION` dans `sw.js` pour forcer le renouvellement des caches.

## Mise en route

### 1. TMDB via le relais Supabase (clé cachée)
La clé TMDB n'est **jamais** dans le code : une Edge Function Supabase ([`supabase/functions/tmdb/index.ts`](supabase/functions/tmdb/index.ts)) relaie les requêtes et garde le token en secret côté serveur. Elle n'accepte que les endpoints utilisés par le site et que les origines autorisées.

Depuis le tableau de bord Supabase (aucune CLI nécessaire) :
1. **Edge Functions › Secrets** : ajoute
   - `TMDB_TOKEN` = ton jeton de lecture v4 (`eyJ…`) ou ta clé v3 (<https://www.themoviedb.org/settings/api>) ;
   - `ALLOWED_ORIGINS` = `https://krokow.github.io,http://localhost:8000`.
2. **Edge Functions › Deploy a new function › Via Editor** : nomme-la exactement `tmdb`, colle le contenu de `index.ts`, puis **Deploy**.
3. Dans les réglages de la fonction `tmdb`, **désactive « Enforce JWT verification »** (le site appelle le relais sans jeton).
4. Dans `config.js`, `TMDB_PROXY_URL` = `https://<projet>.supabase.co/functions/v1/tmdb`.

Avec la CLI : `supabase secrets set TMDB_TOKEN=… ALLOWED_ORIGINS=…` puis `supabase functions deploy tmdb --no-verify-jwt`.

*Alternative sans relais* : mets la clé directement dans `TMDB_API_KEY` (elle sera alors visible publiquement) et laisse `TMDB_PROXY_URL` vide.

### 2. Supabase (optionnel — sinon mode lecture sans comptes)
1. Ouvre ton projet Supabase › **SQL Editor** › *New query*, colle le contenu de [`supabase/schema.sql`](supabase/schema.sql) et lance **Run**.
2. **Authentication › URL Configuration** : mets l'URL GitHub Pages du site (ex. `https://krokow.github.io/synapse/`) dans *Site URL* et dans *Redirect URLs* — c'est là qu'arrive le lien de confirmation par email.
3. Si tu ne veux pas de confirmation par email : **Authentication › Providers › Email** › désactive *Confirm email*.
4. Récupère l'**URL du projet** et la clé **publishable** (`sb_publishable_…`, ou l'ancienne clé `anon`) dans **Project Settings › API Keys**.

### 3. `config.js`
```js
window.SYNAPSE_CONFIG = {
  TMDB_PROXY_URL: "https://xxxx.supabase.co/functions/v1/tmdb",
  TMDB_API_KEY: "",
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "…",
  LANG: "fr-FR",
  REGION: "FR",
};
```
⚠ Ce fichier est servi publiquement : n'y mets **jamais** la clé `service_role` / secret. L'URL Supabase et la clé publishable sont faites pour être publiques (les règles RLS protègent les données). La clé TMDB, elle, reste dans les secrets du relais.

### 4. GitHub Pages
**Settings › Pages › Deploy from a branch**, choisis la branche et le dossier `/ (root)`. Le routage par hash (`#/…`) évite les 404.

### En local
N'importe quel serveur statique : `python3 -m http.server 8000` puis <http://localhost:8000>. (Ouvrir `index.html` en `file://` ne marche pas à cause des modules ES.)

## Structure
```
index.html          coquille de l'app
config.js           clés (à remplir)
css/style.css       direction artistique
js/app.js           routeur hash + en-tête
js/views.js         pages (Flux, Recherche, Genre, Transmissions, Roulette, Réseau, Profil, Accès)
js/modal.js         fiche film
js/components.js    cartes, rangées, jauge d'impulsions
js/tmdb.js          client TMDB + cache mémoire
js/store.js         Supabase : auth, notes, watchlist
js/bg.js            fond animé de nœuds neuronaux
js/pwa.js           service worker + bouton d'installation
sw.js               service worker (cache hors ligne)
manifest.webmanifest  manifeste PWA
icons/              icônes de l'app (les « // » du logo sur fond noir)
supabase/schema.sql tables, RLS, triggers
supabase/functions/tmdb/index.ts  relais TMDB (Edge Function)
```

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Données de diffusion : JustWatch.
