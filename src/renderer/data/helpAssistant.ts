export interface HelpAction {
  label: string
  to: string
}

export interface HelpTopic {
  id: string
  title: string
  objective: string
  visibleNow: string[]
  tips: string[]
  prerequisites?: string[]
  limits?: string[]
  actions?: HelpAction[]
}

const baseActions: HelpAction[] = [
  { label: 'Ouvrir les paramètres', to: '/settings' },
  { label: 'Voir les logs', to: '/logs' },
  { label: 'Retour au dashboard', to: '/' },
]

export const helpFallback: HelpTopic = {
  id: 'fallback',
  title: 'Assistant 1CC',
  objective: 'Donner des repères rapides sur ce que tu vois et quoi faire ensuite.',
  visibleNow: [
    'Le contenu principal correspond au module de la route active.',
    'La barre du bas affiche le statut de connexion et les actions globales.',
  ],
  tips: [
    'Commence par verifier la connexion API dans la barre du bas.',
    'Ouvre les parametres si un module ne reagit pas comme attendu.',
  ],
  prerequisites: ['Connexion API active pour charger les donnees metier.'],
  limits: ['Certaines sections restent limitees tant que la connexion n\'est pas etablie.'],
  actions: baseActions,
}

const helpTopics: HelpTopic[] = [
  {
    id: 'home',
    title: 'Dashboard',
    objective: 'Donner une vue rapide de ton etat joueur, transports et agenda.',
    visibleNow: [
      'Bloc profil + statut de connexion.',
      'Tuiles de synthese (ordres actifs, transport epingle).',
      'Resume agenda et raffinerie selon tes droits.',
    ],
    tips: [
      'Si la page est vide, connecte-toi via le bouton en bas a droite.',
      'Pingle un transport pour le retrouver en overlay plus vite.',
    ],
    actions: [
      { label: 'Ouvrir Transport', to: '/transport' },
      { label: 'Ouvrir Agenda', to: '/agenda' },
      ...baseActions,
    ],
  },
  {
    id: 'transport',
    title: 'Module Transport',
    objective: 'Suivre et gerer les ordres de transport et leur progression.',
    visibleNow: [
      'Liste des ordres avec progression et statut.',
      'Actions rapides: epingler, modifier, supprimer.',
      'Boutons d\'actualisation et creation d\'ordre.',
    ],
    tips: [
      'Utilise l\'epinglage pour afficher un ordre cle en overlay.',
      'Actualise apres une suppression pour confirmer l\'etat serveur.',
    ],
    prerequisites: ['Connexion requise pour charger les ordres.'],
    actions: [
      { label: 'Guide interactif liste work orders', to: '/transport#guide-list' },
      { label: 'Guide interactif creation work order', to: '/transport/new#guide' },
      { label: 'Creer un ordre', to: '/transport/new' },
      { label: 'Retour Dashboard', to: '/' },
      ...baseActions,
    ],
  },
  {
    id: 'radio',
    title: 'Module Radio',
    objective: 'Suivre les communications vocales et la presence des canaux.',
    visibleNow: [
      'Canaux et participants selon tes permissions.',
      'Etat des communications en temps reel.',
    ],
    tips: [
      'Verifie ton role si des canaux attendus ne sont pas visibles.',
      'Controle les reglages audio dans Parametres > Radio.',
    ],
    actions: [
      { label: 'Reglages Radio', to: '/settings' },
      ...baseActions,
    ],
  },
  {
    id: 'mining',
    title: 'Module Minage',
    objective: 'Suivre l\'activite de raffinage et les informations associees.',
    visibleNow: [
      'Etat des sessions de minage et raffinerie.',
      'Indicateurs de progression et de mise a jour.',
    ],
    tips: [
      'Si aucun flux n\'arrive, verifie la connexion et les logs.',
      'Commence par le dashboard pour un controle rapide de l\'etat.',
    ],
    actions: baseActions,
  },
  {
    id: 'ocr',
    title: 'Module OCR',
    objective: 'Configurer et exploiter la capture OCR Star Citizen.',
    visibleNow: [
      'Zones OCR et options de capture.',
      'Actions de test et ajustements de detection.',
    ],
    tips: [
      'Teste sur une capture stable avant d\'affiner les zones.',
      'Masque les overlays parasites si la reconnaissance chute.',
    ],
    actions: [
      { label: 'Ouvrir Overlay', to: '/overlay' },
      ...baseActions,
    ],
  },
  {
    id: 'maps',
    title: 'Module Cartes',
    objective: 'Consulter les cartes et gerer leur affichage en overlay.',
    visibleNow: [
      'Liste/cartes consultables et actions d\'epinglage.',
      'Navigation vers details de carte.',
    ],
    tips: [
      'Epingler une carte utile permet un acces direct en overlay.',
      'Utilise les details de carte pour verifier les points clefs.',
    ],
    actions: [
      { label: 'Ouvrir Overlay', to: '/overlay' },
      ...baseActions,
    ],
  },
  {
    id: 'agenda',
    title: 'Module Agenda',
    objective: 'Suivre les evenements a venir et leurs echeances.',
    visibleNow: [
      'Evenements filtres avec dates et types.',
      'Navigation vers les details d\'evenement.',
    ],
    tips: [
      'Active les notifications agenda si tu veux les rappels auto.',
      'Controle les horaires avant les operations de groupe.',
    ],
    actions: baseActions,
  },
  {
    id: 'inventory',
    title: 'Module Inventaire',
    objective: 'Suivre les stocks et operations d\'entree/sortie.',
    visibleNow: [
      'Inventaire par sections/categories.',
      'Actions de creation, edition et suppression.',
    ],
    tips: [
      'Utilise les filtres pour limiter les erreurs de selection.',
      'Actualise apres une operation critique pour confirmer l\'etat.',
    ],
    actions: baseActions,
  },
  {
    id: 'fabricator',
    title: 'Module Fabricator',
    objective: 'Trouver des recettes et visualiser les besoins de production.',
    visibleNow: [
      'Catalogue de recettes et details de fabrication.',
      'Etats vides si aucun objet n\'est selectionne.',
    ],
    tips: [
      'Commence par une recherche simple puis affine par section.',
      'Compare les besoins de ressources avant validation.',
    ],
    actions: baseActions,
  },
  {
    id: 'overlay',
    title: 'Module Overlay',
    objective: 'Configurer les modules affiches en jeu et leur comportement.',
    visibleNow: [
      'Liste des modules overlay et options d\'interaction.',
      'Edition de layout et redimensionnement.',
    ],
    tips: [
      'Utilise un mode simple avant de personnaliser chaque module.',
      'Verifie le rendu en jeu apres chaque gros ajustement.',
    ],
    limits: ['Certaines actions dependent du suivi de fenetre natif.'],
    actions: [
      { label: 'Parametres Overlay', to: '/settings' },
      ...baseActions,
    ],
  },
  {
    id: 'settings',
    title: 'Parametres',
    objective: 'Configurer les options globales de l\'application et de l\'overlay.',
    visibleNow: [
      'Onglets de configuration (general, overlay, modes, transport, cartes, apparence).',
      'Sauvegarde immediate de la plupart des reglages.',
    ],
    tips: [
      'Commence par General puis Overlay avant les optimisations fines.',
      'Teste un changement critique puis reviens ici si besoin.',
    ],
    actions: [
      { label: 'Ouvrir Overlay', to: '/overlay' },
      ...baseActions,
    ],
  },
  {
    id: 'profils',
    title: 'Profils',
    objective: 'Consulter et gerer les informations utilisateur.',
    visibleNow: [
      'Donnees de profil et metadata liees au compte.',
    ],
    tips: [
      'Verifie ici les informations de role si un module est restreint.',
    ],
    actions: baseActions,
  },
  {
    id: 'logs',
    title: 'Logs',
    objective: 'Diagnostiquer les erreurs et verifier le comportement de l\'application.',
    visibleNow: [
      'Flux de logs filtres par niveau.',
      'Messages utiles pour depannage rapide.',
    ],
    tips: [
      'En cas d\'erreur module, reproduis puis ouvre les logs.',
      'Filtre par niveau error/warn pour aller plus vite.',
    ],
    actions: baseActions,
  },
]

function topicIdFromPath(path: string): string {
  if (path === '/') return 'home'
  if (path.startsWith('/transport')) return 'transport'
  if (path.startsWith('/radio')) return 'radio'
  if (path.startsWith('/mining')) return 'mining'
  if (path.startsWith('/ocr')) return 'ocr'
  if (path.startsWith('/maps')) return 'maps'
  if (path.startsWith('/agenda')) return 'agenda'
  if (path.startsWith('/inventory')) return 'inventory'
  if (path.startsWith('/fabricator')) return 'fabricator'
  if (path.startsWith('/overlay')) return 'overlay'
  if (path.startsWith('/settings')) return 'settings'
  if (path.startsWith('/profils')) return 'profils'
  if (path.startsWith('/logs')) return 'logs'
  return 'fallback'
}

export function getHelpTopicForPath(path: string): HelpTopic {
  const topicId = topicIdFromPath(path)
  return helpTopics.find((topic) => topic.id === topicId) ?? helpFallback
}
