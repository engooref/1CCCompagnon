<script setup lang="ts">
import { computed } from 'vue'
import { useRadioStore } from '../../stores/radio'

const radio = useRadioStore()

const speakerIds = computed(() => new Set(radio.activeSpeakers.map(s => s.identity)))

function speakerLevel(identity: string): number {
  return radio.activeSpeakers.find(s => s.identity === identity)?.audioLevel ?? 0
}

/** Tous les canaux avec leurs participants (connectés + non connectés) */
const allChannels = computed(() =>
  radio.channels.map(ch => ({
    id: ch.id,
    name: ch.name,
    connected: radio.channelState[ch.id]?.connected ?? false,
    whisperOnly: radio.channelState[ch.id]?.whisperOnly ?? false,
    participants: radio.participantsFor(ch.id),
  })).filter(ch => ch.connected || ch.participants.length > 0)
)

const totalParticipants = computed(() => {
  const all = new Set<string>()
  for (const ch of allChannels.value) {
    for (const p of ch.participants) all.add(p)
  }
  return all.size
})
</script>

<template>
  <div class="rounded-lg border border-th-subtle bg-black/20 p-4 flex-1 min-h-0 flex flex-col">

    <div class="flex items-center justify-between mb-3 shrink-0">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted">Participants</p>
      <span
        v-if="allChannels.length"
        class="tabular-nums text-[10px] px-1.5 py-0.5 rounded-full border"
        :class="totalParticipants
          ? 'text-th-secondary border-th-subtle'
          : 'text-th-muted border-th-subtle/50'"
      >
        {{ totalParticipants }}
      </span>
    </div>

    <!-- Canaux avec participants -->
    <div v-if="allChannels.length" class="flex-1 overflow-y-auto scrollbar-none space-y-3">

      <div v-for="ch in allChannels" :key="ch.id" class="space-y-1">

        <!-- Sous-titre canal + badge statut -->
        <div class="flex items-center gap-1.5">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-accent/70">{{ ch.name }}</p>
          <span
            v-if="ch.connected && !ch.whisperOnly"
            class="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"
            title="Connecté"
          />
          <span
            v-else-if="!ch.connected"
            class="text-[9px] text-th-muted/60 italic"
          >hors ligne</span>
        </div>

        <div
          v-for="p in ch.participants"
          :key="p"
          class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors"
          :class="speakerIds.has(p)
            ? 'bg-emerald-400/[0.08] text-emerald-300'
            : 'text-th-secondary'"
        >
          <span
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 select-none"
            :class="speakerIds.has(p)
              ? 'bg-emerald-400/20 text-emerald-300'
              : 'bg-white/5 text-th-muted'"
          >
            {{ p.charAt(0).toUpperCase() }}
          </span>

          <span class="flex-1 truncate">{{ p }}</span>

          <span v-if="speakerIds.has(p)" class="flex items-end gap-px h-3 shrink-0">
            <span class="w-0.5 rounded-sm bg-emerald-400" :style="{ height: `${40 + speakerLevel(p) * 60}%`, animation: 'eq-bar 0.5s ease infinite' }" />
            <span class="w-0.5 rounded-sm bg-emerald-400" :style="{ height: `${60 + speakerLevel(p) * 40}%`, animation: 'eq-bar 0.5s ease 0.1s infinite' }" />
            <span class="w-0.5 rounded-sm bg-emerald-400" :style="{ height: `${40 + speakerLevel(p) * 60}%`, animation: 'eq-bar 0.5s ease 0.2s infinite' }" />
          </span>
        </div>

      </div>

    </div>

    <!-- Aucun participant nulle part -->
    <div v-else class="flex-1 flex items-center justify-center">
      <p class="text-center text-[11px] text-th-muted">Aucun participant actif</p>
    </div>

  </div>
</template>

<style scoped>
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

@keyframes eq-bar {
  0%, 100% { transform: scaleY(0.5); }
  50%       { transform: scaleY(1.3); }
}
</style>
