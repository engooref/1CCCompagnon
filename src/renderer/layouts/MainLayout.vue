<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import StatusBar from '../components/StatusBar.vue'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'

const app = useAppStore()
const route = useRoute()
const router = useRouter()
const canShowAppTabs = computed(() => app.status.authReady)

let defaultPageApplied = false
watch(() => app.settings, (s) => {
  if (s && canShowAppTabs.value && !defaultPageApplied && route.path === '/') {
    defaultPageApplied = true
    const dp = s.defaultPage
    if (dp && dp !== '/') router.replace(dp)
  }
}, { immediate: true })

watch(
  [() => app.status.authReady, () => route.path],
  ([authReady, path]) => {
    if (authReady) return
    if (path === '/' || path === '/settings') return
    router.replace('/')
  },
  { immediate: true },
)

const NAV_ORDER = ['/', '/radio', '/transport', '/maps', '/agenda', '/inventory', '/fabricator', '/profils', '/logs', '/settings']

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path === path || route.path.startsWith(path + '/')
}
const transitionName = ref('page-forward')
let prevIndex = NAV_ORDER.indexOf('/')

const navPosition = computed(() => app.settings?.appearance?.navPosition ?? 'left')

// ─── Sidebar collapsed (icon-only) ────────────────────────────────────────
const sidebarCollapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed.value))
}

const sidebarWidth = computed(() => sidebarCollapsed.value ? '52px' : '260px')

const gridCols = computed(() => {
  if (navPosition.value === 'left')  return `${sidebarWidth.value} 1fr`
  if (navPosition.value === 'right') return `1fr ${sidebarWidth.value}`
  return undefined
})

// ─── Groupes collapsibles (sidebar) ──────────────────────────────────────
function loadGroups(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('nav-groups') ?? '{}') } catch { return {} }
}
const groupsOpen = ref<Record<string, boolean>>({
  operations: loadGroups().operations ?? true,
  outils:     loadGroups().outils     ?? true,
  admin:      loadGroups().admin      ?? true,
})

function toggleGroup(key: string) {
  groupsOpen.value[key] = !groupsOpen.value[key]
  localStorage.setItem('nav-groups', JSON.stringify(groupsOpen.value))
}

// Un groupe est "actif" si une de ses routes est active
const groupRoutes: Record<string, string[]> = {
  operations: ['/radio', '/transport', '/inventory', '/fabricator'],
  outils:     ['/maps', '/agenda'],
  admin:      ['/profils', '/logs'],
}
function isGroupActive(key: string) {
  return groupRoutes[key].some(p => isActive(p))
}

// ─── Dropdowns nav top ────────────────────────────────────────────────────
const openDropdown = ref<string | null>(null)

function toggleDropdown(key: string) {
  openDropdown.value = openDropdown.value === key ? null : key
}

function closeDropdowns() {
  openDropdown.value = null
}

// Ferme les dropdowns si on navigue
watch(() => route.path, () => { openDropdown.value = null })

// ─── Layout style ──────────────────────────────────────────────────────────
const layoutStyle = computed(() => {
  const s = app.settings
  const scale = s?.appScale ?? 1
  if (s?.appearance) return scale !== 1 ? { zoom: scale } : {}
  const hue    = s?.appHue        ?? 0
  const bright = s?.appBrightness ?? 1
  const filters: string[] = []
  if (hue    !== 0) filters.push(`hue-rotate(${hue}deg)`)
  if (bright !== 1) filters.push(`brightness(${bright})`)
  return {
    filter: filters.length ? filters.join(' ') : undefined,
    zoom:   scale !== 1 ? scale : undefined,
  }
})

watch(() => route.path, (next, prev) => {
  const ni = NAV_ORDER.findIndex(p => next.startsWith(p) && p !== '/' || next === p)
  const pi = NAV_ORDER.findIndex(p => prev.startsWith(p) && p !== '/' || prev === p)
  const nextIdx = ni === -1 ? 0 : ni
  const prevIdx = pi === -1 ? prevIndex : pi
  transitionName.value = nextIdx >= prevIdx ? 'page-forward' : 'page-back'
  prevIndex = nextIdx
})

