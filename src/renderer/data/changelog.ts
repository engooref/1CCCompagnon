export type ChangeType = 'feature' | 'fix' | 'improvement' | 'delete'

export interface ChangelogEntry {
  version: string
  date: string
  changes: { type: ChangeType; text: string }[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '2.0.1-draft',
    date: '2026-05-06',
    changes: [
      { type: 'feature', text: 'Premiere implementation du module de minage' },
      
    ]
  },
  {
    version: '1.2.1',
    date: '2026-04-01',
    changes: [
      { type: 'fix', text: 'Correction de bugs remonter dans le module Radio' },
    ]
  },
  {
    version: '1.2.0',
    date: '2026-03-31',
    changes: [
      { type: 'feature', text: 'Ajout de la partie Radio dans l\'overlay en jeu : affiche les communications vocales en temps réel' },
      { type: 'improvement', text: 'Amélioration de la gestion des modules dans l\'éditeur de layout : options spécifiques pour le module Radio' },
      { type: 'improvement', text: 'Amélioration de l\'interface de la radio pour ajouter des catégories de canaux et des options de PRT supplémentaires' },
      { type: 'improvement', text: 'Amélioration du module Fabricator en fonction des retours joueurs' },
      { type: 'fix', text: 'Correction de divers bugs mineurs et optimisation des performances' },
    ]
  },
  {
    version: '1.1.0',
    date: '2026-03-31',
    changes: [
      { type: 'feature', text: 'Nouveau module Radio : communications vocales en temps réel avec gestion des canaux et des participants' },
      { type: 'improvement', text: 'Ajout d\'un filtre pour le catalogue du fabricator permettant de voir les blueprint posseder par au moins un joueur' },
      { type: 'improvement', text: 'Amélioration de l\'interface d\'onglet pour plus de lisibilité et d\'ergonomie' },
      { type: 'fix', text: 'Correction de divers bugs mineurs et optimisation des performances' },

    ]
  },
  {
    version: '1.0.3',
    date: '2026-03-27',
    changes: [
      { type: 'fix', text: 'Correction de la map qui s\'ouvrait qu\'avec l\'overlay actif' },
      { type: 'fix', text: 'Correction de l\'overlay transport sur le raffraichissement' },
    ]
  },
  {
    version: '1.0.2',
    date: '2026-03-26',
    changes: [
      { type: 'fix', text: 'Correction des opportunités de marché dans le module Transport' },
      { type: 'feature', text: 'Ajout du module Fabricator' },   
    ]
  },
  {
    version: '1.0.1',
    date: '2026-03-25',
    changes: [
      { type: 'fix', text: 'Correction native pour overlay' },
    ]
  },
  {
    version: '1.0.0',
    date: '2026-03-25',
    changes: [
      // ── Nouvelles fonctionnalités ────────────────────────────────────────
      { type: 'feature', text: 'Tableau de bord : profil joueur avec rang, XP et barre de progression vers le niveau suivant' },
      { type: 'feature', text: 'Module Transport : suivi en temps réel des commandes de transport avec progression par étape d\'itinéraire' },
      { type: 'feature', text: 'Module Transport : gestion des cargaisons (chargement / déchargement) avec calcul des capacités SCU' },
      { type: 'feature', text: 'Module Transport : opportunités de marché intégrées avec budget configurable' },
      { type: 'feature', text: 'Module Transport : épinglage d\'une commande pour accès rapide depuis le tableau de bord' },
      { type: 'feature', text: 'Module Inventaire : suivi des stocks par localisation avec recherche, filtres par section/catégorie et regroupement' },
      { type: 'feature', text: 'Module Inventaire : synchronisation en temps réel via le protocole Mercure' },
      { type: 'feature', text: 'Module Cartes : visualisation interactive (Leaflet) avec marqueurs et grille, épinglage pour l\'overlay' },
      { type: 'feature', text: 'Module Agenda : calendrier d\'événements avec filtres par type et notifications Windows 15 min avant le début' },
      { type: 'feature', text: 'Overlay en jeu : fenêtre transparente superposée au jeu, affichage Transport et Cartes côte à côte' },
      { type: 'feature', text: 'Overlay en jeu : détection automatique de la fenêtre Star Citizen via addon natif C++ (sc_overlay_tracker)' },
      { type: 'feature', text: 'Overlay en jeu : éditeur de layout drag & drop pour positionner et redimensionner les modules' },
      { type: 'feature', text: 'Mise à jour automatique : téléchargement et installation via electron-updater avec barre de progression' },
      { type: 'feature', text: 'Visionneuse de logs temps réel avec filtrage par niveau (debug, info, warn, error) et horodatage' },
      { type: 'feature', text: 'Mode pré-production pour les testeurs : bascule vers l\'environnement de recette (redémarrage requis)' },
      { type: 'feature', text: 'Personnalisation complète de l\'apparence : couleur primaire, accent, texte, position de la navigation et taille de police' },
      // ── Améliorations ────────────────────────────────────────────────────
      { type: 'improvement', text: 'Touche de bascule overlay entièrement personnalisable (F10 par défaut), enregistrement à la volée' },
      { type: 'improvement', text: 'Opacité de la carte overlay réglable (0 à 100 %)' },
      { type: 'improvement', text: 'Huit préréglages de résolution de fenêtre (de 800×600 jusqu\'à 4K UHD)' },
      { type: 'improvement', text: 'Latence de connexion affichée en temps réel dans la barre de statut' },
      { type: 'improvement', text: 'Stockage sécurisé de la clé API via Keytar (trousseau système)' },
      { type: 'improvement', text: 'Synchronisation temps réel des données (inventaire, cartes) via protocole Mercure (SSE)' },
    ],
  },
]
