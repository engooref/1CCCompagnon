export type ChangeType = 'feature' | 'fix' | 'improvement' | 'breaking'

export interface ChangelogEntry {
  version: string
  date: string
  changes: { type: ChangeType; text: string }[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.5.0',
    date: '2026-04-01',
    changes: [
      { type: 'improvement', text: 'Ajout de nouvelles résolutions d\'écran' },
      { type: 'improvement', text: 'Ajout de l\'agenda permettant de regarder les événements à venir' },
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
      { type: 'feature',     text: 'Première version publique' },
    ],
  },
]
