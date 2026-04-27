<script setup lang="ts">
import { useModeStore } from '../../stores/mode'

const modeStore = useModeStore()

async function selectMode(modeId: string) {
  if (modeId === modeStore.activeModeId) return
  await modeStore.switchMode(modeId)
}
</script>

<template>
  <div class="space-y-1.5">
    <!-- Modes intégrés -->
    <div class="flex items-center gap-2 overflow-x-auto pb-1">
      <span class="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-sky-300/65 w-24">Par defaut</span>
      <button
        v-for="mode in modeStore.builtInModes"
        :key="mode.id"
        class="inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors"
        :class="mode.id === modeStore.activeModeId
          ? 'border-amber-400/60 bg-amber-400/20 text-amber-100'
          : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'"
        @click="selectMode(mode.id)"
      >
        {{ mode.label }}
      </button>
    </div>

    <!-- Modes personnalisés (uniquement si au moins un existe) -->
    <div v-if="modeStore.customModes.length" class="flex items-center gap-2 overflow-x-auto pb-1">
      <span class="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-violet-300/65 w-24">Personnalises</span>
      <button
        v-for="mode in modeStore.customModes"
        :key="mode.id"
        class="inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors"
        :class="mode.id === modeStore.activeModeId
          ? 'border-amber-400/60 bg-amber-400/20 text-amber-100'
          : 'border-violet-400/20 bg-violet-500/5 text-violet-300/70 hover:bg-violet-500/15 hover:text-violet-200'"
        @click="selectMode(mode.id)"
      >
        {{ mode.label }}
      </button>
    </div>
  </div>
</template>