// ─── Agenda notifications ──────────────────────────────────────────────────
const notifiedIds = new Set<number>()
let agendaTimer: ReturnType<typeof setInterval> | null = null

async function checkUpcomingEvents() {
  if (!app.bearerToken || !app.settings) return
  if (app.settings.agendaNotificationsEnabled === false) return
  const urls = createOverlayUrls(app.settings)
  if (!urls.agendaIndex) return
  try {
    const { data } = await http.get(urls.agendaIndex, {
      headers: { Authorization: `Bearer ${app.bearerToken}` },
      params: { limit: 20 },
    })
    const events: { id: number; name: string; start: string | null }[] = data?.events ?? []
    const now = Date.now()
    for (const event of events) {
      if (!event.start || notifiedIds.has(event.id)) continue
      const diffMin = (new Date(event.start).getTime() - now) / 60_000
      if (diffMin >= 14 && diffMin < 16) {
        notifiedIds.add(event.id)
        window.oneCC.showNotification('⏰ Événement dans 15 min', event.name)
      }
    }
  } catch { /* silencieux */ }
}

onMounted(() => { checkUpcomingEvents(); agendaTimer = setInterval(checkUpcomingEvents, 60_000) })
onUnmounted(() => { if (agendaTimer) clearInterval(agendaTimer) })
</script>

