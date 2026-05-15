<script setup lang="ts">
import { useMiningStore } from '@renderer/stores/mining'
const mining = useMiningStore()
function participantRank(p: any): string {
  if (p?.isCaptain) return 'captain'
  if (p?.isSubCaptain) return 'sub_captain'
  return 'member'
}
</script>

<template>
  <div v-if="mining.leaveConfirm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="mining.leaveConfirm.show = false">
    <div class="w-full max-w-sm rounded-2xl border border-th-subtle bg-[#0d1117] p-6 shadow-2xl text-center space-y-4">
      <div class="text-3xl">👑</div>
      <h3 class="text-sm font-semibold text-th-primary">Transférer le capitanat</h3>
      <p class="text-xs text-th-muted">Vous êtes capitaine. Avant de quitter, choisissez un nouveau capitaine pour votre équipage.</p>
      <div class="text-left space-y-1">
        <label class="block text-xs text-th-muted">Nouveau capitaine</label>
        <select v-model.number="mining.leaveConfirm.selectedCaptainId"
          class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-xs text-th-primary focus:border-accent/40 focus:outline-none">
          <option v-for="c in mining.leaveConfirm.candidates" :key="c.id" :value="c.id">
            {{ c.username }}{{ participantRank(c) === 'sub_captain' ? ' ⚓' : '' }}
          </option>
        </select>
      </div>
      <div class="flex gap-2 justify-center">
        <button class="rounded-xl border border-th-subtle bg-white/5 px-4 py-2 text-xs text-th-muted hover:bg-white/10" @click="mining.leaveConfirm.show = false">Annuler</button>
        <button class="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/15 disabled:opacity-50"
          :disabled="!mining.leaveConfirm.selectedCaptainId"
          @click="mining.confirmLeaveParticipant()">
          Transférer et quitter
        </button>
      </div>
    </div>
  </div>
</template>
