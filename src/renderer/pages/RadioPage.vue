<script setup lang="ts">
import { onMounted, onUnmounted, watch, computed } from 'vue'
import { useRadioStore } from '../stores/radio'
import { useAppStore } from '../stores/app'
import { usePushToTalk } from '../composables/usePushToTalk'
import { useMercure } from '../composables/useMercure'
import { createOverlayUrls } from '../config/api'
import RadioPanel from '../components/radio/RadioPanel.vue'
import RadioControls from '../components/radio/RadioControls.vue'

const radio = useRadioStore()
const app = useAppStore()
const { connect: connectMercure, disconnect: disconnectMercure } = useMercure()
const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

// Fallback clavier local (en plus du PTT natif uIOhook)
usePushToTalk()

async function initRadioPage() {
  if (!app.status.authReady || !app.bearerToken || !urls.value?.radio?.mercureInfo) return

  await radio.init()

  // S'assurer que la liste des participants est à jour après le chargement des canaux
  try {
    await radio.fetchAllParticipants(true)
  } catch (e) {
    console.debug('[RadioPage] fetchAllParticipants failed', e)
  }

  // Mercure radio:
  // - si event ciblé (channelId), rafraîchir uniquement ce canal
  // - sinon, fallback sur tous les participants
  await connectMercure(
    urls.value.radio.mercureInfo,
    `Bearer ${app.bearerToken}`,
    async (payload) => {
      await radio.refreshParticipantsFromMercureEvent(payload)
    },
  )
}

onMounted(async () => {
  await initRadioPage()
})

watch(() => app.status.authReady, async (ready) => {
  if (!ready) return
  await initRadioPage()
})

onUnmounted(() => {
  disconnectMercure()
})

// Relay de l'état radio vers l'overlay (via IPC main → overlay window)
watch(
  () => ({
    connected:      radio.connected,
    connecting:     radio.connecting,
    currentChannel: radio.currentChannel,
    currentChannelName: radio.currentChannelName,
    participantCount: radio.currentChannel ? radio.participantsFor(radio.currentChannel).length : 0,
    transmitting:   radio.transmitting,
    muted:          radio.muted,
    mutedIncoming:  radio.mutedIncoming,
    activeSpeakers: [...radio.activeSpeakers],
  }),
  (state) => {
    try { window.oneCC.radioRelayState?.(state) } catch { /* noop */ }
  },
  { deep: true }
)
</script>

<template>
  <section class="h-full flex flex-col gap-4 min-h-0">

    <!-- En-tête -->
    <div class="shrink-0 flex items-start justify-between gap-4">
      <div>
        <h2 class="text-base font-bold text-th-primary">Radio</h2>
        <p class="text-xs text-th-muted mt-0.5">Communications vocales</p>
      </div>

      <!-- Badge statut connexion -->
      <div class="flex items-center gap-2 shrink-0 mt-0.5">
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :class="radio.connected
            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
            : radio.connecting
              ? 'bg-amber-400 animate-pulse'
              : 'bg-rose-400'"
        />
        <span
          class="text-xs font-semibold"
          :class="radio.connected ? 'text-emerald-300' : radio.connecting ? 'text-amber-300' : 'text-th-muted'"
        >
          {{ radio.connected
              ? `${radio.connectedChannels.length} canal${radio.connectedChannels.length > 1 ? 'x' : ''}`
              : radio.connecting
                ? 'Connexion…'
                : 'Déconnecté' }}
        </span>
      </div>
    </div>

    <!-- Bannière erreur -->
    <Transition name="banner">
      <div
        v-if="radio.error"
        class="shrink-0 flex items-center gap-2.5 rounded-lg border border-rose-400/30 bg-rose-400/[0.08] px-4 py-2.5 text-xs text-rose-300"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        {{ radio.error }}
      </div>
    </Transition>

    <!-- Corps principal : 2 colonnes -->
    <div class="flex-1 min-h-0 grid gap-4" style="grid-template-columns: 1fr 272px;">

      <!-- Gauche : liste des canaux -->
      <div class="min-h-0 overflow-y-auto scrollbar-none pr-1">
        <RadioPanel />
      </div>

      <!-- Droite : contrôles + participants -->
      <div class="flex flex-col gap-4 min-h-0 overflow-y-auto scrollbar-none pb-1">
        <RadioControls />
      </div>

    </div>

  </section>
</template>

<style scoped>
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

.banner-enter-active, .banner-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