<template>
  <div class="h-full text-th-primary">
    <div
      class="h-full overflow-hidden border border-accent/20 bg-[var(--bg-primary)]"
      :class="navPosition === 'left' || navPosition === 'right'
        ? 'grid grid-rows-[64px_1fr_auto]'
        : 'flex flex-col'"
      :style="layoutStyle"
    >

      <!-- ══════════════════════════════════════════════
           HEADER
      ══════════════════════════════════════════════ -->
      <header
        v-if="navPosition === 'left' || navPosition === 'right'"
        class="flex items-center border-b border-accent/20 px-5 bg-[var(--bg-surface)]"
      >
        <h1 class="text-lg font-bold tracking-[0.2em] truncate transition-all duration-200">
          <span v-if="!sidebarCollapsed">1CC COMPAGNON</span>
          <span v-else class="tracking-widest">1CC</span>
        </h1>
      </header>

      <!-- ══════════════════════════════════════════════
           NAV HORIZONTALE HAUT
      ══════════════════════════════════════════════ -->
      <nav
        v-if="navPosition === 'top'"
        class="shrink-0 flex items-center gap-0.5 border-b border-accent/20 px-3 h-12 bg-[var(--bg-surface)]"
        @click.self="closeDropdowns"
      >
        <span class="mr-3 text-sm font-bold tracking-[0.15em] text-th-secondary shrink-0">1CC</span>

        <!-- Dashboard -->
        <RouterLink v-if="canShowAppTabs" to="/" class="nav-h" :class="{ 'nav-h-active': isActive('/') }">Dashboard</RouterLink>

        <!-- Dropdown Opérations -->
        <div v-if="canShowAppTabs" class="relative">
          <button
            class="nav-h"
            :class="{ 'nav-h-active': isGroupActive('operations'), 'nav-h-open': openDropdown === 'operations' }"
            @click="toggleDropdown('operations')"
          >
            Opérations
            <svg class="w-3 h-3 ml-1 transition-transform duration-150" :class="{ 'rotate-180': openDropdown === 'operations' }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-if="openDropdown === 'operations'" class="nav-dropdown">
            <div v-if="app.profile?.rh?.radio || app.profile?.isBureau">
              <RouterLink to="/radio"      class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/radio') }">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>
                Radio
              </RouterLink>
            </div>
            <RouterLink to="/transport"  class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/transport') }">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/></svg>
              Transport
            </RouterLink>
            <RouterLink to="/inventory"  class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/inventory') }">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8L5 5h14l2 3H3M5 8v13h14V8M5 14h14M12 8v13"/></svg>
              Inventaire
            </RouterLink>
            <RouterLink to="/fabricator" class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/fabricator') }">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
              Fabricator
            </RouterLink>
          </div>
        </div>

        <!-- Dropdown Outils -->
        <div v-if="canShowAppTabs" class="relative">
          <button
            class="nav-h"
            :class="{ 'nav-h-active': isGroupActive('outils'), 'nav-h-open': openDropdown === 'outils' }"
            @click="toggleDropdown('outils')"
          >
            Outils
            <svg class="w-3 h-3 ml-1 transition-transform duration-150" :class="{ 'rotate-180': openDropdown === 'outils' }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-if="openDropdown === 'outils'" class="nav-dropdown">
            <RouterLink to="/maps"   class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/maps') }">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/></svg>
              Cartes
            </RouterLink>
            <RouterLink to="/agenda" class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/agenda') }">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Agenda
            </RouterLink>
          </div>
        </div>

        <!-- Dropdown Admin -->
        <div v-if="canShowAppTabs" class="relative">
          <button
            class="nav-h"
            :class="{ 'nav-h-active': isGroupActive('admin'), 'nav-h-open': openDropdown === 'admin' }"
            @click="toggleDropdown('admin')"
          >
            Admin
            <svg class="w-3 h-3 ml-1 transition-transform duration-150" :class="{ 'rotate-180': openDropdown === 'admin' }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-if="openDropdown === 'admin'" class="nav-dropdown">
            <RouterLink to="/profils" class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/profils') }">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              Profil
            </RouterLink>
            <RouterLink to="/logs"    class="nav-dropdown-item" :class="{ 'nav-dropdown-item-active': isActive('/logs') }">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
              Logs
            </RouterLink>
          </div>
        </div>

        <!-- Paramètres -->
        <RouterLink to="/settings" class="nav-h ml-auto" :class="{ 'nav-h-active': isActive('/settings') }">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </RouterLink>
      </nav>

      <!-- Overlay fermeture dropdown au clic extérieur -->
      <div v-if="openDropdown && navPosition === 'top'" class="fixed inset-0 z-10" @click="closeDropdowns" />

      <!-- ══════════════════════════════════════════════
           CORPS : sidebar + main
      ══════════════════════════════════════════════ -->
      <div
        class="min-h-0 flex-1 overflow-y-auto scrollbar-none"
        :class="{ 'grid': navPosition === 'left' || navPosition === 'right' }"
        :style="gridCols ? { gridTemplateColumns: gridCols } : undefined"
      >

        <!-- ── Sidebar (gauche ou droite) ──────────────────────────── -->
        <aside
          v-if="navPosition === 'left' || navPosition === 'right'"
          class="flex flex-col overflow-hidden bg-[var(--bg-surface)] sidebar-transition"
          :class="[
            navPosition === 'left' ? 'border-r' : 'border-l',
            'border-accent/20',
            sidebarCollapsed ? 'p-2' : 'p-3',
          ]"
        >
          <nav class="text-sm flex-1 overflow-y-auto scrollbar-none space-y-0.5">

            <!-- ─ Dashboard ──────────────────────────────────────── -->
            <RouterLink
              v-if="canShowAppTabs"
              to="/"
              class="nav-v"
              :class="[{ 'nav-v-active': isActive('/') }, sidebarCollapsed ? 'nav-v-icon' : '']"
              title="Dashboard"
            >
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
              <span v-if="!sidebarCollapsed">Dashboard</span>
            </RouterLink>

            <!-- ─ Séparateur ─────────────────────────────────────── -->
            <div v-if="canShowAppTabs" class="my-1 border-t border-th-subtle" />

            <!-- ══ MODE ÉTENDU : groupes collapsibles ════════════════ -->
            <template v-if="!sidebarCollapsed && canShowAppTabs">

              <!-- Groupe Opérations -->
              <button class="group-header" @click="toggleGroup('operations')">
                <svg class="w-3 h-3 shrink-0 chevron" :class="{ open: groupsOpen.operations }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                </svg>
                <span>Opérations</span>
                <span v-if="isGroupActive('operations') && !groupsOpen.operations" class="group-dot" />
              </button>
              <div v-show="groupsOpen.operations" class="group-items">
                <RouterLink to="/radio"       class="nav-v" :class="{ 'nav-v-active': isActive('/radio') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>
                  Radio
                </RouterLink>
                <RouterLink to="/transport"  class="nav-v" :class="{ 'nav-v-active': isActive('/transport') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/></svg>
                  Transport
                </RouterLink>
                <RouterLink to="/inventory"  class="nav-v" :class="{ 'nav-v-active': isActive('/inventory') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8L5 5h14l2 3H3M5 8v13h14V8M5 14h14M12 8v13"/></svg>
                  Inventaire
                </RouterLink>
                <RouterLink to="/fabricator" class="nav-v" :class="{ 'nav-v-active': isActive('/fabricator') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
                  Fabricator
                </RouterLink>
              </div>

              <!-- Groupe Outils -->
              <button class="group-header" @click="toggleGroup('outils')">
                <svg class="w-3 h-3 shrink-0 chevron" :class="{ open: groupsOpen.outils }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                </svg>
                <span>Outils</span>
                <span v-if="isGroupActive('outils') && !groupsOpen.outils" class="group-dot" />
              </button>
              <div v-show="groupsOpen.outils" class="group-items">
                <RouterLink to="/maps"   class="nav-v" :class="{ 'nav-v-active': isActive('/maps') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/></svg>
                  Cartes
                </RouterLink>
                <RouterLink to="/agenda" class="nav-v" :class="{ 'nav-v-active': isActive('/agenda') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  Agenda
                </RouterLink>
              </div>

              <!-- Groupe Admin -->
              <button class="group-header" @click="toggleGroup('admin')">
                <svg class="w-3 h-3 shrink-0 chevron" :class="{ open: groupsOpen.admin }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                </svg>
                <span>Admin</span>
                <span v-if="isGroupActive('admin') && !groupsOpen.admin" class="group-dot" />
              </button>
              <div v-show="groupsOpen.admin" class="group-items">
                <RouterLink to="/profils" class="nav-v" :class="{ 'nav-v-active': isActive('/profils') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                  Profil
                </RouterLink>
                <RouterLink to="/logs" class="nav-v" :class="{ 'nav-v-active': isActive('/logs') }">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                  Logs
                </RouterLink>
              </div>

            </template>

            <!-- ══ MODE RÉDUIT : toutes les icônes à plat ════════════ -->
            <template v-else-if="canShowAppTabs">
              <RouterLink to="/radio"       class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/radio') }"       title="Radio">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"/></svg>
              </RouterLink>
              <RouterLink to="/transport"  class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/transport') }"  title="Transport">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/></svg>
              </RouterLink>
              <RouterLink to="/inventory"  class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/inventory') }"  title="Inventaire">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8L5 5h14l2 3H3M5 8v13h14V8M5 14h14M12 8v13"/></svg>
              </RouterLink>
              <RouterLink to="/fabricator" class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/fabricator') }" title="Fabricator">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
              </RouterLink>
              <RouterLink to="/maps"       class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/maps') }"       title="Cartes">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/></svg>
              </RouterLink>
              <RouterLink to="/agenda"     class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/agenda') }"     title="Agenda">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </RouterLink>
              <RouterLink to="/profils"    class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/profils') }"    title="Profil">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              </RouterLink>
              <RouterLink to="/logs"       class="nav-v nav-v-icon" :class="{ 'nav-v-active': isActive('/logs') }"       title="Logs">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
              </RouterLink>
            </template>

            <!-- ─ Paramètres (toujours en bas) ──────────────────────── -->
            <div class="mt-2 pt-2 border-t border-th-subtle" :class="sidebarCollapsed ? 'flex justify-center' : ''">
              <RouterLink
                to="/settings"
                class="nav-v"
                :class="[{ 'nav-v-active': isActive('/settings') }, sidebarCollapsed ? 'nav-v-icon' : '']"
                title="Paramètres"
              >
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span v-if="!sidebarCollapsed">Paramètres</span>
              </RouterLink>
            </div>
          </nav>

          <!-- ─ Bouton toggle sidebar ──────────────────────────────── -->
          <div class="pt-2 mt-2 border-t border-th-subtle" :class="sidebarCollapsed ? 'flex justify-center' : ''">
            <button
              class="toggle-btn"
              :class="sidebarCollapsed ? 'toggle-btn-icon' : ''"
              :title="sidebarCollapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'"
              @click="toggleSidebar"
            >
              <svg
                class="w-4 h-4 shrink-0 transition-transform duration-200"
                :class="[
                  navPosition === 'right'
                    ? (sidebarCollapsed ? 'rotate-180' : '')
                    : (sidebarCollapsed ? '' : 'rotate-180')
                ]"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
              </svg>
              <span v-if="!sidebarCollapsed" class="text-xs">Réduire</span>
            </button>
          </div>
        </aside>

        <!-- ── Contenu page ─────────────────────────────────────────── -->
        <main class="h-full min-h-0 overflow-hidden p-6">
          <RouterView v-slot="{ Component }">
            <Transition :name="transitionName" mode="out-in">
              <component :is="Component" :key="route.path" />
            </Transition>
          </RouterView>
        </main>

      </div>

      <StatusBar />
    </div>
  </div>
