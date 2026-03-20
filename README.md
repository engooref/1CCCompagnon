# 1CC Electron Overlay

Base Electron + Vue 3 + Tailwind pour l'overlay desktop 1CC.

## Logique intégrée

- URL du site et routes overlay centralisées dans les settings
- clé API stockée côté OS avec keytar
- au login l'app appelle `POST /overlay/auth` avec `{ apiKey }`
- le backend renvoie `token` + `profile`
- le bearer est gardé en mémoire
- `/overlay/me` sert à recharger le profil
- la barre basse affiche l'état du site, de l'auth et du profil

## Fichiers clés

- `src/shared/contracts.ts` : contrats typés
- `src/main/services/settingsStore.ts` : config persistante
- `src/main/services/overlayService.ts` : auth et me côté main
- `src/main/preload.ts` : pont sécurisé
- `src/renderer/stores/app.ts` : état global front
- `src/renderer/config/api.ts` : construction des URLs
- `src/renderer/components/StatusBar.vue` : barre d'état
- `src/renderer/pages/HomePage.vue` : accueil
- `src/renderer/pages/SettingsPage.vue` : profil & connexion

## Démarrage

```bash
npm install
npm run dev
```
