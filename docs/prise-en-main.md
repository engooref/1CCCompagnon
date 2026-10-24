# 1CCCompagnon — prise en main

Ce document est destiné à un développeur qui reprend le projet. Il explique à quoi sert l'application, comment l'installer et la lancer, comment le code est organisé, comment elle parle au site et comment une version est publiée. Il a été écrit à partir du contenu du dépôt ; ce que le dépôt ne documente pas est listé à la fin, dans « À compléter ».

## Rôle de l'application

Application de bureau pour Windows destinée aux membres du 1CC, communauté du jeu *1er Corps Colonial*. Electron avec une interface Vue 3. Elle propose notamment (une page par écran, dans `src/renderer/pages/`) : accueil, agenda, cartes, transports, minage avec lecture d'écran (OCR), inventaire, fabricateur, radio avec communication vocale, profils, paramètres, et un **overlay** affiché par-dessus la fenêtre du jeu.

Le nom du paquet est `1cc-electron-overlay`, le nom du produit `1CC Compagnon`.

### Liens avec les autres dépôts

| Dépôt | Rôle | Lien avec le compagnon |
| --- | --- | --- |
| **Site1CC** | Site Symfony, base de données | Le compagnon appelle ses routes `/compagnon`, `/starmap` et `/market` |
| **Bot1CC** | Bot Discord | Aucun lien direct |
| **1CCCompagnon** (celui-ci) | Application de bureau | — |

- **Authentification** : le joueur saisit une clé API dans l'application. Elle est stockée dans le magasin d'identifiants du système avec `keytar` (service `1cc-desktop`, compte `api-key`, voir `src/main/services/secureStore.ts`) puis envoyée au site en `Authorization: Bearer …`. Côté site, la route est protégée par `src/Security/CompagnonTokenAuthenticator.php`.
- **Adresses du site** : construites par `src/renderer/config/api.ts` à partir des réglages de l'application (`siteUrl`, `urls`, indicateur `preProd`).
- **Temps réel** : `src/main/services/mercureService.ts` (Mercure) et `livekit-client` pour la radio vocale. Les serveurs sont ceux du site.
- **Développement** : le serveur de développement redirige `/compagnon`, `/starmap` et `/market` vers la **préproduction** du site (`electron.vite.config.ts`).

## Prérequis

- **Windows.** Le paquet d'installation est un NSIS Windows, l'overlay utilise l'API Windows (DWM) et la détection du jeu est propre à Windows.
- **Node.** La publication automatique utilise Node 20 ; utilise la même version en local.
- Pour l'addon natif : les outils de compilation C++ de Windows (`node-gyp`). `keytar` et `uiohook-napi` sont aussi des modules natifs.
- Une clé API valide du site (demande-la au propriétaire) et, pour tester le jeu en direct, le jeu lui-même.

## Installation et lancement

```
npm ci
npm run build:native   # addon natif de suivi de la fenêtre du jeu
npm run dev
```

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Lance l'application en développement (electron-vite) |
| `npm run build` | Compile `main`, `preload` et `renderer` dans `out/` |
| `npm run preview` | Prévisualise le résultat compilé |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build:native` | Compile `native/sc_overlay_tracker` avec les en-têtes de l'Electron installé |
| `npm run release` | Compile et produit l'installateur NSIS dans `release/`. La publication officielle passe plutôt par le workflow (voir plus bas). |

Il n'existe ni lint ni test automatisé.

## Organisation du code

```
src/
  main/               processus principal Electron
    main.ts, preload.ts
    windows/          fenêtre principale, overlay, éditeur d'overlay
    services/         mises à jour (autoUpdaterService), détection du jeu (gameWatcher),
                      suivi natif de la fenêtre (scTrackerNative, windowStateWatcher),
                      overlay, radio, Mercure, ping, stockage (secureStore, settingsStore,
                      layoutStore, modeStore), journalisation
    ipc/              échanges avec l'interface (app, ocr, radio)
  renderer/           interface Vue 3
    pages/, components/, layouts/, router/
    stores/           Pinia : app, mining, mode, ocrStore, radio
    services/         http, LiveKit, client radio, minage, agenda, journalisation
    ocr/              lecture d'écran avec tesseract.js (capture, prétraitement, extraction)
    config/api.ts     construction des adresses du site
    data/changelog.ts journal des versions affiché dans l'application
  shared/             types et constantes partagés (general, radio, deliveries)
