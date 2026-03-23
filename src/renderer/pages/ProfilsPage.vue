<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()

const profile = computed(() => app.profile)
const rh = computed(() => app.profile?.rh ?? null)

const xpPercent = computed(() => {
  const r = rh.value
  if (!r || !r.nextLevelXp || r.nextLevelXp <= 0) return 0
  return Math.min(100, Math.round((r.totalXp / r.nextLevelXp) * 100))
})

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

const statusColor = computed(() => {
  const s = rh.value?.status?.toLowerCase() ?? ''
  if (s === 'actif') return 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
  if (s === 'inactif') return 'text-rose-300 border-rose-400/30 bg-rose-400/10'
  return 'text-amber-300 border-amber-400/30 bg-amber-400/10'
})

</script>

<template>
  <section class="h-full space-y-5">

    <!-- Non connecté -->
    <div
      v-if="!app.status.authReady"
      class="flex h-full items-center justify-center text-th-muted text-sm"
    >
      Connexion requise pour afficher le profil.
    </div>

    <template v-else>
      <!-- En-tête profil -->
      <div class="flex items-center gap-5 rounded-lg border border-accent/20 bg-black/20 p-5">
        <img
          v-if="profile?.avatar"
          :src="profile.avatar"
          alt="Avatar"
          class="h-16 w-16 rounded-full border-2 border-accent/40 object-cover shadow-lg"
        />
        <div v-else class="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent/20 bg-th-card text-2xl text-th-muted">
          ?
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-lg font-bold truncate">{{ profile?.username ?? '—' }}</p>
        </div>

      </div>

      <!-- Données RH -->
      <div class="rounded-lg border border-accent/20 bg-black/20 p-5 space-y-5">
        <p class="text-xs font-semibold uppercase tracking-widest text-th-muted">Ressources Humaines</p>

        <div v-if="!rh" class="text-sm text-th-muted">Aucune donnée RH associée à ce compte.</div>

        <template v-else>
          <!-- Grade & statut -->
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p class="text-xs text-th-muted mb-1">Grade</p>
              <p class="font-semibold text-th-primary">{{ rh.grade?.name ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-th-muted mb-1">Niveau</p>
              <p class="font-semibold text-th-primary">{{ rh.level ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-th-muted mb-1">Statut</p>
              <span
                class="inline-block rounded border px-2 py-0.5 text-xs font-semibold"
                :class="statusColor"
              >
                {{ rh.status }}
              </span>
            </div>
            <div>
              <p class="text-xs text-th-muted mb-1">Date d'entrée</p>
              <p class="text-sm text-th-primary">{{ formatDate(rh.dateEntree) }}</p>
            </div>
            <div>
              <p class="text-xs text-th-muted mb-1">Dernière promotion</p>
              <p class="text-sm text-th-primary">{{ formatDate(rh.lastPromotion) }}</p>
            </div>
          </div>

          <!-- Barre XP -->
          <div>
            <div class="mb-1.5 flex items-center justify-between text-xs">
              <span class="text-th-secondary">Expérience</span>
              <span class="text-accent font-semibold">
                {{ rh.totalXp.toLocaleString('fr-FR') }}
                <span v-if="rh.nextLevelXp" class="text-th-muted font-normal">
                  / {{ rh.nextLevelXp.toLocaleString('fr-FR') }} XP
                </span>
                <span v-else class="text-th-muted font-normal"> XP</span>
              </span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-th-card">
              <div
                class="h-full rounded-full bg-gradient-to-r from-accent to-accent/70 transition-all duration-500 shadow-[0_0_8px_rgba(var(--accent-rgb),0.4)]"
                :style="{ width: xpPercent + '%' }"
              />
            </div>
            <p v-if="rh.nextLevelXp" class="mt-1 text-right text-xs text-th-muted">
              {{ xpPercent }}% vers le prochain niveau
            </p>
          </div>
        </template>
      </div>
    </template>

  </section>
</template>
