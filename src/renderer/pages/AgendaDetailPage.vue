<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '../stores/app'
import { http } from '../services/http'
import { createOverlayUrls } from '../config/api'
import { logger } from '../services/logger'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventDetail {
  id: number
  name: string
  type: { id: number; name: string; color: string | null } | null
  start: string | null
  end: string | null
  location: string | null
  picture: string | null
  launchServer: string | null
  launchScenario: string | null
  spawn: string | null
  description: string | null
  object1CC: string | null
  objectAdv: string | null
  commentaire: string | null
  responsable: string | null
}

interface Membre {
  id: number
  username: string
  avatar: string | null
  roles?: { id: number; name: string; color: string | null }[]
}

interface Escouade {
  id: number | null
  name: string
  color: string | null
  membres: Membre[]
}

interface SlotAssignment {
  slotRole: string | null
  membre: { id: number; username: string; avatar: string | null } | null
  notes: string | null
}

interface Vaisseau {
  id: number
  name: string | null
  model: string | null
  team: { id: number; name: string; color: string | null } | null
  slots: SlotAssignment[]
}


interface MyResponse {
  type: string
  team: { id: number; name: string; color: string | null } | null
  vaisseau: string | null
  roleVaisseau: string | null
  roles: { id: number; name: string }[]
}

interface ApiResponse {
  success: boolean
  event: EventDetail
  myResponse: MyResponse | null
  attributionFaite: boolean
  inscriptions: { userId: number; username: string; avatar: string | null; type: string }[]
  escouades: Escouade[]
  vaisseaux: Vaisseau[]
}

// ─── State ────────────────────────────────────────────────────────────────────

const app    = useAppStore()
const router = useRouter()
const route  = useRoute()

const data    = ref<ApiResponse | null>(null)
const loading = ref(false)
const error   = ref<string | null>(null)

const activeTab = ref<'info' | 'inscriptions' | 'escouades' | 'vaisseaux' | 'presences'>('info')

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urls = computed(() => app.settings ? createOverlayUrls(app.settings) : null)

