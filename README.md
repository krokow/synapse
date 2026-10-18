# SYN//APSE

> Connecte-toi à ce que tu vas aimer.

Application web **100 % statique** (HTML / CSS / JS vanilla en modules ES, sans build) de découverte et de notation de films, au look cyberpunk « réseau neuronal ». Déployable telle quelle sur GitHub Pages.

- **Flux** : hero tendance, rangées Tendances / Au cinéma / Mieux notés / Ta watchlist, puces de genres.
- **Fiche film** (`#/film/ID`, partageable) : bande-annonce intégrée (VF › VO › teaser), où regarder en France, casting, connexions proches, notation en **impulsions** (jauge 10 segments), critique, watchlist, avis du Réseau.
- **Transmissions** : recommandations personnalisées à partir de tes films notés 7+, et ta fréquence (genre) dominante.
- **Roulette neuronale**, **Le Réseau** (liste des nœuds), **Profils** avec stats, histogramme, top genres et **Sync neuronale** (% de compatibilité).

## Mise en route

### 1. TMDB
Crée une clé sur <https://www.themoviedb.org/settings/api> : clé **v3** ou **jeton de lecture v4** (`eyJ…`), les deux marchent.

### 2. Supabase (optionnel — sinon mode lecture sans comptes)
1. Ouvre ton projet Supabase › **SQL Editor** › *New query*, colle le contenu de [`supabase/schema.sql`](supabase/schema.sql) et lance **Run**.
2. **Authentication › URL Configuration** : mets l'URL GitHub Pages du site (ex. `https://krokow.github.io/synapse/`) dans *Site URL* et dans *Redirect URLs* — c'est là qu'arrive le lien de confirmation par email.
3. Si tu ne veux pas de confirmation par email : **Authentication › Providers › Email** › désactive *Confirm email*.
4. Récupère l'**URL du projet** et la clé **anon / publishable** dans **Project Settings › API**.

### 3. `config.js`
```js
window.SYNAPSE_CONFIG = {
  TMDB_API_KEY: "…",
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "…",
  LANG: "fr-FR",
  REGION: "FR",
};
```
⚠ Ce fichier est servi publiquement : n'y mets **jamais** la clé `service_role`. La clé anon est faite pour être publique (les règles RLS protègent les données) ; la clé TMDB sera visible par les visiteurs, c'est inhérent à un site statique.

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
supabase/schema.sql tables, RLS, triggers
```

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Données de diffusion : JustWatch.
