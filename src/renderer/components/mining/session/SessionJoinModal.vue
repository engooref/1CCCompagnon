<script setup lang="ts">
import { useMiningStore } from '@renderer/stores/mining'

const mining = useMiningStore()

function roleLabel(r: string): string {
  return ({ miner: 'Mineur', prospector: 'Prospecteur', support: 'Support' } as Record<string,string>)[r] ?? r
}
function roleClass(r: string): string {
  return ({ miner: 'border-accent/25 bg-accent/10 text-accent', prospector: 'border-violet-400/25 bg-violet-400/10 text-violet-300', support: 'border-amber-400/25 bg-amber-400/10 text-amber-300' } as Record<string,string>)[r] ?? 'border-white/10 bg-white/5 text-th-muted'
}

function joinShipName(sh: any): string {
  return sh?.name ?? sh?.modelName ?? sh?.label ?? (sh?.id ? `Vaisseau #${sh.id}` : 'Vaisseau')
}
function joinShipCrewSize(sh: any): number {
  return Math.max(1, Number(sh?.crewSize ?? sh?.maxCrew ?? sh?.crew ?? 1) || 1)
}

async function searchJoinShips(q: string) {
  if (!q || q.length < 2) { mining.sessionJoinForm.shipResults = []; return }
  await mining.searchSessionShips(q.toLowerCase())
}

function blurJoinShipResults() { setTimeout(() => { mining.sessionJoinForm.shipResults = [] }, 150) }

function joinSetRole(r: string) {
  mining.sessionJoinForm.role = r
  mining.sessionJoinForm.shipId = null
  mining.sessionJoinForm.selectedShip = null
  mining.sessionJoinForm.crewKey = null
  mining.sessionJoinForm.shipSearch = ''
  mining.sessionJoinForm.shipResults = []
}
function joinSelectCrew(crew: any) {
  mining.sessionJoinForm.shipId       = crew.shipId ?? null
  mining.sessionJoinForm.crewKey      = crew.crewKey ?? null
  mining.sessionJoinForm.crewTotal    = Math.max(1, Number(crew.crewTotal ?? crew.crewSize ?? 1) || 1)
  mining.sessionJoinForm.shipSearch   = crew.shipName ?? ''
  mining.sessionJoinForm.selectedShip = null
  mining.sessionJoinForm.shipResults  = []
}
function joinSelectSessionShip(sh: any) {
  mining.sessionJoinForm.selectedShip = sh
  mining.sessionJoinForm.shipId       = sh.id
  mining.sessionJoinForm.shipSearch   = joinShipName(sh)
  mining.sessionJoinForm.shipResults  = []
  mining.sessionJoinForm.crewKey      = null
  mining.sessionJoinForm.crewTotal    = joinShipCrewSize(sh)
}
function joinSelectSearchShip(sh: any) {
  mining.sessionJoinForm.selectedShip = sh
  mining.sessionJoinForm.shipId       = sh.id
  mining.sessionJoinForm.shipSearch   = joinShipName(sh)
  mining.sessionJoinForm.shipResults  = []
  mining.sessionJoinForm.crewKey      = null
  mining.sessionJoinForm.crewTotal    = joinShipCrewSize(sh)
}
function joinClearShip() {
  mining.sessionJoinForm.selectedShip = null
  mining.sessionJoinForm.shipId       = null
  mining.sessionJoinForm.shipSearch   = ''
  mining.sessionJoinForm.shipResults  = []
  mining.sessionJoinForm.crewKey      = null
  mining.sessionJoinForm.crewTotal    = 1
}
function onJoinShipSearchInput() {
  if (mining.sessionJoinForm.crewKey) {
    mining.sessionJoinForm.crewKey = null
    mining.sessionJoinForm.shipId = null
    mining.sessionJoinForm.crewTotal = 1
  }
  mining.sessionJoinForm.selectedShip = null
  searchJoinShips(mining.sessionJoinForm.shipSearch)
}
</script>