function authHeaders() {
  return { Authorization: `Bearer ${app.bearerToken}` }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function typeRepLabel(type: string): string {
  const labels: Record<string, string> = {
    accept: 'Présent',
    maybe: 'Peut-être',
    decline: 'Absent',
  }
  return labels[type] ?? type
}

function typeRepClass(type: string): string {
  if (type === 'accept') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
  if (type === 'maybe')  return 'border-amber-400/30 bg-amber-400/10 text-amber-300'
  return 'border-rose-400/30 bg-rose-400/10 text-rose-300'
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchDetail() {
  if (!app.bearerToken) return
  const id = Number(route.params.id)
  const url = urls.value?.agenda.show(id)
  if (!url) return

  loading.value = true
  error.value = null
  try {
    logger.info('[AgendaDetail] GET', url)
    const { data: res } = await http.get<ApiResponse>(url, { headers: authHeaders() })
    data.value = res
  } catch (e: any) {
    logger.error('[AgendaDetail] erreur :', e)
    if (e?.response?.status === 404) {
      error.value = 'Événement introuvable.'
    } else {
      error.value = `${e?.response?.status ? `HTTP ${e.response.status} – ` : ''}${e?.response?.data?.message ?? e?.message ?? 'Erreur de chargement'}`
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (app.status.authReady) fetchDetail()
})
</script>

<template>
  <section class="h-full flex flex-col gap-4">

    <!-- Not authenticated -->
    <div v-if="!app.status.authReady" class="flex flex-1 items-center justify-center text-th-muted text-sm">
      Connexion requise.
    </div>

    <template v-else>

      <!-- ── Header ──────────────────────────────────────────────────────── -->
      <div class="shrink-0 flex items-center gap-3">
        <button
          @click="router.push({ name: 'agenda' })"
          class="flex items-center gap-1.5 rounded-md border border-th-subtle bg-th-card px-2.5 py-1.5 text-xs text-th-secondary hover:text-th-primary hover:border-th-subtle transition"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Agenda
        </button>

        <div v-if="data" class="flex items-center gap-2 min-w-0">
          <span
            v-if="data.event.type"
            class="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border"
            :style="data.event.type.color
              ? { borderColor: data.event.type.color + '55', backgroundColor: data.event.type.color + '20', color: data.event.type.color }
              : {}"
            :class="!data.event.type.color ? 'border-th-subtle bg-th-card text-th-secondary' : ''"
          >
            {{ data.event.type.name }}
          </span>
          <h2 class="text-sm font-bold text-th-primary truncate">{{ data.event.name }}</h2>
        </div>

        <div v-if="loading && !data" class="text-xs text-th-muted">Chargement…</div>
      </div>

      <!-- Error -->
      <div v-if="error" class="rounded-lg border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-300">
        <span class="font-semibold">Erreur :</span> {{ error }}
      </div>

      <!-- Loading skeleton -->
      <div v-else-if="loading && !data" class="rounded-lg border border-violet-400/10 bg-black/20 p-4 text-sm text-th-muted">
        Chargement de l'événement…
      </div>

      <!-- ── Content ─────────────────────────────────────────────────────── -->
      <template v-if="data">

        <!-- Ma réponse -->
        <div v-if="data.myResponse" class="shrink-0 rounded-lg border border-th-subtle bg-th-surface px-4 py-2.5 flex items-center gap-3">
          <span class="text-xs text-th-muted">Ma réponse :</span>
          <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold" :class="typeRepClass(data.myResponse.type)">
            {{ typeRepLabel(data.myResponse.type) }}
          </span>
          <span v-if="data.myResponse.team" class="text-xs text-th-secondary">
            Escouade : <span class="font-medium text-th-primary">{{ data.myResponse.team.name }}</span>
          </span>
          <span v-if="data.myResponse.vaisseau" class="text-xs text-th-secondary">
            Vaisseau : <span class="font-medium text-th-primary">{{ data.myResponse.vaisseau }}</span>
          </span>
        </div>

        <!-- ── Tabs ──────────────────────────────────────────────────────── -->
        <div class="shrink-0 flex gap-1 border-b border-th-subtle pb-0">
          <button
            v-for="tab in ([
              { key: 'info', label: 'Infos' },
              { key: 'inscriptions', label: `Inscrits (${data.inscriptions.length})` },
              { key: 'escouades', label: `Escouades (${data.escouades.length})`, hide: !data.attributionFaite || !data.escouades.length },
              { key: 'vaisseaux', label: `Vaisseaux (${data.vaisseaux.length})`, hide: !data.attributionFaite || !data.vaisseaux.length },
            ] as any[])"
            :key="tab.key"
            v-show="!tab.hide"
            @click="activeTab = tab.key"
            class="px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px"
            :class="activeTab === tab.key
              ? 'border-violet-400 text-violet-300'
              : 'border-transparent text-th-muted hover:text-th-secondary'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- ── Scrollable tab content ─────────────────────────────────── -->
        <div class="flex-1 min-h-0 overflow-y-auto">

          <!-- TAB: Infos -->
          <div v-if="activeTab === 'info'" class="space-y-3">
            <div class="rounded-lg border border-th-muted bg-black/20 divide-y divide-[var(--border-subtle)]">
              <div class="px-4 py-3 flex gap-3">
                <span class="w-32 shrink-0 text-xs text-th-muted">Début</span>
                <span class="text-xs text-th-primary">{{ formatDate(data.event.start) }}</span>
              </div>
              <div class="px-4 py-3 flex gap-3">
                <span class="w-32 shrink-0 text-xs text-th-muted">Fin</span>
                <span class="text-xs text-th-primary">{{ formatDate(data.event.end) }}</span>
              </div>
              <div v-if="data.event.launchServer" class="px-4 py-3 flex gap-3">
                <span class="w-32 shrink-0 text-xs text-th-muted">Lancement serveur</span>
                <span class="text-xs text-th-primary">{{ formatDate(data.event.launchServer) }}</span>
              </div>
              <div v-if="data.event.launchScenario" class="px-4 py-3 flex gap-3">
                <span class="w-32 shrink-0 text-xs text-th-muted">Lancement scénario</span>
                <span class="text-xs text-th-primary">{{ formatDate(data.event.launchScenario) }}</span>
              </div>
              <div v-if="data.event.location" class="px-4 py-3 flex gap-3">
                <span class="w-32 shrink-0 text-xs text-th-muted">Lieu</span>
                <span class="text-xs text-th-primary">{{ data.event.location }}</span>
              </div>
              <div v-if="data.event.spawn" class="px-4 py-3 flex gap-3">
                <span class="w-32 shrink-0 text-xs text-th-muted">Spawn</span>
                <span class="text-xs text-th-primary">{{ data.event.spawn }}</span>
              </div>
              <div v-if="data.event.responsable" class="px-4 py-3 flex gap-3">
                <span class="w-32 shrink-0 text-xs text-th-muted">Responsable</span>
                <span class="text-xs text-th-primary">{{ data.event.responsable }}</span>
              </div>
            </div>

            <div v-if="data.event.object1CC" class="rounded-lg border border-th-muted bg-black/20 p-4">
              <p class="text-xs font-semibold text-violet-300/80 mb-1.5">Objectif 1CC</p>
              <p class="text-xs text-th-secondary whitespace-pre-line">{{ data.event.object1CC }}</p>
            </div>

            <div v-if="data.event.objectAdv" class="rounded-lg border border-th-muted bg-black/20 p-4">
              <p class="text-xs font-semibold text-rose-300/80 mb-1.5">Objectif adverse</p>
              <p class="text-xs text-th-secondary whitespace-pre-line">{{ data.event.objectAdv }}</p>
            </div>

            <div v-if="data.event.description" class="rounded-lg border border-th-muted bg-black/20 p-4">
              <p class="text-xs font-semibold text-th-secondary mb-1.5">Description</p>
              <p class="text-xs text-th-secondary whitespace-pre-line">{{ data.event.description }}</p>
            </div>

            <div v-if="data.event.commentaire" class="rounded-lg border border-th-muted bg-black/20 p-4">
              <p class="text-xs font-semibold text-th-secondary mb-1.5">Commentaire</p>
              <p class="text-xs text-th-secondary whitespace-pre-line">{{ data.event.commentaire }}</p>
            </div>
          </div>

          <!-- TAB: Inscriptions -->
          <div v-else-if="activeTab === 'inscriptions'">
            <div v-if="!data.inscriptions.length" class="p-4 text-sm text-th-muted">Aucune inscription.</div>
            <div v-else class="space-y-1.5">
              <div
                v-for="ins in data.inscriptions"
                :key="ins.userId"
                class="flex items-center gap-3 rounded-lg border border-th-muted bg-black/20 px-3 py-2"
              >
                <img
                  v-if="ins.avatar"
                  :src="ins.avatar"
                  class="w-6 h-6 rounded-full shrink-0 bg-th-card"
                  :alt="ins.username"
                />
                <div v-else class="w-6 h-6 rounded-full shrink-0 bg-th-card flex items-center justify-center text-[10px] text-th-secondary">
                  {{ ins.username.charAt(0).toUpperCase() }}
                </div>
                <span class="flex-1 text-xs text-th-primary">{{ ins.username }}</span>
                <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold" :class="typeRepClass(ins.type)">
                  {{ typeRepLabel(ins.type) }}
                </span>
              </div>
            </div>
          </div>

          <!-- TAB: Escouades -->
          <div v-else-if="activeTab === 'escouades'">
            <div v-if="!data.escouades.length" class="p-4 text-sm text-th-muted">Aucune escouade attribuée.</div>
            <div v-else class="space-y-3">
              <div
                v-for="escouade in data.escouades"
                :key="escouade.id ?? 0"
                class="rounded-lg border border-th-muted bg-black/20 overflow-hidden"
              >
                <!-- Escouade header -->
                <div
                  class="flex items-center gap-2 px-4 py-2.5 border-b border-th-subtle"
                  :style="escouade.color ? { borderLeftColor: escouade.color, borderLeftWidth: '3px' } : {}"
                >
                  <span class="text-xs font-bold text-th-primary">{{ escouade.name }}</span>
                  <span class="text-xs text-th-muted">({{ escouade.membres.length }} membre{{ escouade.membres.length > 1 ? 's' : '' }})</span>
                </div>

                <!-- Membres -->
                <div class="divide-y divide-[var(--border-subtle)]">
                  <div v-for="m in escouade.membres" :key="m.id" class="flex items-center gap-3 px-4 py-2">
                    <img v-if="m.avatar" :src="m.avatar" class="w-5 h-5 rounded-full shrink-0 bg-th-card" :alt="m.username" />
                    <div v-else class="w-5 h-5 rounded-full shrink-0 bg-th-card flex items-center justify-center text-[10px] text-th-secondary">
                      {{ m.username.charAt(0).toUpperCase() }}
                    </div>
                    <span class="flex-1 text-xs text-th-primary">{{ m.username }}</span>
                    <div class="flex gap-1 flex-wrap justify-end">
                      <span
                        v-for="role in m.roles"
                        :key="role.id"
                        class="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                        :style="role.color
                          ? { borderColor: role.color + '55', backgroundColor: role.color + '20', color: role.color }
                          : {}"
                        :class="!role.color ? 'border-th-subtle bg-th-card text-th-secondary' : ''"
                      >
                        {{ role.name }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: Vaisseaux -->
          <div v-else-if="activeTab === 'vaisseaux'">
            <div v-if="!data.vaisseaux.length" class="p-4 text-sm text-th-muted">Aucun vaisseau attribué.</div>
            <div v-else class="space-y-3">
              <div
                v-for="vaisseau in data.vaisseaux"
                :key="vaisseau.id"
                class="rounded-lg border border-th-muted bg-black/20 overflow-hidden"
              >
                <!-- Vaisseau header -->
                <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-th-subtle">
                  <div class="flex items-center gap-2">
                    <svg class="w-3.5 h-3.5 text-th-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                    <span class="text-xs font-bold text-th-primary">{{ vaisseau.name ?? `Vaisseau #${vaisseau.id}` }}</span>
                    <span v-if="vaisseau.model" class="text-xs text-th-muted">— {{ vaisseau.model }}</span>
                  </div>
                  <span
                    v-if="vaisseau.team"
                    class="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                    :style="vaisseau.team.color
                      ? { borderColor: vaisseau.team.color + '55', backgroundColor: vaisseau.team.color + '20', color: vaisseau.team.color }
                      : {}"
                    :class="!vaisseau.team.color ? 'border-th-subtle bg-th-card text-th-secondary' : ''"
                  >
                    {{ vaisseau.team.name }}
                  </span>
                </div>

                <!-- Slots -->
                <div class="divide-y divide-[var(--border-subtle)]">
                  <div v-for="(slot, i) in vaisseau.slots" :key="i" class="flex items-center gap-3 px-4 py-2">
                    <span class="shrink-0 w-24 text-[10px] text-th-muted">{{ slot.slotRole ?? 'Slot' }}</span>
                    <template v-if="slot.membre">
                      <img v-if="slot.membre.avatar" :src="slot.membre.avatar" class="w-5 h-5 rounded-full shrink-0 bg-th-card" :alt="slot.membre.username" />
                      <div v-else class="w-5 h-5 rounded-full shrink-0 bg-th-card flex items-center justify-center text-[10px] text-th-secondary">
                        {{ slot.membre.username.charAt(0).toUpperCase() }}
                      </div>
                      <span class="text-xs text-th-primary">{{ slot.membre.username }}</span>
                    </template>
                    <span v-else class="text-xs text-th-muted italic">Vide</span>
                    <span v-if="slot.notes" class="ml-auto text-[10px] text-th-muted italic">{{ slot.notes }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

         

        </div><!-- end scrollable -->
      </template>

    </template>
  </section>
</template>
