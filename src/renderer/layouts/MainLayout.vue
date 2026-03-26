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

let defaultPageApplied = false
watch(() => app.settings, (s) => {
  if (s && !defaultPageApplied && route.path === '/') {
    defaultPageApplied = true
    const dp = s.defaultPage
    if (dp && dp !== '/') router.replace(dp)
  }
}, { immediate: true })

const NAV_ORDER = ['/', '/transport', '/maps', '/agenda', '/inventory', '/fabricator', '/profils', '/logs', '/settings']

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path === path || route.path.startsWith(path + '/')
}
const transitionName = ref('page-forward')
let prevIndex = NAV_ORDER.indexOf('/')

const navPosition = computed(() => app.settings?.appearance?.navPosition ?? 'left')

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

// ─── Agenda notifications ─────────────────────────────────────────────────────

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
           HEADER  (uniquement si nav verticale)
      ══════════════════════════════════════════════ -->
      <header
        v-if="navPosition === 'left' || navPosition === 'right'"
        class="flex items-center border-b border-accent/20 px-5 bg-[var(--bg-surface)]"
      >
        <h1 class="text-lg font-bold tracking-[0.2em]">1CC COMPAGNON</h1>
      </header>

      <!-- ══════════════════════════════════════════════
           NAV HORIZONTALE HAUT
      ══════════════════════════════════════════════ -->
      <nav
        v-if="navPosition === 'top'"
        class="shrink-0 flex items-center gap-0.5 border-b border-accent/20 px-3 h-12 bg-[var(--bg-surface)]"
      >
        <span class="mr-3 text-sm font-bold tracking-[0.15em] text-th-secondary shrink-0">1CC</span>
        <RouterLink to="/"          class="nav-h" :class="{ 'nav-h-active': isActive('/') }">Dashboard</RouterLink>
        <RouterLink to="/transport" class="nav-h" :class="{ 'nav-h-active': isActive('/transport') }">Transport</RouterLink>
        <RouterLink to="/maps"      class="nav-h" :class="{ 'nav-h-active': isActive('/maps') }">Cartes</RouterLink>
        <RouterLink to="/agenda"    class="nav-h" :class="{ 'nav-h-active': isActive('/agenda') }">Agenda</RouterLink>
        <RouterLink to="/inventory" class="nav-h" :class="{ 'nav-h-active': isActive('/inventory') }">Inventaire</RouterLink>
        <RouterLink to="/fabricator" class="nav-h" :class="{ 'nav-h-active': isActive('/fabricator') }">Fabricator</RouterLink>
        <RouterLink to="/profils"   class="nav-h" :class="{ 'nav-h-active': isActive('/profils') }">Profil</RouterLink>
        <RouterLink to="/logs"      class="nav-h" :class="{ 'nav-h-active': isActive('/logs') }">Logs</RouterLink>
        <RouterLink to="/settings"  class="nav-h ml-auto" :class="{ 'nav-h-active': isActive('/settings') }">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </RouterLink>
      </nav>

      <!-- ══════════════════════════════════════════════
           CORPS : sidebar + main
      ══════════════════════════════════════════════ -->
      <div
        class="min-h-0 flex-1 overflow-y-auto scrollbar-none"
        :class="{
          'grid grid-cols-[260px_1fr]': navPosition === 'left',
          'grid grid-cols-[1fr_260px]': navPosition === 'right',
        }"
      >
        <!-- Sidebar gauche -->
        <aside v-if="navPosition === 'left'" class="border-r border-accent/20 p-4 flex flex-col overflow-y-auto bg-[var(--bg-surface)]">
          <p class="mb-4 text-sm font-semibold text-th-secondary">Navigation</p>
          <nav class="space-y-1 text-sm flex-1">
            <RouterLink to="/"          class="nav-v" :class="{ 'nav-v-active': isActive('/') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>Dashboard</RouterLink>
            <RouterLink to="/transport" class="nav-v" :class="{ 'nav-v-active': isActive('/transport') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/></svg>Transport</RouterLink>
            <RouterLink to="/maps"      class="nav-v" :class="{ 'nav-v-active': isActive('/maps') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/></svg>Cartes</RouterLink>
            <RouterLink to="/agenda"    class="nav-v" :class="{ 'nav-v-active': isActive('/agenda') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>Agenda</RouterLink>
            <RouterLink to="/inventory" class="nav-v" :class="{ 'nav-v-active': isActive('/inventory') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8L5 5h14l2 3H3M5 8v13h14V8M5 14h14M12 8v13"/></svg>Inventaire</RouterLink>
            <RouterLink to="/fabricator" class="nav-v" :class="{ 'nav-v-active': isActive('/fabricator') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>Fabricator</RouterLink>
            <RouterLink to="/profils"   class="nav-v" :class="{ 'nav-v-active': isActive('/profils') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>Profil</RouterLink>
            <RouterLink to="/logs"      class="nav-v" :class="{ 'nav-v-active': isActive('/logs') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>Logs</RouterLink>
            <div class="pt-2 mt-2 border-t border-th-subtle">
              <RouterLink to="/settings" class="nav-v" :class="{ 'nav-v-active': isActive('/settings') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Paramètres</RouterLink>
            </div>
          </nav>
        </aside>

        <!-- Contenu page -->
        <main class="h-full min-h-0 overflow-hidden p-6">
          <RouterView v-slot="{ Component }">
            <Transition :name="transitionName" mode="out-in">
              <component :is="Component" :key="route.path" />
            </Transition>
          </RouterView>
        </main>

        <!-- Sidebar droite -->
        <aside v-if="navPosition === 'right'" class="border-l border-accent/20 p-4 flex flex-col overflow-y-auto bg-[var(--bg-surface)]">
          <p class="mb-4 text-sm font-semibold text-th-secondary">Navigation</p>
          <nav class="space-y-1 text-sm flex-1">
            <RouterLink to="/"          class="nav-v" :class="{ 'nav-v-active': isActive('/') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>Dashboard</RouterLink>
            <RouterLink to="/transport" class="nav-v" :class="{ 'nav-v-active': isActive('/transport') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/></svg>Transport</RouterLink>
            <RouterLink to="/maps"      class="nav-v" :class="{ 'nav-v-active': isActive('/maps') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/></svg>Cartes</RouterLink>
            <RouterLink to="/agenda"    class="nav-v" :class="{ 'nav-v-active': isActive('/agenda') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>Agenda</RouterLink>
            <RouterLink to="/inventory" class="nav-v" :class="{ 'nav-v-active': isActive('/inventory') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8L5 5h14l2 3H3M5 8v13h14V8M5 14h14M12 8v13"/></svg>Inventaire</RouterLink>
            <RouterLink to="/fabricator" class="nav-v" :class="{ 'nav-v-active': isActive('/fabricator') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>Fabricator</RouterLink>
            <RouterLink to="/profils"   class="nav-v" :class="{ 'nav-v-active': isActive('/profils') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>Profil</RouterLink>
            <RouterLink to="/logs"      class="nav-v" :class="{ 'nav-v-active': isActive('/logs') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>Logs</RouterLink>
            <div class="pt-2 mt-2 border-t border-th-subtle">
              <RouterLink to="/settings" class="nav-v" :class="{ 'nav-v-active': isActive('/settings') }"><svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Paramètres</RouterLink>
            </div>
          </nav>
        </aside>
      </div>

      <StatusBar />
    </div>
  </div>
</template>

<style scoped>
/* ── Scrollbar cachée ──────────────────────────────────────────────── */
.scrollbar-none {
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}

/* ── Nav verticale ─────────────────────────────────────────────────── */
.nav-v {
  @apply flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-th-secondary
         hover:text-accent2 hover:bg-accent2/[0.06] transition-colors;
}
.nav-v-active {
  @apply border-accent/30 bg-accent/10 text-th-bright;
}

/* ── Nav horizontale ───────────────────────────────────────────────── */
.nav-h {
  @apply flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-th-secondary
         hover:text-accent2 hover:bg-accent2/[0.06] border border-transparent transition-colors whitespace-nowrap;
}
.nav-h-active {
  @apply border-accent/30 bg-accent/10 text-th-bright;
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
