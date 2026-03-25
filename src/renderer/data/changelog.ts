export type ChangeType = 'feature' | 'fix' | 'improvement' | 'delete'

export interface ChangelogEntry {
  version: string
  date: string
  changes: { type: ChangeType; text: string }[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.7.0-draft',
    date: '2026-03-25',
    changes: [
      { type: 'feature', text: 'Ajout mode test' },
    ],
  },
  {
    version: '0.6.2',
    date: '2026-03-25',
    changes: [
      { type: 'delete', text: 'Suppression du suivi des logs du jeu' },
      { type: 'feature', text: 'Affichage log de l\'overlay' },
      { type: 'improvement', text: 'correction de bugs sur les ordres de transports' },
    ],
  },
  {
    version: '0.6.1',
    date: '2026-03-25',
    changes: [
      { type: 'improvement', text: 'Amélioration de l\'auto installation de la mise à jour' }
    ],
  },
  {
    version: '0.6.0',
    date: '2026-03-25',
    changes: [
      { type: 'feature', text: 'Ajout de la personnalisation de l\'interface' },
      { type: 'feature', text: 'Ajout du système d\'inventaire et synchronisation direct avec le site' },
      { type: 'improvement', text: 'Overlay amélioré : plus fluide, mieux synchronisé avec le jeu et plus stable.' },    
      { type: 'improvement', text: 'Amélioration des ordres de transports, permettant pour un meme manifests de mettre plusieurs cargaisons' },

    ],
  },
  {
    version: '0.5.0',
    date: '2026-03-25',
    changes: [
      { type: 'feature', text: 'Ajout de nouvelles résolutions d\'écran' },
      { type: 'feature', text: 'Ajout de l\'agenda permettant de regarder les événements à venir avec notifications' },

    ],
  },
  {
    version: '0.4.0',
    date: '2026-03-21',
    changes: [
      { type: 'feature',     text: 'Mise à jour automatique intégrée (electron-updater)' },
      { type: 'feature',     text: 'Bannière de notification lors d\'une nouvelle version disponible' },
      { type: 'improvement', text: 'Barre de progression lors du téléchargement d\'une mise à jour' },
      { type: 'improvement', text: 'Indicateur visuel "Recherche de mises à jour…" au démarrage' },
      { type: 'improvement', text: 'Texte du bouton Déconnecter et version plus lisible' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-03-10',
    changes: [
      { type: 'feature',     text: 'Première version' },
    ],
  },
]
