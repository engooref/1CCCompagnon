<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMiningStore } from '../../stores/mining'

const mining = useMiningStore()

const sessionLogOpen = ref(false)

const crewRoleSections = computed(() => {
  const active = mining.sessionActive
  if (!active) return []
  const sections = [
    { role: 'miner', label: 'Mineurs', icon: '⛏️' },
    { role: 'prospector', label: 'Prospecteurs', icon: '🔭' },
    { role: 'support', label: 'Support', icon: '🚚' },
  ]

  return sections.map((s) => {
    const parts = (active.participants ?? []).filter((p: any) => p.role === s.role)
    const groups = new Map<string, any>()
    for (const p of parts) {
      const key = p.crewKey ?? (p.shipId ? `ship:${p.shipId}` : `solo:${p.id}`)
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          shipId: p.shipId ?? null,
          shipName: p.shipName ?? p.ship?.name ?? null,
          crew: {
            used: 0,
            total: p.crewSize ?? 1,
            isManual: !!p.crewIsManual,
            suggestedStatus: p.suggestedStatus ?? null,
            effectiveStatus: p.effectiveStatus ?? p.status ?? null,
          },
          members: [],
          amICaptain: false,
          amISubCaptain: false,
          isMyGroup: false,
        })
      }
      const g = groups.get(key)
      g.members.push(p)
      g.crew.used = g.members.length
      g.crew.total = g.crew.total || (p.crewSize ?? g.crew.used)
      if (p.userId === mining._currentUserId) g.isMyGroup = true
      if (p.isCaptain) g.amICaptain = g.amICaptain || (p.userId === mining._currentUserId)
      if (p.isSubCaptain) g.amISubCaptain = g.amISubCaptain || (p.userId === mining._currentUserId)
    }

    return { role: s.role, label: s.label, icon: s.icon, groups: Array.from(groups.values()) }
  })
})

function sessionRoleLabel(role: string): string {
  return ({ miner: 'Mineur', prospector: 'Prospecteur', support: 'Support' } as Record<string,string>)[role] ?? role
}

function sessionRoleClass(role: string): string {
  return ({
    miner:       'border-accent/25 bg-accent/10 text-accent',
    prospector:  'border-violet-400/25 bg-violet-400/10 text-violet-300',
    support:     'border-amber-400/25 bg-amber-400/10 text-amber-300',
  } as Record<string,string>)[role] ?? 'border-white/10 bg-white/5 text-th-muted'
}

function rockStatusLabel(status: string): string {
  return ({
    available:  'Disponible',
    en_route:   'En route',
    fracturing: 'Fracturation',
    extraction: 'Extraction',
    completed:  'Collecté',
    depleted:   'Épuisé',
    claimed:    'Réclamé',
    mining:     'En cours',
    collected:  'Collecté',
  } as Record<string,string>)[status] ?? status
}

function rockStatusClass(status: string): string {
  return ({
    available:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    en_route:   'bg-sky-500/20 text-sky-300 border-sky-500/30',
    fracturing: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    extraction: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    completed:  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    depleted:   'bg-red-500/10 text-red-400/60 border-red-500/20',
    claimed:    'bg-amber-500/20 text-amber-300 border-amber-500/30',
    mining:     'bg-orange-500/20 text-orange-300 border-orange-500/30',
    collected:  'bg-white/10 text-white/40 border-white/10',
  } as Record<string,string>)[status] ?? 'bg-white/10 text-white/40 border-white/10'
}

function rockCardClass(status: string): string {
  if (status === 'depleted' || status === 'completed' || status === 'collected') {
    return 'border-white/5 bg-black/10 opacity-60'
  }
  if (status === 'fracturing' || status === 'extraction') {
    return 'border-orange-500/20 bg-orange-500/[0.04]'
  }
  return 'border-white/8 bg-black/15'
}

