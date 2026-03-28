<script setup lang="ts">
import { useRadioStore } from '../../stores/radio'

const radio = useRadioStore()
</script>

<template>
  <div class="space-y-4">

    <!-- PTT par canal -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Touches Push-to-Talk</p>
      <p class="text-xs text-th-muted mb-3">
        Chaque canal radio peut avoir sa propre touche PTT (système murmure).
        Configurez les touches directement depuis l'onglet <strong class="text-th-secondary">Radio</strong>.
      </p>

      <div v-if="radio.settings.pttBindings.length" class="space-y-1.5">
        <div
          v-for="b in radio.settings.pttBindings"
          :key="b.channelId"
          class="flex items-center justify-between gap-2 rounded border border-th-subtle/50 bg-black/20 px-3 py-1.5"
        >
          <span class="text-xs text-th-secondary truncate">
            {{ radio.channels.find(c => c.id === b.channelId)?.name ?? b.channelId }}
          </span>
          <kbd class="inline-flex items-center rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-accent shrink-0">
            {{ b.key }}
          </kbd>
        </div>
      </div>
      <p v-else class="text-xs text-th-muted/60 italic">Aucune touche PTT configurée.</p>
    </div>

    <!-- Volume -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Audio</p>
      <p class="text-xs text-th-muted mb-4">Volume des communications radio entrantes.</p>

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold text-th-secondary">Volume entrant</p>
          <span class="text-xs tabular-nums text-th-secondary">
            {{ Math.round(radio.settings.radioVolume * 100) }}%
          </span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="radio.settings.radioVolume"
          @input="(e) => radio.setVolume(parseFloat((e.target as HTMLInputElement).value))"
          class="w-full h-1.5 rounded-full cursor-pointer appearance-none"
          :style="{
            background: `linear-gradient(to right, rgb(var(--accent-rgb)) ${radio.settings.radioVolume * 100}%, rgb(30,41,59) 0%)`
          }"
        />
      </div>
    </div>

  </div>
</template>
