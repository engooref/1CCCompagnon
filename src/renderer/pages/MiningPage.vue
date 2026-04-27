<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useMiningStore } from '../stores/mining'
import MiningRefineryTab from '../components/mining/MiningRefineryTab.vue'
import MiningSessionTab from '../components/mining/MiningSessionTab.vue'
import MiningWhereTab from '../components/mining/MiningWhereTab.vue'
import MiningLoadoutTab from '../components/mining/MiningLoadoutTab.vue'
import { useNow } from '../composables/useNow'

const mining = useMiningStore()
type MiningTab = 'refinery' | 'session' | 'where' | 'loadout'
const activeTab = ref<MiningTab>('refinery')

watch(activeTab, (tab) => {
  if (tab === 'session' && !mining.sessionList.length) mining.loadSessionList()
})

const { now } = useNow(1000)

onMounted(async () => {
  await mining.init()
  await mining.loadWorkOrders()
  await mining.loadSessionList()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-1.5 p-1 rounded-2xl bg-black/30 border border-white/[0.06]">
      <button
        v-for="tab in ([
          { id: 'refinery', icon: '🏭', label: 'Raffinerie' },
          { id: 'session',  icon: '⛏️', label: 'Session' },
          { id: 'where',    icon: '🗺️', label: 'Où Miner' },
          { id: 'loadout',  icon: '🛸', label: 'Loadout' },
        ] as const)"
        :key="tab.id"
        class="relative flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-medium tracking-wide transition-all duration-150"
        :class="activeTab === tab.id
          ? 'bg-[#0d1f35] border border-accent/30 text-accent shadow-[0_0_12px_rgba(var(--accent-rgb),0.12)]'
          : 'border border-transparent text-th-muted hover:text-th-primary hover:bg-white/[0.04]'"
        @click="activeTab = tab.id"
      >
        <span class="text-[13px] leading-none">{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
        <span
          v-if="activeTab === tab.id"
          class="absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        ></span>
      </button>
    </div>

    <MiningRefineryTab v-if="activeTab === 'refinery'" />
    <MiningSessionTab v-else-if="activeTab === 'session'" />
    <MiningWhereTab v-else-if="activeTab === 'where'" />
    <MiningLoadoutTab v-else-if="activeTab === 'loadout'" />
  </div>
</template>
