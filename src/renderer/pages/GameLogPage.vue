<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useGameLog } from '../composables/useGameLog'

const app = useAppStore()
const { running, state, events, start, stop, activityLabel } = useGameLog()

const gameFolder = computed(() => app.settings?.gameFolder ?? '')

const activityClass = computed(() => {
  switch (state.value?.activity) {
    case 'hangar':  return 'text-amber-300'
    case 'space':   return 'text-accent'
    case 'quantum': return 'text-violet-300'
    default:        return 'text-th-muted'
  }
})

const EVENT_ICONS: Record<string, string> = {
  player:        '👤',
  shard:         '🌐',
  activity:      '🚀',
  quantum_start: '⚡',
  quantum_route: '🗺',
  location:      '📍',
  zone:          '🛡',
}

onMounted(() => {
  if (gameFolder.value) start(gameFolder.value)
})
</script>

<template>
  <section class="h-full flex flex-col gap-4">

    <!-- Header -->
    <div class="shrink-0 flex items-center gap-3">
      <div class="h-7 w-7 shrink-0 rounded-md bg-violet-400/10 border border-violet-400/20 flex items-center justify-center">
        <svg class="w-4 h-4 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
        </svg>
      </div>
      <span class="text-sm font-bold text-th-primary">Journal de jeu</span>

      <div class="ml-auto flex items-center gap-2">
        <span
          v-if="running"
          class="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/>
          EN DIRECT
        </span>

        <button
          v-if="!gameFolder"
          disabled
          class="rounded-md border border-th-subtle bg-th-card px-3 py-1.5 text-xs text-th-muted"
          title="Configurez le dossier du jeu dans Paramètres > Jeu"
        >
          Dossier non configuré
        </button>
        <template v-else>
          <button
            v-if="!running"
            @click="start(gameFolder)"
            class="rounded-md border border-accent/25 bg-accent/8 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition"
          >
            Démarrer
          </button>
          <button
            v-else
            @click="stop"
            class="rounded-md border border-rose-400/25 bg-rose-400/8 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-400/15 transition"
          >
            Arrêter
          </button>
        </template>
      </div>
    </div>

    <!-- No folder configured -->
    <div v-if="!gameFolder" class="rounded-lg border border-dashed border-th-subtle p-6 text-center">
      <p class="text-sm text-th-muted mb-1">Dossier du jeu non configuré</p>
      <p class="text-xs text-th-muted">Allez dans <span class="text-th-secondary">Paramètres → Jeu</span> pour sélectionner le dossier d'installation.</p>
    </div>

    <template v-else>

      <!-- State card -->
      <div class="shrink-0 rounded-lg border border-th-subtle bg-black/20 p-4">
        <p class="text-[10px] font-bold uppercase tracking-wider text-th-muted mb-3">État actuel</p>

        <div v-if="!state || !state.player" class="text-xs text-th-muted italic">
          {{ running ? 'En attente de données…' : 'Parser arrêté' }}
        </div>

        <div v-else class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <div v-if="state.player" class="flex items-center gap-2">
            <span class="text-th-muted w-20 shrink-0">Joueur</span>
            <span class="font-semibold text-accent truncate">{{ state.player }}</span>
          </div>
          <div v-if="state.ship" class="flex items-center gap-2">
            <span class="text-th-muted w-20 shrink-0">Vaisseau</span>
            <span class="font-semibold text-th-primary truncate">{{ state.ship }}</span>
          </div>
          <div v-if="state.location" class="flex items-center gap-2">
            <span class="text-th-muted w-20 shrink-0">Position</span>
            <span class="font-semibold text-th-primary truncate">{{ state.location }}</span>
          </div>
          <div v-if="state.destination" class="flex items-center gap-2">
            <span class="text-th-muted w-20 shrink-0">Destination</span>
            <span class="font-semibold text-violet-300 truncate">{{ state.destination }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-th-muted w-20 shrink-0">Activité</span>
            <span class="font-semibold truncate" :class="activityClass">{{ activityLabel(state.activity) }}</span>
          </div>
          <div v-if="state.zone" class="flex items-center gap-2">
            <span class="text-th-muted w-20 shrink-0">Zone</span>
            <span class="font-semibold text-amber-300 truncate">{{ state.zone }}</span>
          </div>
          <div v-if="state.shard" class="col-span-2 flex items-center gap-2">
            <span class="text-th-muted w-20 shrink-0">Serveur</span>
            <span class="text-th-muted font-mono truncate">{{ state.shard }}</span>
          </div>
        </div>
      </div>

      <!-- Events feed -->
      <div class="flex-1 min-h-0 flex flex-col">
        <p class="shrink-0 text-[10px] font-bold uppercase tracking-wider text-th-muted mb-2">Événements récents</p>
        <div class="flex-1 min-h-0 overflow-y-auto space-y-1">
          <div
            v-if="!events.length"
            class="rounded-lg border border-dashed border-th-subtle p-4 text-center text-xs text-th-muted"
          >
            Aucun événement détecté
          </div>
          <div
            v-for="ev in events"
            :key="ev.id"
            class="flex items-start gap-2.5 rounded-md border border-th-muted bg-black/15 px-3 py-2"
          >
            <span class="shrink-0 text-sm leading-none mt-0.5">{{ EVENT_ICONS[ev.type] ?? '•' }}</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-th-primary">{{ ev.label }}</p>
            </div>
            <time class="shrink-0 text-[10px] text-th-muted font-mono">
              {{ new Date(ev.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
            </time>
          </div>
        </div>
      </div>

    </template>

  </section>
</template>
