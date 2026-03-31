import { createRouter, createWebHashHistory } from 'vue-router'

// Seule la page d'accueil est chargée immédiatement
import HomePage from '../pages/HomePage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/profils', name: 'profils', component: () => import('../pages/ProfilsPage.vue') },
    { path: '/transport', name: 'transport', component: () => import('../pages/TransportPage.vue') },
    { path: '/transport/new', name: 'transport-new', component: () => import('../pages/TransportFormPage.vue') },
    { path: '/transport/:id/edit', name: 'transport-edit', component: () => import('../pages/TransportFormPage.vue') },
    { path: '/radio', name: 'radio', component: () => import('../pages/RadioPage.vue') },
    { path: '/transport/:id', name: 'transport-detail', component: () => import('../pages/TransportDetailPage.vue') },
    { path: '/maps', name: 'maps', component: () => import('../pages/MapPage.vue') },
    { path: '/maps/:id', name: 'map-detail', component: () => import('../pages/MapDetailPage.vue') },
    { path: '/agenda', name: 'agenda', component: () => import('../pages/AgendaPage.vue') },
    { path: '/agenda/:id', name: 'agenda-detail', component: () => import('../pages/AgendaDetailPage.vue') },
    { path: '/inventory', name: 'inventory', component: () => import('../pages/InventoryPage.vue') },
    { path: '/fabricator', name: 'fabricator', component: () => import('../pages/FabricatorPage.vue') },
    { path: '/logs', name: 'logs', component: () => import('../pages/OverlayLogsPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('../pages/SettingsPage.vue') },
    { path: '/overlay', name: 'overlay', component: () => import('../pages/OverlayPage.vue') },
    { path: '/overlay-editor', name: 'overlay-editor', component: () => import('../pages/OverlayEditorPage.vue') },
  ]
})
