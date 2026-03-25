<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

const isDev = import.meta.env.DEV
const filterLevels: (LogLevel | 'all')[] = isDev
  ? ['all', 'debug', 'info', 'warn', 'error']
  : ['all', 'info', 'warn', 'error']

const entries = ref<LogEntry[]>([])
const filterLevel = ref<LogLevel | 'all'>('all')
const listEl = ref<HTMLElement | null>(null)
let autoScroll = true

const filtered = computed(() => {
  if (filterLevel.value === 'all') return entries.value
  return entries.value.filter(e => e.level === filterLevel.value)
})

function levelClass(level: LogLevel): string {
  if (level === 'error') return 'text-rose-400 bg-rose-400/10 border-rose-400/20'
  if (level === 'warn')  return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
  if (level === 'info')  return 'text-sky-400 bg-sky-400/10 border-sky-400/20'
  return 'text-th-muted bg-white/5 border-white/10'
}

function levelDot(level: LogLevel): string {
  if (level === 'error') return 'bg-rose-400'
  if (level === 'warn')  return 'bg-amber-400'
  if (level === 'info')  return 'bg-sky-400'
  return 'bg-th-muted'
}

async function scrollBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

function onScroll() {
  if (!listEl.value) return
  const { scrollTop, scrollHeight, clientHeight } = listEl.value
  autoScroll = scrollTop + clientHeight >= scrollHeight - 40
}

function clear() {
  entries.value = []
}

onMounted(async () => {
  const initial = await window.oneCC.subscribeLogs() as LogEntry[]
  entries.value = initial
  scrollBottom()

  window.oneCC.onLogEntry((entry: unknown) => {
    entries.value.push(entry as LogEntry)
    if (entries.value.length > 500) entries.value.shift()
    if (autoScroll) scrollBottom()
  })
})

onUnmounted(() => {
  window.oneCC.offLogEntry()
  window.oneCC.unsubscribeLogs()
})
</script>

<template>
  <div class="h-full flex flex-col gap-3 min-h-0">

    <!-- Header -->
    <div class="flex items-center justify-between gap-4 shrink-0">
      <div>
        <h2 class="text-base font-bold tracking-wide text-th-bright">Logs Overlay</h2>
        <p class="text-xs text-th-muted mt-0.5">Journaux temps réel du processus principal</p>
      </div>
      <button
        @click="clear"
        class="flex items-center gap-1.5 rounded-md border border-th-subtle px-3 py-1.5 text-xs font-medium text-th-secondary hover:text-th-primary hover:border-th-muted transition"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        Vider
      </button>
    </div>

    <!-- Filtres -->
    <div class="flex items-center gap-1.5 shrink-0">
      <button
        v-for="lvl in filterLevels"
        :key="lvl"
        @click="filterLevel = lvl"
        class="px-2.5 py-1 rounded-md text-xs font-medium border transition"
        :class="filterLevel === lvl
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-th-subtle text-th-muted hover:text-th-secondary hover:border-th-muted'"
      >
        {{ lvl === 'all' ? 'Tous' : lvl.charAt(0).toUpperCase() + lvl.slice(1) }}
      </button>
      <span class="ml-auto text-xs text-th-muted">{{ filtered.length }} entrées</span>
    </div>

    <!-- Liste -->
    <div
      ref="listEl"
      class="flex-1 min-h-0 overflow-y-auto rounded-lg border border-th-subtle bg-black/30 font-mono text-xs"
      @scroll="onScroll"
    >
      <div v-if="filtered.length === 0" class="flex items-center justify-center h-full text-th-muted">
        Aucun log
      </div>
      <div
        v-for="(entry, i) in filtered"
        :key="i"
        class="flex items-start gap-3 px-3 py-1.5 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
      >
        <!-- Niveau -->
        <span
          class="shrink-0 mt-0.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none"
          :class="levelClass(entry.level)"
        >
          <span class="h-1.5 w-1.5 rounded-full shrink-0" :class="levelDot(entry.level)" />
          {{ entry.level }}
        </span>
        <!-- Timestamp -->
        <span class="shrink-0 text-th-muted leading-5 text-[10px] mt-px whitespace-nowrap">
          {{ entry.timestamp.slice(11, 23) }}
        </span>
        <!-- Message -->
        <span class="flex-1 min-w-0 leading-5 break-all text-th-secondary">{{ entry.message }}</span>
      </div>
    </div>

  </div>
</template>