function rockDisplayMinerals(rock: { minerals?: any[] }) {
  const map = new Map<string, any>()
  for (const m of rock.minerals ?? []) {
    const key = String(m.commodityId ?? m.commodityName)
    const cur = map.get(key) ?? { commodityId: m.commodityId, commodityName: m.commodityName ?? '?', percentage: 0, quantityScuActual: 0, phase: 'scan' }
    if (m.phase === 'actual') {
      cur.phase = 'actual'
      cur.quantityScuActual += Number(m.quantityScuActual ?? 0)
    } else if (cur.phase !== 'actual') {
      cur.percentage += Number(m.percentage ?? 0)
    }
    map.set(key, cur)
  }
  return Array.from(map.values())
}

function isRockClaimable(rock: any) {
  return rock.status === 'available'
}

function isRockMine(rock: any) {
  return rock.claimedByUserId === mining._currentUserId
}

function isRockCollectable(rock: any) {
  return rock.status === 'extraction' && isRockMine(rock)
}

function cargoStatusLabel(status: string): string {
  return ({
    pending:    'En attente',
    assigned:   'Assigné',
    picked_up:  'Ramassé',
    delivered:  'Livré',
    refined:    'Raffiné',
  } as Record<string,string>)[status] ?? status
}
</script>

<template>
  <div>
    <div v-if="mining.errors.session" class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
      {{ mining.errors.session }}
    </div>

    <!-- ── Vue liste ─────────────────────────────────────────────────────── -->
    <template v-if="mining.sessionView === 'list'">
      <section class="rounded-2xl border border-th-subtle bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="9" cy="7" r="3" stroke-width="1.7"/><circle cx="15" cy="7" r="3" stroke-width="1.7"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7" d="M3 21c0-4 2.7-6 6-6M21 21c0-4-2.7-6-6-6"/>
              </svg>
            </div>
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.26em] text-accent/70">Mining coordination</p>
              <h2 class="mt-0.5 text-base font-semibold text-th-primary">Sessions collaboratives</h2>
              <p class="mt-0.5 text-xs text-th-muted">Rejoignez une session ou créez-en une nouvelle.</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="inline-flex items-center gap-1.5 rounded-xl border border-th-subtle bg-white/5 px-3 py-2 text-xs text-th-muted transition hover:bg-white/10 hover:text-th-primary disabled:opacity-50"
              :disabled="mining.loading.session"
              @click="mining.loadSessionList()"
            >
              <svg class="h-3.5 w-3.5" :class="{ 'animate-spin': mining.loading.session }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 15M19.418 15A8 8 0 014 9" />
              </svg>
              Actualiser
            </button>
            <button
              class="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition"
              :class="mining.sessionCreateForm.show
                ? 'border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15'
                : 'border-accent/25 bg-accent/[0.08] text-accent hover:bg-accent/15'"
              @click="mining.sessionCreateForm.show = !mining.sessionCreateForm.show; mining.sessionCreateForm.error = null"
            >
              {{ mining.sessionCreateForm.show ? 'Annuler' : '+ Nouvelle' }}
            </button>
          </div>
        </div>

        <div v-if="mining.sessionCreateForm.show" class="mt-4 rounded-xl border border-accent/15 bg-accent/[0.04] p-4">
          <p class="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent/70">Nouvelle session</p>
          <div class="flex gap-2">
            <input
              v-model="mining.sessionCreateForm.name"
              class="min-w-0 flex-1 rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
              placeholder="Nom de la session (ex : Run Pyro)"
              @keydown.enter="mining.createSession(mining.sessionCreateForm.name)"
            />
            <button
              class="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
              :disabled="mining.sessionCreateForm.saving || !mining.sessionCreateForm.name.trim()"
              @click="mining.createSession(mining.sessionCreateForm.name)"
            >
              <svg v-if="mining.sessionCreateForm.saving" class="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>{{ mining.sessionCreateForm.saving ? 'Création...' : 'Créer' }}</span>
            </button>
          </div>
          <p v-if="mining.sessionCreateForm.error" class="mt-2 text-xs text-rose-300">{{ mining.sessionCreateForm.error }}</p>
        </div>
      </section>

      <div v-if="mining.loading.session && !mining.sessionList.length" class="rounded-2xl border border-th-subtle bg-black/20 p-6 text-center text-xs text-th-muted">
        Chargement des sessions...
      </div>
      <div v-else-if="!mining.sessionList.length" class="rounded-2xl border border-dashed border-th-subtle bg-black/20 p-10 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-2xl">⛏️</div>
        <p class="mt-4 text-sm font-semibold text-th-primary">Aucune session active</p>
        <p class="mt-1 text-xs text-th-muted">Créez une session ou attendez qu'un capitaine en lance une.</p>
      </div>
      <div v-else class="space-y-2">
        <article
          v-for="s in mining.sessionList"
          :key="s.id"
          class="flex items-center gap-3 rounded-xl border p-3 transition-colors"
          :class="s.status === 'closed' ? 'border-white/10 bg-black/10 opacity-60' : 'border-th-subtle bg-black/20 hover:border-accent/20'"
        >
          <div class="h-2.5 w-2.5 shrink-0 rounded-full" :class="s.status === 'active' ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-white/20'" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-th-primary">{{ s.name }}</p>
            <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-th-muted">
              <span v-if="s.participantsCount != null">{{ s.participantsCount }} participant(s)</span>
              <span v-if="s.defaultBodyName">📍 {{ s.defaultBodyName }}</span>
              <span v-if="s.status === 'closed'" class="text-rose-400/70">Fermée</span>
            </div>
          </div>
          <button
            v-if="s.status !== 'closed'"
            class="shrink-0 rounded-xl border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-50"
            :disabled="mining.loading.sessionDetail || mining.loading.joinSession"
            @click="mining.showJoinForm(s.id)"
          >
            Rejoindre
          </button>
        </article>
      </div>

      <!-- Modal join -->
      <div v-if="mining.sessionJoinForm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="mining.sessionJoinForm.show = false">
        <div class="w-full max-w-sm rounded-2xl border border-th-subtle bg-[#0d1117] p-6 shadow-2xl">
          <h3 class="mb-4 text-sm font-semibold text-th-primary">Rejoindre la session</h3>
          <div class="mb-4">
            <p class="mb-2 text-xs text-th-muted">Rôle</p>
            <div class="flex gap-2">
              <button
                v-for="r in ['miner', 'prospector', 'support']"
                :key="r"
                class="flex-1 rounded-xl border py-2 text-xs font-semibold transition"
                :class="mining.sessionJoinForm.role === r
                  ? sessionRoleClass(r) + ' border-opacity-50'
                  : 'border-th-subtle bg-white/5 text-th-muted hover:bg-white/10'"
                @click="mining.sessionJoinForm.role = r"
              >
                {{ sessionRoleLabel(r) }}
              </button>
            </div>
          </div>
          <p v-if="mining.sessionJoinForm.error" class="mb-3 text-xs text-rose-300">{{ mining.sessionJoinForm.error }}</p>
          <div class="flex gap-2">
            <button
              class="flex-1 rounded-xl border border-th-subtle bg-white/5 py-2 text-xs text-th-muted transition hover:bg-white/10"
              @click="mining.sessionJoinForm.show = false"
            >
              Annuler
            </button>
            <button
              class="flex-1 rounded-xl border border-accent/30 bg-accent/[0.08] py-2 text-xs font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-50"
              :disabled="mining.sessionJoinForm.saving"
              @click="mining.joinSession()"
            >
              {{ mining.sessionJoinForm.saving ? 'Connexion...' : 'Rejoindre' }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Vue active ────────────────────────────────────────────────────── -->
    <template v-else-if="mining.sessionView === 'active' && mining.sessionActive">

      <!-- Header -->
      <section class="rounded-2xl border border-th-subtle bg-black/20 p-4 backdrop-blur-sm">
        <div class="flex items-center gap-3">
          <button
            class="inline-flex items-center gap-1.5 rounded-xl border border-th-subtle bg-white/5 px-3 py-1.5 text-xs text-th-muted transition hover:bg-white/10 hover:text-th-primary"
            @click="mining.closeSession()"
          >
            ← Retour
          </button>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h2 class="truncate text-sm font-semibold text-th-primary">{{ mining.sessionActive.name }}</h2>
              <span
                class="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                :class="mining.sessionActive.status === 'active'
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-white/40'"
              >
                {{ mining.sessionActive.status === 'active' ? 'Live' : 'Fermée' }}
              </span>
            </div>
            <p v-if="mining.sessionActive.defaultBodyName" class="mt-0.5 text-[11px] text-th-muted">📍 {{ mining.sessionActive.defaultBodyName }}</p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              v-if="mining.myParticipant && mining.sessionActive.status === 'active'"
              class="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/15 disabled:opacity-50"
              :disabled="mining.loading.leaveSession"
              @click="mining.leaveSession()"
            >
              {{ mining.loading.leaveSession ? '...' : 'Quitter' }}
            </button>
            <button
              v-if="mining.amICaptain && mining.sessionActive.status === 'active'"
              class="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50"
              :disabled="mining.loading.closeSession"
              @click="mining.closeSessionAction()"
            >
              {{ mining.loading.closeSession ? '...' : 'Fermer session' }}
            </button>
          </div>
        </div>
      </section>

      <!-- Participants -->
      <section class="rounded-2xl border border-th-subtle bg-black/20 p-4">
        <p class="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-th-muted">
          Effectifs
          <span v-if="mining.sessionActive.participants.length" class="ml-1.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 font-normal normal-case tracking-normal">
            {{ mining.sessionActive.participants.length }}
          </span>
        </p>

        <div v-for="section in crewRoleSections" :key="section.role" class="mb-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-th-primary">{{ section.label }}</span>
              <span class="text-xs text-th-muted">{{ section.groups.length }} groupe(s)</span>
            </div>
          </div>

          <div v-if="section.groups.length" class="space-y-2">
            <article
              v-for="group in section.groups"
              :key="group.key"
              class="rounded-xl border p-3 bg-white/[0.02]"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-3">
                    <h5 class="text-sm font-semibold text-th-primary truncate">{{ group.shipName ?? sessionRoleLabel(section.role) }}</h5>
                    <div class="text-[11px] text-th-muted">{{ group.crew.used }} / {{ group.crew.total }} sièges</div>
                    <span v-if="group.crew.isManual" class="ml-2 text-xs text-rose-300">manuel</span>
                  </div>

                  <div class="mt-2 space-y-1">
                    <div v-for="m in group.members" :key="m.id" class="flex items-center gap-2">
                      <div class="w-8 h-8 shrink-0 rounded-full bg-white/5 flex items-center justify-center text-xs font-semibold text-th-primary">{{ (m.username ?? '?')[0] }}</div>
                      <div class="min-w-0">
                        <div class="truncate text-sm font-medium text-th-primary">{{ m.username }}</div>
                        <div class="text-[11px] text-th-muted">{{ m.duty ?? '' }}</div>
                      </div>
                      <div class="ml-2 shrink-0 text-sm">
                        <span v-if="m.isCaptain">👑</span>
                        <span v-else-if="m.isSubCaptain">⚓</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-col items-end gap-2">
                  <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium" :class="sessionRoleClass(section.role)">{{ section.label }}</span>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="text-xs italic text-th-muted">Aucun membre pour cette catégorie.</div>
        </div>

        <!-- Rejoindre si pas encore participant -->
        <div v-if="!mining.myParticipant && mining.sessionActive.status === 'active'" class="mt-3 border-t border-white/5 pt-3">
          <button
            class="w-full rounded-xl border border-accent/25 bg-accent/[0.08] py-2 text-xs font-semibold text-accent transition hover:bg-accent/15"
            @click="mining.showJoinForm(mining.sessionActive.id)"
          >
            + Rejoindre la session
          </button>
        </div>
      </section>

      <!-- Rochers -->
      <section class="rounded-2xl border border-th-subtle bg-black/20 p-4">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-th-muted">
            Rochers
            <span v-if="mining.sessionActive.rocks.length" class="ml-1.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 font-normal normal-case tracking-normal">
              {{ mining.sessionActive.rocks.filter(r => r.status !== 'depleted' && r.status !== 'completed').length }} actifs
            </span>
          </p>
          <button
            v-if="mining.myParticipant && mining.sessionActive.status === 'active'"
            class="rounded-xl border border-accent/25 bg-accent/[0.08] px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/15"
            @click="mining.openRockForm()"
          >
            + Signaler
          </button>
        </div>

        <!-- Filtres rochers -->
        <div class="mb-3 flex gap-1">
          <button
            v-for="f in [{ k: 'all', l: 'Tous' }, { k: 'active', l: 'Actifs' }, { k: 'done', l: 'Terminés' }]"
            :key="f.k"
            class="rounded-lg border px-3 py-1 text-xs transition"
            :class="mining.rockFilter === f.k
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-th-subtle bg-white/5 text-th-muted hover:bg-white/10'"
            @click="mining.rockFilter = f.k as any"
          >
            {{ f.l }}
          </button>
        </div>

        <div v-if="mining.rockFilteredList.length" class="space-y-2">
          <article
            v-for="rock in mining.rockFilteredList"
            :key="rock.id"
            class="rounded-xl border p-3"
            :class="rockCardClass(rock.status)"
          >
            <div class="flex items-start gap-2">
              <span class="mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold" :class="rockStatusClass(rock.status)">
                {{ rockStatusLabel(rock.status) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-medium text-th-primary">
                  {{ rock.bodyName ?? 'Localisation inconnue' }}
                  <span v-if="rock.sizeScuEstimate" class="ml-1 text-th-muted">~{{ rock.sizeScuEstimate }} SCU</span>
                </p>
                <p v-if="rock.reportedBy" class="mt-0.5 text-[11px] text-th-muted">par {{ rock.reportedBy }}</p>
                <div v-if="rock.minerals?.length" class="mt-1.5 flex flex-wrap gap-1">
                  <span
                    v-for="m in rockDisplayMinerals(rock)"
                    :key="m.commodityId ?? m.commodityName"
                    class="rounded-full border border-accent/20 bg-accent/[0.08] px-2 py-0.5 text-[10px] text-accent"
                  >
                    {{ m.commodityName }}
                    <span v-if="m.phase === 'actual' && m.quantityScuActual > 0">{{ Math.round(m.quantityScuActual * 10) / 10 }} SCU</span>
                    <span v-else-if="m.percentage > 0">{{ Math.round(m.percentage) }}%</span>
                  </span>
                </div>
              </div>
              <!-- Actions rocher -->
              <div v-if="mining.sessionActive.status === 'active'" class="flex shrink-0 flex-col gap-1">
                <button
                  v-if="isRockClaimable(rock)"
                  class="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/15 disabled:opacity-50"
                  :disabled="mining.loading.claimRock"
                  @click="mining.claimRock(rock.id)"
                >
                  Réclamer
                </button>
                <button
                  v-else-if="isRockMine(rock) && rock.status === 'en_route'"
                  class="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500/15 disabled:opacity-50"
                  :disabled="mining.loading.claimRock"
                  @click="mining.unclaimRock(rock.id)"
                >
                  Libérer
                </button>
                <button
                  v-if="isRockMine(rock) && rock.status === 'en_route'"
                  class="rounded-lg border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-[10px] font-semibold text-orange-300 transition hover:bg-orange-500/15 disabled:opacity-50"
                  :disabled="mining.loading.updateRockStatus"
                  @click="mining.updateRockStatus(rock.id, 'fracturing')"
                >
                  Fracturer
                </button>
                <button
                  v-if="isRockMine(rock) && rock.status === 'fracturing'"
                  class="rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-300 transition hover:bg-violet-500/15 disabled:opacity-50"
                  :disabled="mining.loading.updateRockStatus"
                  @click="mining.updateRockStatus(rock.id, 'extraction')"
                >
                  Extraction
                </button>
                <button
                  v-if="isRockCollectable(rock)"
                  class="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/15"
                  @click="mining.openCollectForm(rock.id)"
                >
                  Collecter
                </button>
              </div>
            </div>
          </article>
        </div>
        <p v-else class="text-xs italic text-th-muted">Aucun rocher pour ce filtre.</p>
      </section>

      <!-- Cargos -->
      <section v-if="mining.sessionActive.cargos.length" class="rounded-2xl border border-th-subtle bg-black/20 p-4">
        <p class="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-th-muted">
          Cargos
          <span class="ml-1.5 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 font-normal normal-case tracking-normal">{{ mining.sessionActive.cargos.length }}</span>
        </p>
        <div class="space-y-1.5">
          <div
            v-for="cargo in mining.sessionActive.cargos"
            :key="cargo.id"
            class="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
          >
            <span class="flex-1 font-medium text-th-primary">{{ cargo.commodityName ?? `Cargo #${cargo.id}` }}</span>
            <span v-if="cargo.quantityScu" class="text-th-muted">{{ cargo.quantityScu }} SCU</span>
            <span
              class="rounded-full border px-2 py-0.5 text-[10px]"
              :class="cargo.status === 'delivered' || cargo.status === 'refined'
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-th-muted'"
            >
              {{ cargoStatusLabel(cargo.status ?? 'pending') }}
            </span>
          </div>
        </div>
      </section>

      <!-- Journal -->
      <section class="rounded-2xl border border-th-subtle bg-black/20">
        <button
          class="flex w-full items-center justify-between px-4 py-3 text-left"
          @click="sessionLogOpen = !sessionLogOpen"
        >
          <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-th-muted">Journal</p>
          <svg class="h-4 w-4 text-th-muted/60 transition-transform" :class="sessionLogOpen ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div v-if="sessionLogOpen" class="max-h-52 overflow-y-auto border-t border-white/5 p-3 space-y-1">
          <div v-for="entry in mining.sessionActiveLogs" :key="entry.id" class="flex gap-2 text-xs">
            <span class="shrink-0 text-base leading-none">{{ entry.icon }}</span>
            <span class="text-th-muted">{{ entry.message }}</span>
          </div>
          <p v-if="!mining.sessionActiveLogs.length" class="text-xs italic text-th-muted">Aucun événement.</p>
        </div>
      </section>

      <!-- Modal join (depuis vue active) -->
      <div v-if="mining.sessionJoinForm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="mining.sessionJoinForm.show = false">
        <div class="w-full max-w-sm rounded-2xl border border-th-subtle bg-[#0d1117] p-6 shadow-2xl">
          <h3 class="mb-4 text-sm font-semibold text-th-primary">Rejoindre la session</h3>
          <div class="mb-4">
            <p class="mb-2 text-xs text-th-muted">Rôle</p>
            <div class="flex gap-2">
              <button
                v-for="r in ['miner', 'prospector', 'support']"
                :key="r"
                class="flex-1 rounded-xl border py-2 text-xs font-semibold transition"
                :class="mining.sessionJoinForm.role === r
                  ? sessionRoleClass(r) + ' border-opacity-50'
                  : 'border-th-subtle bg-white/5 text-th-muted hover:bg-white/10'"
                @click="mining.sessionJoinForm.role = r"
              >
                {{ sessionRoleLabel(r) }}
              </button>
            </div>
          </div>
          <p v-if="mining.sessionJoinForm.error" class="mb-3 text-xs text-rose-300">{{ mining.sessionJoinForm.error }}</p>
          <div class="flex gap-2">
            <button
              class="flex-1 rounded-xl border border-th-subtle bg-white/5 py-2 text-xs text-th-muted transition hover:bg-white/10"
              @click="mining.sessionJoinForm.show = false"
            >
              Annuler
            </button>
            <button
              class="flex-1 rounded-xl border border-accent/30 bg-accent/[0.08] py-2 text-xs font-semibold text-accent transition hover:bg-accent/15 disabled:opacity-50"
              :disabled="mining.sessionJoinForm.saving"
              @click="mining.joinSession()"
            >
              {{ mining.sessionJoinForm.saving ? 'Connexion...' : 'Rejoindre' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal rock form -->
      <div v-if="mining.rockForm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="mining.rockForm.show = false">
        <div class="w-full max-w-md rounded-2xl border border-th-subtle bg-[#0d1117] p-6 shadow-2xl">
          <h3 class="mb-4 text-sm font-semibold text-th-primary">Signaler un rocher</h3>

          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-xs text-th-muted">Corps céleste</label>
              <input
                v-model="mining.rockForm.bodyName"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                placeholder="Ex : Yela, Daymar..."
              />
            </div>
            <div>
              <label class="mb-1 block text-xs text-th-muted">Taille estimée (SCU)</label>
              <input
                v-model="mining.rockForm.sizeScuEstimate"
                type="number"
                min="0"
                class="w-full rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/40 focus:outline-none"
                placeholder="Ex : 24"
              />
            </div>

            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="text-xs text-th-muted">Minéraux (scan)</label>
                <button
                  class="text-xs text-accent hover:underline"
                  @click="mining.rockForm.minerals.push({ commodityId: null, percentage: '' })"
                >
                  + Ajouter
                </button>
              </div>
              <div class="space-y-2">
                <div v-for="(m, i) in mining.rockForm.minerals" :key="i" class="flex items-center gap-2">
                  <select
                    v-model="m.commodityId"
                    class="min-w-0 flex-1 rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary focus:border-accent/40 focus:outline-none"
                  >
                    <option :value="null" disabled>Minéral...</option>
                    <option v-for="min in mining.minerals" :key="min.id" :value="min.id">{{ min.name }}</option>
                  </select>
                  <input
                    v-model="m.percentage"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="%"
                    class="w-20 shrink-0 rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary focus:border-accent/40 focus:outline-none"
                  />
                  <button class="shrink-0 text-th-muted hover:text-rose-300" @click="mining.rockForm.minerals.splice(i, 1)">×</button>
                </div>
              </div>
            </div>
          </div>

          <p v-if="mining.rockForm.error" class="mt-3 text-xs text-rose-300">{{ mining.rockForm.error }}</p>
          <div class="mt-4 flex gap-2">
            <button
              class="flex-1 rounded-xl border border-th-subtle bg-white/5 py-2 text-xs text-th-muted transition hover:bg-white/10"
              @click="mining.rockForm.show = false"
            >
              Annuler
            </button>
            <button
              class="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/15 disabled:opacity-50"
              :disabled="mining.rockForm.saving"
              @click="mining.addRock()"
            >
              {{ mining.rockForm.saving ? 'Envoi...' : 'Signaler' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal collect form -->
      <div v-if="mining.collectForm.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="mining.collectForm.show = false">
        <div class="w-full max-w-md rounded-2xl border border-th-subtle bg-[#0d1117] p-6 shadow-2xl">
          <h3 class="mb-4 text-sm font-semibold text-th-primary">Collecte du rocher #{{ mining.collectForm.rockId }}</h3>
          <div class="space-y-2">
            <div v-for="(line, i) in mining.collectForm.lines" :key="i" class="flex items-center gap-3">
              <span class="flex-1 truncate text-sm text-th-primary">{{ line.commodityName || `Mineral ${i + 1}` }}</span>
              <input
                v-model="line.quantityScuActual"
                type="number"
                min="0"
                step="0.1"
                placeholder="SCU réel"
                class="w-28 rounded-xl border border-th-subtle bg-black/30 px-3 py-2 text-sm text-th-primary focus:border-accent/40 focus:outline-none"
              />
            </div>
          </div>
          <p v-if="mining.collectForm.error" class="mt-3 text-xs text-rose-300">{{ mining.collectForm.error }}</p>
          <div class="mt-4 flex gap-2">
            <button
              class="flex-1 rounded-xl border border-th-subtle bg-white/5 py-2 text-xs text-th-muted transition hover:bg-white/10"
              @click="mining.collectForm.show = false"
            >
              Annuler
            </button>
            <button
              class="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/15 disabled:opacity-50"
              :disabled="mining.collectForm.saving"
              @click="mining.collectRock()"
            >
              {{ mining.collectForm.saving ? 'Envoi...' : 'Valider la collecte' }}
            </button>
          </div>
        </div>
      </div>

    </template>
  </div>
</template>
