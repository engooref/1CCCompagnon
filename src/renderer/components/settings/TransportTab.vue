<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '../../stores/app'
import { logger } from '../../services/logger'

const app = useAppStore()

// ─── Opportunités de marché ───────────────────────────────────────────────────

const marketOppsEnabled    = computed(() => app.settings?.marketOppsEnabled ?? false)
const marketOppsBudgetInput = ref<string>('')
const marketOppsSaving     = ref(false)

function initMarketBudget() {
  const savedBudget = app.settings?.marketOppsBudget
  marketOppsBudgetInput.value = savedBudget != null ? String(savedBudget) : ''
}

async function toggleMarketOpps() {
  if (!app.settings) return
  marketOppsSaving.value = true
  try {
    logger.info('[Settings] toggling market opps to', !marketOppsEnabled.value)
    await app.saveSettings({ marketOppsEnabled: !marketOppsEnabled.value })
  } finally {
    marketOppsSaving.value = false
  }
}

async function saveMarketBudget() {
  const raw    = marketOppsBudgetInput.value
  const budget = raw === '' ? null : Number(raw)
  if (raw !== '' && (isNaN(budget!) || budget! < 0)) return
  marketOppsSaving.value = true
  try {
    await app.saveSettings({ marketOppsBudget: budget })
  } finally {
    marketOppsSaving.value = false
  }
}

onMounted(() => { initMarketBudget() })
</script>

<template>
  <div class="space-y-4">

    <!-- Opportunités de marché -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-1">Opportunités de marché</p>
      <p class="text-xs text-th-muted mb-4">
        Affiche des suggestions de cargo rentables dans le module Transport de l'overlay.
      </p>

      <!-- Toggle -->
      <div class="flex items-center justify-between gap-4 mb-4">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-th-primary">Activer</p>
          <p class="text-xs text-th-muted mt-0.5">Affiche jusqu'à 3 opportunités par étape.</p>
        </div>
        <button
          @click="toggleMarketOpps"
          :disabled="marketOppsSaving"
          class="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-200 disabled:opacity-50"
          :class="marketOppsEnabled ? 'bg-accent/30 border-accent/40' : 'bg-th-card border-th-subtle'"
        >
          <span
            class="inline-block h-4 w-4 rounded-full shadow transition-transform duration-200"
            :class="marketOppsEnabled ? 'translate-x-6' : 'translate-x-1 bg-th-muted'"
            :style="marketOppsEnabled ? { backgroundColor: 'rgb(var(--accent-rgb))' } : {}"
          />
        </button>
      </div>

      <!-- Budget -->
      <div v-if="marketOppsEnabled" class="space-y-2">
        <p class="text-xs font-semibold text-th-secondary">Budget disponible <span class="text-th-muted font-normal">(aUEC · laisser vide = illimité)</span></p>
        <div class="flex gap-2">
          <input
            v-model="marketOppsBudgetInput"
            type="number"
            min="0"
            placeholder="Ex : 500000"
            class="flex-1 rounded-md border border-th-subtle bg-th-surface px-3 py-2 text-sm text-th-primary placeholder:text-th-muted focus:border-accent/50 focus:outline-none transition"
            @keydown.enter="saveMarketBudget"
          />
          <button
            @click="saveMarketBudget"
            :disabled="marketOppsSaving"
            class="shrink-0 rounded-md border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 transition disabled:opacity-50"
          >
            <svg v-if="marketOppsSaving" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <span v-else>Valider</span>
          </button>
        </div>
        <p class="text-[11px] text-th-muted">
          <span v-if="app.settings?.marketOppsBudget != null">
            Budget actuel : <span class="text-th-secondary tabular-nums">{{ app.settings.marketOppsBudget.toLocaleString('fr-FR') }} aUEC</span>
          </span>
          <span v-else>Aucun budget défini — les offres ne filtrent pas par coût.</span>
        </p>
      </div>
    </div>

  </div>
</template>