</template>

<style scoped>
/* ── Scrollbar cachée ──────────────────────────────────────────────── */
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

/* ── Sidebar transition ─────────────────────────────────────────────── */
.sidebar-transition {
  transition: padding 0.2s ease;
}

/* ── Nav verticale ─────────────────────────────────────────────────── */
.nav-v {
  @apply flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-th-secondary
         hover:text-accent2 hover:bg-accent2/[0.06] transition-colors;
}
.nav-v-active {
  @apply border-accent/30 bg-accent/10 text-th-bright;
}
.nav-v-icon {
  @apply justify-center px-0 py-2 w-9 gap-0 mx-auto;
}

/* ── En-tête de groupe ──────────────────────────────────────────────── */
.group-header {
  @apply flex items-center gap-1.5 w-full px-2 py-1 mt-1 rounded text-xs font-semibold
         tracking-wider uppercase text-th-secondary opacity-60 hover:opacity-100 hover:text-th-secondary transition-colors select-none;
}
.group-items {
  @apply pl-2 space-y-0.5 mb-1;
}
.group-dot {
  @apply ml-auto w-1.5 h-1.5 rounded-full bg-accent shrink-0;
}

/* Chevron rotation */
.chevron {
  transition: transform 0.18s ease;
  transform: rotate(0deg);
}
.chevron.open {
  transform: rotate(90deg);
}

