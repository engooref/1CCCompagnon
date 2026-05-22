<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../stores/app'
import { changelog } from '../data/changelog'
import { getHelpTopicForPath, helpFallback } from '../data/helpAssistant'

const app = useAppStore()
const route = useRoute()
const router = useRouter()
const busy = ref(false)
const version = ref<string | null>(null)

// ── Native updater state ────────────────────────────────────────────────────
const nativeUpdateAvailable = ref<any>(null)
const nativeChecking = ref(false)
const nativeNoUpdate = ref(false)
const nativeDownloading = ref(false)
const nativeDownloadProgress = ref(0)
const nativeDownloaded = ref(false)
const showUpdateBanner = ref(false)
const updatePostponed = ref(false)

// ── Changelog modal ─────────────────────────────────────────────────────────
const showChangelog = ref(false)
const showHelp = ref(false)

// ── Login popover ───────────────────────────────────────────────────────────
const showPanel  = ref(false)
const apiKeyInput = ref('')
const loginError  = ref<string | null>(null)
const inputRef    = ref<HTMLInputElement | null>(null)

async function openPanel() {
  loginError.value = null
  try {
    apiKeyInput.value = (await window.oneCC.getApiKey()) ?? ''
  } catch {
    apiKeyInput.value = ''
  }
  showPanel.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function closePanel() {
  showPanel.value = false
  loginError.value = null
}

// ── Native updater actions ──────────────────────────────────────────────────
async function acceptUpdate() {
  showUpdateBanner.value = false
  nativeDownloading.value = true
  nativeDownloadProgress.value = 0
  try {
    await (window as any).oneCC.nativeDownloadUpdate()
  } catch {
    nativeDownloading.value = false
  }
}

function postponeUpdate() {
  showUpdateBanner.value = false
  updatePostponed.value = true
}

async function installNow() {
  try {
    await (window as any).oneCC.nativeInstallUpdate()
  } catch {}
}

async function checkUpdatesManually() {
  try {
    await (window as any).oneCC.nativeCheckForUpdates()
  } catch {}
}

function handleNativeUpdateEvent(event: any) {
  const { type, info, progress } = event
  if (type === 'checking') {
    nativeChecking.value = true
    nativeNoUpdate.value = false
  } else if (type === 'update-available') {
    nativeChecking.value = false
    nativeNoUpdate.value = false
    nativeUpdateAvailable.value = info
    showUpdateBanner.value = true
    updatePostponed.value = false
    nativeDownloaded.value = false
    nativeDownloading.value = false
  } else if (type === 'update-not-available') {
    nativeChecking.value = false
    nativeNoUpdate.value = true
    setTimeout(() => { nativeNoUpdate.value = false }, 4000)
  } else if (type === 'error') {
    nativeChecking.value = false
  } else if (type === 'progress') {
    nativeDownloading.value = true
    nativeDownloadProgress.value = Math.round(progress?.percent ?? 0)
  } else if (type === 'downloaded') {
    nativeDownloading.value = false
    nativeDownloaded.value = true
    showUpdateBanner.value = true
    updatePostponed.value = false
  }
}

onMounted(async () => {
  try {
    version.value = await (window as any).oneCC.getAppVersion()
  } catch {}
  ;(window as any).oneCC.onUpdateAvailable((payload: any) => {
    nativeUpdateAvailable.value = payload
    showUpdateBanner.value = true
  })
  ;(window as any).oneCC.onNativeAutoUpdateEvent(handleNativeUpdateEvent)
})

async function submitLogin() {
  const key = apiKeyInput.value.trim()
  if (!key) { loginError.value = 'Clé API requise'; return }
  busy.value = true
  loginError.value = null
  try {
    await app.saveApiKey(key)
    closePanel()
  } catch (e: any) {
    loginError.value = e?.message ?? 'Échec de la connexion'
  } finally {
    busy.value = false
  }
}

async function disconnect() {
  busy.value = true
  try { await app.clearApiKey() } finally { busy.value = false }
}

// ── Status display ─────────────────────────────────────────────────────────
const dotClass = computed(() => {
  if (app.status.connected) return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]'
  if (app.status.level === 'loading') return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)] animate-pulse'
  return 'bg-rose-400'
})

