<script setup lang="ts">
import { computed, ref, nextTick, onMounted } from 'vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()
const busy = ref(false)
const version = ref<string | null>(null)
const showUpdates = ref(false)
const checkingUpdate = ref(false)
const updateInfo = ref<any>(null)
const autoUpdateEnabled = ref(false)
const selectedAssetUrl = ref<string | null>(null)

// ── Login popover ─────────────────────────────────────────────────────────────
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

function closeUpdates() { showUpdates.value = false; updateInfo.value = null }

async function openUpdates() {
  checkingUpdate.value = true
  showUpdates.value = true
  try {
    const v = await (window as any).oneCC.getAppVersion()
    version.value = v
    const res = await (window as any).oneCC.checkForUpdates()
    updateInfo.value = res
    // If manifest contains assets array, try to pick a platform asset
    if (!updateInfo.value.url && Array.isArray(res?.assets) && res.assets.length) {
      const ua = navigator.userAgent || ''
      const isWin = /windows|win32/i.test(ua)
      const isMac = /macintosh|mac os x/i.test(ua)
      const isLinux = /linux/i.test(ua)
      function pick(list: string[]) {
        const l = list.map(String)
        if (isWin) {
          return l.find(u => /\.exe$|nsis|win/i.test(u)) || l[0]
        }
        if (isMac) {
          return l.find(u => /\.dmg$|mac|darwin/i.test(u)) || l[0]
        }
        if (isLinux) {
          return l.find(u => /\.AppImage$|linux|AppImage/i.test(u)) || l[0]
        }
        return l[0]
      }
      selectedAssetUrl.value = pick(res.assets)
      if (selectedAssetUrl.value) updateInfo.value.url = selectedAssetUrl.value
    }
  } catch (e: any) {
    updateInfo.value = { available: false }
  } finally {
    checkingUpdate.value = false
  }
}

async function doInstall() {
  if (!updateInfo.value?.url) return
  // Prefer native installer if available
  try {
    // fallback: open external URL
    await (window as any).oneCC.installUpdate(updateInfo.value.url)
  } catch {
    // noop
  }
}

function onUpdateAvailable(payload: any) {
  updateInfo.value = payload
  showUpdates.value = true
}

onMounted(async () => {
  try {
    version.value = await (window as any).oneCC.getAppVersion()
  } catch {}
  ;(window as any).oneCC.onUpdateAvailable(onUpdateAvailable)
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

// ── Status display ────────────────────────────────────────────────────────────
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
</script>

<template>
  <footer class="relative shrink-0 border-t border-cyan-400/20 px-5 py-2 flex items-center gap-3">

    <!-- ── Popover connexion ───────────────────────────────────────────────── -->
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

    <!-- ── Statut ─────────────────────────────────────────────────────────── -->
    <span class="h-2 w-2 rounded-full shrink-0" :class="dotClass"/>
    <span class="text-xs font-semibold" :class="statusColor">{{ statusText }}</span>

    <template v-if="app.profile">
      <span class="text-slate-700">·</span>
      <img v-if="app.avatarUrl" :src="app.avatarUrl" class="h-5 w-5 rounded-full border border-cyan-400/25 object-cover"/>
      <span class="text-xs text-slate-400 truncate">{{ app.profileLabel }}</span>
    </template>

    <div class="ml-auto flex items-center gap-2">
      <span v-if="app.status.latencyMs" class="text-[11px] text-slate-600">{{ app.status.latencyMs }} ms</span>
      
      <!-- Version / Updates -->
      <div class="relative">
        <button @click="openUpdates" class="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200 transition">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3"/></svg>
          <span class="text-[11px] text-slate-400">{{ version ?? '—' }}</span>
        </button>

        <Transition name="slide-up">
          <div v-if="showUpdates" class="absolute bottom-full right-0 mb-2 w-80 rounded-xl border border-cyan-400/20 bg-[#0a1120] shadow-2xl shadow-black/60 p-4 space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Mises à jour</p>
              <button @click="closeUpdates" class="text-slate-600 hover:text-slate-300 transition">✕</button>
            </div>
            <div class="text-sm text-slate-300">
              <p>Version actuelle : <span class="font-mono text-slate-400">{{ version ?? '?' }}</span></p>
              <div v-if="checkingUpdate" class="mt-2 text-slate-500">Vérification…</div>
              <div v-else-if="updateInfo && updateInfo.available" class="mt-2">
                <p class="font-semibold text-emerald-300">Nouvelle version disponible : {{ updateInfo.latest }}</p>
                <p class="text-[12px] text-slate-400 mt-1 truncate">{{ updateInfo.notes }}</p>
                <div class="mt-3 flex gap-2">
                  <button @click="doInstall" class="flex-1 rounded bg-emerald-500 px-3 py-1 text-xs font-semibold">Installer</button>
                  <button @click="openUpdates" class="rounded border px-3 py-1 text-xs">Plus d'infos</button>
                </div>
              </div>
              <div v-else class="mt-2 text-slate-500">Aucune mise à jour trouvée.</div>
            </div>
          </div>
        </Transition>
      </div>

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
        class="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:border-rose-400/40 hover:text-rose-300 transition disabled:opacity-50"
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
</style>
