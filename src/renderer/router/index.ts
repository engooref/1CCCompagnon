import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../pages/HomePage.vue'
import ProfilsPage from '../pages/ProfilsPage.vue'
import TransportPage from '../pages/TransportPage.vue'
import TransportDetailPage from '../pages/TransportDetailPage.vue'
import TransportFormPage from '../pages/TransportFormPage.vue'
import SettingsPage from '../pages/SettingsPage.vue'
import MapPage from '../pages/MapPage.vue'
import MapDetailPage from '../pages/MapDetailPage.vue'
import GameLogPage from '../pages/GameLogPage.vue'
import OverlayPage from '../pages/OverlayPage.vue'
import OverlayEditorPage from '../pages/OverlayEditorPage.vue'
import AgendaPage from '../pages/AgendaPage.vue'
import AgendaDetailPage from '../pages/AgendaDetailPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/profils', name: 'profils', component: ProfilsPage },
    { path: '/transport', name: 'transport', component: TransportPage },
    { path: '/transport/new', name: 'transport-new', component: TransportFormPage },
    { path: '/transport/:id/edit', name: 'transport-edit', component: TransportFormPage },
    { path: '/transport/:id', name: 'transport-detail', component: TransportDetailPage },
    { path: '/maps', name: 'maps', component: MapPage },
    { path: '/maps/:id', name: 'map-detail', component: MapDetailPage },
    { path: '/agenda', name: 'agenda', component: AgendaPage },
    { path: '/agenda/:id', name: 'agenda-detail', component: AgendaDetailPage },
    { path: '/gamelog', name: 'gamelog', component: GameLogPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/overlay', name: 'overlay', component: OverlayPage },
    { path: '/overlay-editor', name: 'overlay-editor', component: OverlayEditorPage },
  ]
})