const statusText = computed(() => {
  if (app.status.connected) return 'Connecté'
  if (app.status.level === 'loading') return 'Connexion…'
  return 'Déconnecté'
})

const statusColor = computed(() => {
  if (app.status.connected) return 'text-emerald-300'
  if (app.status.level === 'loading') return 'text-amber-300'
  return 'text-rose-300'
})

const hasUpdateBadge = computed(() =>
  (nativeUpdateAvailable.value || nativeDownloaded.value) && !showUpdateBanner.value
)

const helpTopic = computed(() => getHelpTopicForPath(route.path))

const contextualFacts = computed(() => {
  const facts: string[] = []
  if (app.status.level === 'loading') {
    facts.push('Connexion en cours: certaines donnees peuvent etre incompletes.')
  }
  if (!app.status.authReady) {
    facts.push('Session non authentifiee: connecte-toi pour charger les donnees metier.')
  } else {
    facts.push(`Session active: ${app.profileLabel}`)
  }
  if (typeof app.status.latencyMs === 'number') {
    facts.push(`Latence API actuelle: ${app.status.latencyMs} ms`)
  }
  if (route.path.startsWith('/transport')) {
    if (app.transportsLoading) facts.push('Transport: chargement des ordres en cours...')
    else facts.push(`Transport: ${app.transports.length} ordre(s) disponible(s).`)
  }
  if (route.path.startsWith('/agenda') && app.status.authReady) {
    if (!app.agendaLoaded) facts.push('Agenda: chargement des evenements en cours...')
    else facts.push(`Agenda: ${app.agendaEvents.length} evenement(s) charge(s).`)
  }
  if (route.path.startsWith('/overlay')) {
    facts.push(app.overlayVisible ? 'Overlay actuellement visible.' : 'Overlay actuellement masque.')
  }
  return facts
})

const helpActions = computed(() => helpTopic.value.actions ?? helpFallback.actions ?? [])

function runHelpAction(path: string) {
  showHelp.value = false
  if (route.path === path) return
  void router.push(path)
}

const changeTypeLabel: Record<string, string> = {
  feature:     'Nouveau',
  fix:         'Correctif',
  improvement: 'Amélioration',
  delete:      'Suppression',
}
const changeTypeClass: Record<string, string> = {
  feature:     'bg-accent/15 text-accent border-accent/30',
  fix:         'bg-rose-400/15 text-rose-300 border-rose-400/30',
  improvement: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  breaking:    'bg-amber-400/15 text-amber-300 border-amber-400/30',
}
</script>