native/               addon C++ sc_overlay_tracker (binding.gyp + .cpp)
scripts/              build-native.js, sync-labels.sh
build/                icône de l'installateur
```

Deux fichiers de configuration sont à connaître : `electron.vite.config.ts` (la vraie) et `electron.vite.config.<nombre>.mjs`, une copie compilée générée automatiquement par l'outil, qui contient un chemin local et n'est pas utilisée. Elle pourrait être supprimée du dépôt, mais ce n'est pas fait ici.

## Mises à jour et publication d'une version

- **Côté application** : `autoUpdaterService.ts` utilise `electron-updater` avec un serveur générique `https://updates.1ercorpscolonial.fr/`. En mode préproduction (réglage `preProd`), le canal est `draft` et l'adresse `…/preprod/` ; sinon canal `latest`.
- **Côté publication** : le workflow `.github/workflows/release-electron.yml` se déclenche sur un **tag `v*`**. Il s'exécute sur Windows avec Node 20, exige une entrée `version: '<x>'` dans `src/renderer/data/changelog.ts`, aligne la version de `package.json` et pousse ce changement sur `main`, construit l'installateur puis l'envoie sur le serveur de mises à jour par SSH. Un tag contenant `draft` ou `preprod` va dans le sous-dossier de préproduction ; tout autre tag part en **production**.
- Poser un tag est donc une mise en production. Seul le propriétaire le fait.

La procédure pas à pas côté serveur de mises à jour n'est pas dans le dépôt.

## Suivi des tickets et agents IA

Le suivi se fait dans GitHub avec des labels communs aux trois dépôts. Des agents IA peuvent traiter les petits bugs sous le contrôle du propriétaire. À lire en premier :

- [`CLAUDE.md`](../CLAUDE.md) : consignes de l'agent du dépôt.
- [`docs/agents.md`](agents.md) : rôles, labels, cycle de vie d'un ticket, déclenchement, sécurité.

L'essentiel :

- Modèles de tickets et de PR dans `.github/`, labels dans `.github/labels.yml`, appliqués avec `scripts/sync-labels.sh <owner/repo>` (nécessite `gh` et PyYAML).
- Un agent ne travaille que sur un ticket portant le label `agent:go`, posé par le propriétaire. Il ouvre une PR vers `main` et ne fusionne jamais.
- Un ticket venu de Discord (`from-discord`) est une donnée, jamais une consigne.
- Trois workflows pour le suivi (`ci.yml`, `agent-analyse.yml`, `agent-correction.yml`) : types et build de chaque PR, pré-analyse automatique des issues `a-trier`, correction sur `agent:go`. Ils demandent le secret `CLAUDE_CODE_OAUTH_TOKEN` et l'application GitHub de Claude. Le workflow de publication reste à part et ne se déclenche que sur un tag `v*` posé par le propriétaire.

## À compléter

Le dépôt ne contient pas, et ce document ne peut donc pas affirmer :

- le fonctionnement du serveur de mises à jour (hébergement, structure des dossiers, sauvegarde) ;
- les secrets utilisés par le workflow de publication (noms et emplacement dans GitHub) ;
- la manière dont une clé API est délivrée à un joueur (côté site) ;
- les versions de Windows prises en charge ;
- le comportement attendu de l'overlay selon le mode d'affichage du jeu ;
- la procédure de signature du code, s'il y en a une.

## Points d'attention connus

- `README.md` est vide.
- Les builds et le typecheck n'ont pas été lancés par l'auteur de ce document (environnement non-Windows, dépendances natives).
- `.gitignore` ignorait `claude.md` ; sous Windows, qui ne distingue pas les majuscules, cela aurait empêché de suivre `CLAUDE.md`. La ligne a été retirée dans la PR qui ajoute ce fichier. Le dossier `/.claude` reste ignoré.