<template>
  <div v-if="mining.sessionJoinForm.show"
    class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="mining.sessionJoinForm.show = false">
    <div class="w-full max-w-lg rounded-2xl border border-th-subtle bg-[#0d1117] p-4 shadow-2xl sm:p-6">
      <div class="space-y-5">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-widest text-accent/70">Participer</p>
            <h3 class="mt-0.5 text-sm font-semibold text-th-primary">Rejoindre la session</h3>
          </div>
          <button type="button" @click="mining.sessionJoinForm.show = false"
            class="shrink-0 rounded-lg p-1 text-base leading-none text-th-muted transition hover:bg-white/5 hover:text-th-primary">✕</button>
        </div>

        <!-- Role selector -->
        <div class="space-y-1.5">
          <label class="block text-xs text-th-muted">Rôle</label>
          <div class="grid grid-cols-3 gap-2">
            <button v-for="r in ['miner','prospector','support']" :key="r" type="button"
              class="rounded-xl border py-2 text-xs font-semibold transition"
              :class="mining.sessionJoinForm.role === r ? roleClass(r) : 'border-th-subtle bg-white/5 text-th-muted hover:bg-white/10'"
              @click="joinSetRole(r)">
              {{ roleLabel(r) }}
            </button>
          </div>
        </div>

        <!-- Available crews -->
        <div v-if="mining.getAvailableCrews(mining.sessionJoinForm.role).length > 0"
          class="rounded-xl border border-white/8 bg-white/[0.02] p-3 space-y-2">
          <p class="text-[10px] font-semibold uppercase tracking-wider text-th-muted">Équipages disponibles</p>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button v-for="crew in mining.getAvailableCrews(mining.sessionJoinForm.role)"
              :key="crew.crewKey ?? crew.shipId" type="button"
              class="min-w-0 rounded-xl border px-3 py-2 text-left text-xs transition"
              :class="mining.sessionJoinForm.shipId === crew.shipId && mining.sessionJoinForm.crewKey === (crew.crewKey ?? null)
                ? 'border-accent/30 bg-accent/[0.08] text-accent'
                : 'border-white/10 bg-white/5 text-th-muted hover:bg-white/10'"
              @click="joinSelectCrew(crew)">
              <div class="truncate font-semibold">{{ crew.shipName }}</div>
              <div class="text-[10px] opacity-70">{{ crew.crewUsed }}/{{ crew.crewTotal }} sièges</div>
              <div v-if="crew.captainName" class="mt-0.5 truncate text-[10px] opacity-60">{{ crew.captainName }}</div>
            </button>
          </div>
        </div>

        <!-- Miner -->
        <div v-if="mining.sessionJoinForm.role === 'miner'" class="space-y-3">
          <div class="space-y-1.5">
            <label class="block text-xs text-th-muted">Vaisseau de minage <span class="text-accent">*</span></label>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button v-for="sh in mining.sessionShips" :key="sh.id" type="button"
                class="min-w-0 rounded-xl border px-3 py-2 text-left text-xs transition"
                :class="mining.sessionJoinForm.shipId === sh.id && !mining.sessionJoinForm.crewKey
                  ? 'border-accent/30 bg-accent/[0.08] text-accent'
                  : 'border-white/10 bg-white/5 text-th-muted hover:bg-white/10'"
                @click="joinSelectSessionShip(sh)">
                <div class="truncate font-semibold">{{ joinShipName(sh) }}</div>
                <div v-if="sh.crewSize" class="text-[10px] opacity-60">Équipage {{ sh.crewSize }}</div>
              </button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end">
            <p class="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px] text-th-muted">
              Choisis un vaisseau de session ou un équipage disponible.
            </p>
            <div class="space-y-1.5">
              <label class="block text-[10px] text-th-muted">Sièges du vaisseau</label>
              <input v-model.number="mining.sessionJoinForm.crewTotal" type="number" min="1"
                :disabled="!mining.sessionJoinForm.shipId || !!mining.sessionJoinForm.crewKey"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-xs text-th-primary focus:border-accent/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45" />
            </div>
          </div>
        </div>

        <!-- Prospector -->
        <div v-else-if="mining.sessionJoinForm.role === 'prospector'" class="space-y-3">
          <div v-if="mining.sessionShips.length > 0" class="space-y-1.5">
            <label class="block text-xs text-th-muted">Sélection rapide <span class="text-[10px] text-th-muted/50">optionnel</span></label>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button v-for="sh in mining.sessionShips" :key="sh.id" type="button"
                class="min-w-0 rounded-xl border px-3 py-2 text-left text-xs transition"
                :class="mining.sessionJoinForm.shipId === sh.id && !mining.sessionJoinForm.crewKey
                  ? 'border-accent/30 bg-accent/[0.08] text-accent'
                  : 'border-white/10 bg-white/5 text-th-muted hover:bg-white/10'"
                @click="joinSelectSessionShip(sh)">
                <div class="truncate font-semibold">{{ joinShipName(sh) }}</div>
                <div v-if="sh.crewSize" class="text-[10px] opacity-60">Équipage {{ sh.crewSize }}</div>
              </button>
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end">
            <div class="min-w-0 space-y-1.5">
              <label class="block text-xs text-th-muted">Autre vaisseau <span class="text-[10px] text-th-muted/50">optionnel</span></label>
              <div class="relative">
                <input v-model="mining.sessionJoinForm.shipSearch" type="text" placeholder="Rechercher…"
                  @input="onJoinShipSearchInput()" @blur="blurJoinShipResults()"
                  class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 pr-7 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" />
                <button v-if="mining.sessionJoinForm.selectedShip && !mining.sessionJoinForm.crewKey" type="button"
                  @click="joinClearShip()" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white/70">✕</button>
                <div v-if="mining.sessionJoinForm.shipResults.length > 0"
                  class="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg">
                  <button v-for="sh in mining.sessionJoinForm.shipResults" :key="sh.id" type="button"
                    @mousedown.prevent="joinSelectSearchShip(sh)"
                    class="w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/5">{{ joinShipName(sh) }}</button>
                </div>
              </div>
            </div>
            <div class="space-y-1.5">
              <label class="block text-[10px] text-th-muted">Sièges</label>
              <input v-model.number="mining.sessionJoinForm.crewTotal" type="number" min="1"
                :disabled="!mining.sessionJoinForm.shipId || !!mining.sessionJoinForm.crewKey"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-xs text-th-primary focus:border-accent/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45" />
            </div>
          </div>
        </div>

        <!-- Support -->
        <div v-else-if="mining.sessionJoinForm.role === 'support'" class="space-y-3">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-end">
            <div class="min-w-0 space-y-1.5">
              <label class="block text-xs text-th-muted">Vaisseau support <span class="text-accent">*</span></label>
              <div class="relative">
                <input v-model="mining.sessionJoinForm.shipSearch" type="text" placeholder="Rechercher…"
                  @input="onJoinShipSearchInput()" @blur="blurJoinShipResults()"
                  class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 pr-7 text-xs text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none" />
                <button v-if="mining.sessionJoinForm.selectedShip && !mining.sessionJoinForm.crewKey" type="button"
                  @click="joinClearShip()" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/40 hover:text-white/70">✕</button>
                <div v-if="mining.sessionJoinForm.shipResults.length > 0"
                  class="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1422]/95 shadow-lg">
                  <button v-for="sh in mining.sessionJoinForm.shipResults" :key="sh.id" type="button"
                    @mousedown.prevent="joinSelectSearchShip(sh)"
                    class="w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/5">{{ joinShipName(sh) }}</button>
                </div>
              </div>
            </div>
            <div class="space-y-1.5">
              <label class="block text-[10px] text-th-muted">Sièges</label>
              <input v-model.number="mining.sessionJoinForm.crewTotal" type="number" min="1"
                :disabled="!mining.sessionJoinForm.shipId || !!mining.sessionJoinForm.crewKey"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-xs text-th-primary focus:border-accent/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45" />
            </div>
          </div>
        </div>

        <p v-if="mining.sessionJoinForm.crewKey" class="rounded-xl border border-accent/10 bg-accent/[0.04] px-3 py-2 text-[11px] text-th-muted">
          Tu rejoins un équipage existant : le nombre de sièges est verrouillé.
        </p>

        <p v-if="mining.sessionJoinForm.error" class="text-xs text-rose-300">{{ mining.sessionJoinForm.error }}</p>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button"
            class="rounded-xl border border-th-subtle bg-white/5 py-2 text-xs text-th-muted transition hover:bg-white/10"
            @click="mining.sessionJoinForm.show = false">Annuler</button>
          <button type="button"
            class="rounded-xl border border-accent/30 bg-accent/[0.08] py-2 text-xs font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-50"
            :disabled="mining.sessionJoinForm.saving || (mining.sessionJoinForm.role !== 'prospector' && !mining.sessionJoinForm.shipId)"
            @click="mining.joinSession()">
            {{ mining.sessionJoinForm.saving ? 'Connexion…' : 'Rejoindre' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
