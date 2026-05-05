<script setup lang="ts">
interface Participant {
  userId: string
  userLabel: string
  role: string
  status: string
  isReady: boolean
  isMining: boolean
}

const props = defineProps<{
  participants: Participant[]
}>()

function roleLabel(role: string): string {
  switch ((role ?? '').toLowerCase()) {
    case 'captain': return 'Capitaine'
    case 'subcaptain':
    case 'sub-captain': return 'Sous-capt.'
    default: return 'Équipage'
  }
}

function statusLabel(isReady: boolean, isMining: boolean): string {
  if (isMining) return 'Minage'
  if (isReady) return 'Prêt'
  return 'Stand-by'
}

function statusClass(isReady: boolean, isMining: boolean): string {
  if (isMining) return 'border-accent/30 bg-accent/10 text-accent/90'
  if (isReady) return 'border-emerald-400/25 bg-emerald-950/40 text-emerald-300/80'
  return 'border-white/[0.08] bg-th-card/40 text-th-disabled'
}
</script>

<template>
  <div v-if="props.participants.length" class="flex h-full min-h-0 flex-col gap-1.5 overflow-y-auto pr-1 session-scrollbar">
    <div
      v-for="p in props.participants"
      :key="p.userId"
      class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <p class="truncate text-[11px] font-bold text-th-primary">{{ p.userLabel }}</p>
          <p class="mt-0.5 text-[9px] uppercase tracking-widest text-th-muted">{{ roleLabel(p.role) }}</p>
        </div>
        <span
          class="shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          :class="statusClass(p.isReady, p.isMining)"
        >
          {{ statusLabel(p.isReady, p.isMining) }}
        </span>
      </div>
    </div>
  </div>

  <div v-else class="rounded-md border border-white/[0.08] bg-th-card/40 px-2 py-1.5 text-[10px] uppercase tracking-widest text-th-disabled">
    Aucun participant
  </div>
</template>

<style scoped>
.session-scrollbar::-webkit-scrollbar { width: 3px; }
.session-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.25); border-radius: 999px; }
.session-scrollbar::-webkit-scrollbar-track { background: transparent; }
</style>
