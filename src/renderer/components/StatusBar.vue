<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { changelog } from '../data/changelog'

const app = useAppStore()
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

const changeTypeLabel: Record<string, string> = {
  feature:     'Nouveau',
  fix:         'Correctif',
  improvement: 'Amélioration',
  breaking:    'Rupture',
}
const changeTypeClass: Record<string, string> = {
  feature:     'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
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
      class="shrink-0 border-t border-cyan-400/15 bg-slate-900/60 px-5 py-2 flex items-center gap-2"
    >
      <svg v-if="nativeChecking" class="w-3 h-3 animate-spin text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <svg v-else class="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      <span class="text-[11px]" :class="nativeChecking ? 'text-cyan-300' : 'text-emerald-300'">
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
        <div class="h-1.5 w-full rounded-full bg-slate-700">
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
        <button @click="showUpdateBanner = false" class="text-slate-500 hover:text-slate-300 transition text-lg leading-none">✕</button>
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
        <button @click="postponeUpdate" class="rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300 hover:text-slate-100 transition">Plus tard</button>
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
      <div class="w-[520px] max-h-[80vh] flex flex-col rounded-2xl border border-cyan-400/20 bg-[#070b12] shadow-2xl shadow-black/80">

        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-cyan-400/15">
          <div>
            <h2 class="text-sm font-bold tracking-widest text-slate-100 uppercase">Notes de version</h2>
            <p class="text-[11px] text-slate-500 mt-0.5">1CC Compagnon · v{{ version ?? '—' }}</p>
          </div>
          <button @click="showChangelog = false" class="text-slate-600 hover:text-slate-300 transition">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
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
                :class="entry.version === version ? 'text-cyan-300' : 'text-slate-400'"
              >v{{ entry.version }}</span>
              <span
                v-if="entry.version === version"
                class="rounded-full bg-cyan-400/15 border border-cyan-400/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-300"
              >version actuelle</span>
              <span class="text-[11px] text-slate-600 ml-auto">{{ entry.date }}</span>
            </div>
            <ul class="space-y-1.5">
              <li v-for="(change, i) in entry.changes" :key="i" class="flex items-start gap-2">
                <span
                  class="mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="changeTypeClass[change.type]"
                >{{ changeTypeLabel[change.type] }}</span>
                <span class="text-xs text-slate-300 leading-relaxed">{{ change.text }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </Transition>

  <footer class="relative shrink-0 border-t border-cyan-400/20 px-5 py-2 flex items-center gap-3">

    <!-- ── Popover connexion ─────────────────────────────────────────────── -->
    <Transition name="slide-up">
      <div
        v-if="showPanel"
        class="absolute bottom-full right-4 mb-2 w-72 rounded-xl border border-cyan-400/20 bg-[#0a1120] shadow-2xl shadow-black/60 p-4 space-y-3"
      >
        <div class="flex items-center justify-between">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Connexion</p>
          <button @click="closePanel" class="text-slate-600 hover:text-slate-300 transition">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="space-y-1.5">
          <label class="text-[11px] text-slate-500">Clé API</label>
          <input
            ref="inputRef"
            v-model="apiKeyInput"
            type="password"
            placeholder="Coller la clé API…"
            @keydown.enter="submitLogin"
            @keydown.escape="closePanel"
            class="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none transition"
          />
          <p v-if="loginError" class="text-[11px] text-rose-400">{{ loginError }}</p>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            @click="submitLogin"
            :disabled="busy"
            class="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/20 transition disabled:opacity-50"
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
          <button @click="closePanel" class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition">
            Annuler
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── Statut ──────────────────────────────────────────────────────────── -->
    <span class="h-2 w-2 rounded-full shrink-0" :class="dotClass"/>
    <span class="text-xs font-semibold" :class="statusColor">{{ statusText }}</span>

    <template v-if="app.profile">
      <span class="text-slate-700">·</span>
      <img v-if="app.avatarUrl" :src="app.avatarUrl" class="h-5 w-5 rounded-full border border-cyan-400/25 object-cover"/>
      <span class="text-xs text-slate-400 truncate">{{ app.profileLabel }}</span>
    </template>

    <div class="ml-auto flex items-center gap-2">
      <span v-if="app.status.latencyMs" class="text-[11px] text-slate-500">{{ app.status.latencyMs }} ms</span>

      <!-- Bouton version → ouvre la modal changelog -->
      <button
        @click="showChangelog = true"
        class="relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition"
        :class="hasUpdateBadge
          ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
          : 'border-slate-600 bg-slate-800/80 text-slate-200 hover:border-cyan-400/30 hover:text-cyan-200'"
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
        class="flex items-center gap-1.5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-400/20 transition"
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
        class="flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/80 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:border-rose-400/40 hover:text-rose-300 transition disabled:opacity-50"
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