<template>
  <!-- ── Indicateur "recherche de mise à jour" ────────────────────────────── -->
  <Transition name="slide-up">
    <div
      v-if="nativeChecking || nativeNoUpdate"
      class="shrink-0 border-t border-accent/15 bg-th-surface px-5 py-2 flex items-center gap-2"
    >
      <svg v-if="nativeChecking" class="w-3 h-3 animate-spin text-accent shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <svg v-else class="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      <span class="text-[11px]" :class="nativeChecking ? 'text-accent' : 'text-emerald-300'">
        {{ nativeChecking ? 'Recherche de mises à jour…' : 'Application à jour.' }}
      </span>
    </div>
  </Transition>

  <!-- ── Bannière mise à jour ──────────────────────────────────────────────── -->
  <Transition name="slide-up">
    <div
      v-if="showUpdateBanner"
      class="shrink-0 border-t border-amber-400/30 bg-amber-400/10 px-5 py-3"
    >
      <div v-if="nativeDownloading" class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-amber-200">Téléchargement de la mise à jour…</span>
          <span class="text-xs font-mono text-amber-300">{{ nativeDownloadProgress }}%</span>
        </div>
        <div class="h-1.5 w-full rounded-full bg-th-card">
          <div class="h-1.5 rounded-full bg-amber-400 transition-all duration-300" :style="{ width: nativeDownloadProgress + '%' }"/>
        </div>
      </div>

      <div v-else-if="nativeDownloaded" class="flex items-center gap-3">
        <svg class="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        <span class="flex-1 text-xs font-semibold text-emerald-200">
          Mise à jour <span class="font-mono">{{ nativeUpdateAvailable?.version }}</span> prête — l'app redémarrera automatiquement.
        </span>
        <button @click="installNow" class="rounded-md bg-emerald-500 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-400 transition">
          Installer maintenant
        </button>
        <button @click="showUpdateBanner = false" class="text-th-muted hover:text-th-secondary transition text-lg leading-none">✕</button>
      </div>

      <div v-else class="flex items-center gap-3">
        <svg class="w-4 h-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        <span class="flex-1 text-xs font-semibold text-amber-100">
          Nouvelle version disponible :
          <span class="font-mono text-amber-300">{{ nativeUpdateAvailable?.version }}</span>
          — Télécharger maintenant ?
        </span>
        <button @click="acceptUpdate" class="rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-400 transition">Oui</button>
        <button @click="postponeUpdate" class="rounded-md border border-th-subtle bg-th-card px-3 py-1 text-xs font-semibold text-th-secondary hover:text-th-primary transition">Plus tard</button>
      </div>
    </div>
  </Transition>

  <!-- ── Modal Changelog ───────────────────────────────────────────────────── -->
  <Transition name="fade">
    <div
      v-if="showChangelog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showChangelog = false"
    >
      <div class="w-[520px] max-h-[80vh] flex flex-col rounded-2xl border border-accent/20 bg-th-base shadow-2xl shadow-black/80">

        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-accent/15">
          <div>
            <h2 class="text-sm font-bold tracking-widest text-th-primary uppercase">Notes de version</h2>
            <p class="text-[11px] text-th-muted mt-0.5">1CC Compagnon · v{{ version ?? '—' }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="checkUpdatesManually"
              :disabled="nativeChecking"
              class="flex items-center gap-1.5 rounded-md border border-th-subtle bg-th-card px-2.5 py-1 text-[11px] font-semibold text-th-secondary hover:border-accent/30 hover:text-accent transition disabled:opacity-50"
            >
              <svg class="w-3 h-3" :class="nativeChecking ? 'animate-spin' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Vérifier les mises à jour
            </button>
            <button @click="showChangelog = false" class="text-th-muted hover:text-th-secondary transition">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Bandeau mise à jour dispo -->
        <div v-if="nativeUpdateAvailable && !nativeDownloaded" class="mx-4 mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 flex items-center gap-3">
          <svg class="w-4 h-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          <span class="flex-1 text-xs text-amber-100">
            Version <span class="font-mono font-semibold text-amber-300">{{ nativeUpdateAvailable.version }}</span> disponible
          </span>
          <button @click="showChangelog = false; acceptUpdate()" class="rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-400 transition">
            Télécharger
          </button>
        </div>

        <div v-if="nativeDownloaded" class="mx-4 mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 flex items-center gap-3">
          <svg class="w-4 h-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <span class="flex-1 text-xs text-emerald-100">Mise à jour téléchargée, prête à installer.</span>
          <button @click="installNow" class="rounded-md bg-emerald-500 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-400 transition">
            Installer
          </button>
        </div>

        <!-- Liste des versions -->
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <div v-for="entry in changelog" :key="entry.version">
            <div class="flex items-baseline gap-3 mb-3">
              <span
                class="font-mono text-sm font-bold"
                :class="entry.version === version ? 'text-accent' : 'text-th-secondary'"
              >v{{ entry.version }}</span>
              <span
                v-if="entry.version === version"
                class="rounded-full bg-accent/15 border border-accent/30 px-2 py-0.5 text-[10px] font-semibold text-accent"
              >version actuelle</span>
              <span class="text-[11px] text-th-muted ml-auto">{{ entry.date }}</span>
            </div>
            <ul class="space-y-1.5">
              <li v-for="(change, i) in entry.changes" :key="i" class="flex items-start gap-2">
                <span
                  class="mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="changeTypeClass[change.type]"
                >{{ changeTypeLabel[change.type] }}</span>
                <span class="text-xs text-th-secondary leading-relaxed">{{ change.text }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <!-- ── Modal Assistant ───────────────────────────────────────────────────── -->
  <Transition name="fade">
    <div
      v-if="showHelp"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="showHelp = false"
    >
      <div class="w-[620px] max-h-[84vh] flex flex-col rounded-2xl border border-accent/20 bg-th-base shadow-2xl shadow-black/80">
        <div class="flex items-start justify-between gap-3 px-6 py-4 border-b border-accent/15">
          <div>
            <h2 class="text-sm font-bold tracking-widest text-th-primary uppercase">Assistant</h2>
            <p class="text-xs text-th-secondary mt-1">{{ helpTopic.title }}</p>
            <p class="text-[11px] text-th-muted mt-1">{{ helpTopic.objective }}</p>
          </div>
          <button @click="showHelp = false" class="text-th-muted hover:text-th-secondary transition" aria-label="Fermer l'assistant">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <h3 class="text-[11px] font-bold uppercase tracking-wider text-th-secondary">Ce que tu vois actuellement</h3>
            <ul class="mt-2 space-y-1.5">
              <li v-for="(item, idx) in helpTopic.visibleNow" :key="`visible-${idx}`" class="text-xs text-th-secondary leading-relaxed flex gap-2">
                <span class="mt-[5px] h-1.5 w-1.5 rounded-full bg-accent/60 shrink-0"/>
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 class="text-[11px] font-bold uppercase tracking-wider text-th-secondary">Etat instantane</h3>
            <ul class="mt-2 space-y-1.5">
              <li v-for="(item, idx) in contextualFacts" :key="`ctx-${idx}`" class="text-xs text-th-secondary leading-relaxed flex gap-2">
                <span class="mt-[5px] h-1.5 w-1.5 rounded-full bg-emerald-400/70 shrink-0"/>
                <span>{{ item }}</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 class="text-[11px] font-bold uppercase tracking-wider text-th-secondary">Conseils</h3>
            <ul class="mt-2 space-y-1.5">
              <li v-for="(tip, idx) in helpTopic.tips" :key="`tip-${idx}`" class="text-xs text-th-secondary leading-relaxed flex gap-2">
                <span class="mt-[5px] h-1.5 w-1.5 rounded-full bg-amber-400/70 shrink-0"/>
                <span>{{ tip }}</span>
              </li>
            </ul>
          </div>

          <div v-if="helpTopic.prerequisites?.length">
            <h3 class="text-[11px] font-bold uppercase tracking-wider text-th-secondary">Prerequis</h3>
            <ul class="mt-2 space-y-1.5">
              <li v-for="(item, idx) in helpTopic.prerequisites" :key="`pre-${idx}`" class="text-xs text-th-secondary leading-relaxed">• {{ item }}</li>
            </ul>
          </div>

          <div v-if="helpTopic.limits?.length">
            <h3 class="text-[11px] font-bold uppercase tracking-wider text-th-secondary">Limites</h3>
            <ul class="mt-2 space-y-1.5">
              <li v-for="(item, idx) in helpTopic.limits" :key="`lim-${idx}`" class="text-xs text-th-secondary leading-relaxed">• {{ item }}</li>
            </ul>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-accent/15">
          <p class="text-[11px] font-bold uppercase tracking-wider text-th-secondary mb-2">Actions rapides</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="action in helpActions"
              :key="action.label + action.to"
              @click="runHelpAction(action.to)"
              class="rounded-md border border-th-subtle bg-th-card px-2.5 py-1 text-[11px] font-semibold text-th-secondary hover:border-accent/30 hover:text-accent transition"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <footer class="relative shrink-0 border-t border-accent/20 px-5 py-2 flex items-center gap-3">

    <!-- ── Popover connexion ─────────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div
        v-if="showPanel"
        class="absolute bottom-full right-4 mb-2 w-72 rounded-xl border border-accent/20 bg-th-base shadow-2xl shadow-black/60 p-4 space-y-3"
      >
        <div class="flex items-center justify-between">
          <p class="text-xs font-bold uppercase tracking-wider text-th-secondary">Connexion</p>
          <button @click="closePanel" class="text-th-muted hover:text-th-secondary transition">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="space-y-1.5">
          <label class="text-[11px] text-th-muted">Clé API</label>
          <input
            ref="inputRef"
            v-model="apiKeyInput"
            type="password"
            placeholder="Coller la clé API…"
            @keydown.enter="submitLogin"
            @keydown.escape="closePanel"
            class="w-full rounded-lg border border-th-subtle bg-th-surface px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/50 focus:outline-none transition"
          />
          <p class="text-[11px] text-th-muted leading-relaxed">
            Tu peux recuperer cette cle dans ton profil utilisateur sur le site 1CC.
          </p>
          <p v-if="loginError" class="text-[11px] text-rose-400">{{ loginError }}</p>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            @click="submitLogin"
            :disabled="busy"
            class="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 py-2 text-xs font-semibold text-accent hover:bg-accent/20 transition disabled:opacity-50"
          >
            <svg v-if="busy" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9"/>
            </svg>
            Se connecter
          </button>
          <button @click="closePanel" class="rounded-lg border border-th-subtle bg-th-card px-3 py-2 text-xs font-semibold text-th-secondary hover:text-th-primary transition">
            Annuler
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── Statut ──────────────────────────────────────────────────────────── -->
    <span class="h-2 w-2 rounded-full shrink-0" :class="dotClass"/>
    <span class="text-xs font-semibold" :class="statusColor">{{ statusText }}</span>

    <template v-if="app.profile">
      <span class="text-th-disabled">·</span>
      <img v-if="app.avatarUrl" :src="app.avatarUrl" class="h-5 w-5 rounded-full border border-accent/25 object-cover"/>
      <span class="text-xs text-th-secondary truncate">{{ app.profileLabel }}</span>
    </template>

    <div class="ml-auto flex items-center gap-2">
      <span v-if="app.status.latencyMs" class="text-[11px] text-th-muted">{{ app.status.latencyMs }} ms</span>

      <button
        @click="showHelp = true"
        class="flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/8 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/15 transition"
        title="Ouvrir l'assistant"
        aria-label="Ouvrir l'assistant"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.55-1.165 1.83-2 3.272-2 1.934 0 3.5 1.343 3.5 3 0 1.236-.87 2.298-2.104 2.762-.67.252-1.146.85-1.146 1.567V15M12 18h.01"/>
        </svg>
        Aide
      </button>

      <!-- Bouton version → ouvre la modal changelog -->
      <button
        @click="showChangelog = true"
        class="relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition"
        :class="hasUpdateBadge
          ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
          : 'border-th-subtle bg-th-card text-th-primary hover:border-accent/30 hover:text-accent'"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3"/>
        </svg>
        <span>{{ version ?? '—' }}</span>
        <span v-if="hasUpdateBadge" class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse"/>
      </button>

      <!-- Se connecter -->
      <button
        v-if="!app.status.connected && app.status.level !== 'loading'"
        @click="openPanel"
        class="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20 transition"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9"/>
        </svg>
        Se connecter
      </button>

      <!-- Déconnecter -->
      <button
        v-else-if="app.status.connected"
        @click="disconnect"
        :disabled="busy"
        class="flex items-center gap-1.5 rounded-md border border-th-subtle bg-th-card px-2.5 py-1 text-[11px] font-semibold text-th-primary hover:border-rose-400/40 hover:text-rose-300 transition disabled:opacity-50"
      >
        <svg v-if="busy" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
        </svg>
        Déconnecter
      </button>
    </div>
  </footer>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