/* ── Bouton toggle ──────────────────────────────────────────────────── */
.toggle-btn {
  @apply flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-th-secondary
         hover:text-accent2 hover:bg-accent2/[0.06] transition-colors border border-transparent;
}
.toggle-btn-icon {
  @apply justify-center px-0 py-2 w-9 gap-0;
}

/* ── Nav horizontale ───────────────────────────────────────────────── */
.nav-h {
  @apply flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-th-secondary
         hover:text-accent2 hover:bg-accent2/[0.06] border border-transparent transition-colors whitespace-nowrap;
}
.nav-h-active {
  @apply border-accent/30 bg-accent/10 text-th-bright;
}
.nav-h-open {
  @apply bg-accent2/[0.06] text-th-primary;
}

/* ── Dropdown nav top ──────────────────────────────────────────────── */
.nav-dropdown {
  @apply absolute top-full left-0 mt-1 z-20 min-w-[160px] rounded-lg border border-accent/20
         bg-[var(--bg-surface)] shadow-lg py-1;
}
.nav-dropdown-item {
  @apply flex items-center gap-2.5 px-3 py-2 text-sm text-th-secondary
         hover:text-accent2 hover:bg-accent2/[0.06] transition-colors;
}
.nav-dropdown-item-active {
  @apply text-th-bright bg-accent/10;
}

/* ── Transitions page ──────────────────────────────────────────────── */
.page-forward-enter-active,
.page-forward-leave-active,
.page-back-enter-active,
.page-back-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}
.page-forward-enter-from { opacity: 0; transform: translateY(10px); }
.page-forward-leave-to   { opacity: 0; transform: translateY(-8px); }
.page-back-enter-from    { opacity: 0; transform: translateY(-10px); }
.page-back-leave-to      { opacity: 0; transform: translateY(8px); }
</style>
