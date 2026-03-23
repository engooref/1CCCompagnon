<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../../stores/app'
import type { AppearanceSettings } from '@shared/general'
import { applyAppearance, DEFAULT_APPEARANCE } from '../../services/applyAppearance'

const app = useAppStore()
const saving = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

function loadFromStore(): AppearanceSettings {
  const a = app.settings?.appearance
  return {
    primaryColor: a?.primaryColor || DEFAULT_APPEARANCE.primaryColor,
    accentColor:  a?.accentColor  || DEFAULT_APPEARANCE.accentColor,
    textColor:    a?.textColor    || DEFAULT_APPEARANCE.textColor,
    navPosition:  a?.navPosition  || DEFAULT_APPEARANCE.navPosition,
    fontSize:     a?.fontSize     ?? DEFAULT_APPEARANCE.fontSize ?? 16,
  }
}

const FONT_SIZE_MIN = 13
const FONT_SIZE_MAX = 20
const FONT_SIZE_DEFAULT = 16

const appearance = ref<AppearanceSettings>(loadFromStore())

onMounted(() => { appearance.value = loadFromStore() })
onUnmounted(() => { if (saveTimer) clearTimeout(saveTimer) })

watch(
  appearance,
  (v) => {
    applyAppearance(v)
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saving.value = true
      try {
        await app.saveSettings({ appearance: { ...v } })
      } finally {
        saving.value = false
      }
    }, 400)
  },
  { deep: true },
)

function setNavPosition(pos: AppearanceSettings['navPosition']) {
  appearance.value = { ...appearance.value, navPosition: pos }
}

function onColorInput(key: 'primaryColor' | 'accentColor' | 'textColor', hex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    appearance.value = { ...appearance.value, [key]: hex }
  }
}
</script>

<template>
  <div class="space-y-4">

    <!-- ── Couleurs ───────────────────────────────────────────────────────── -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4 space-y-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted">Couleurs du HUD</p>

      <!-- Couleur principale -->
      <div class="flex items-center gap-3">
        <div
          class="h-9 w-9 shrink-0 rounded-md border-2 border-white/10"
          :style="{ backgroundColor: appearance.primaryColor }"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-th-primary mb-1">Couleur principale</p>
          <div class="flex items-center gap-2">
            <input
              type="color"
              :value="appearance.primaryColor"
              @input="(e) => onColorInput('primaryColor', (e.target as HTMLInputElement).value)"
              class="h-7 w-10 shrink-0 cursor-pointer rounded border border-th-subtle bg-transparent p-0.5"
            />
            <input
              type="text"
              :value="appearance.primaryColor"
              @change="(e) => onColorInput('primaryColor', (e.target as HTMLInputElement).value)"
              @keydown.enter.prevent="(e) => onColorInput('primaryColor', (e.target as HTMLInputElement).value)"
              maxlength="7"
              class="w-24 rounded-md border border-th-subtle bg-th-surface px-2 py-1 text-xs font-mono text-th-primary focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <!-- Couleur d'accent -->
      <div class="flex items-center gap-3">
        <div
          class="h-9 w-9 shrink-0 rounded-md border-2 border-white/10"
          :style="{ backgroundColor: appearance.accentColor }"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-th-primary mb-1">Couleur de bordure</p>
          <div class="flex items-center gap-2">
            <input
              type="color"
              :value="appearance.accentColor"
              @input="(e) => onColorInput('accentColor', (e.target as HTMLInputElement).value)"
              class="h-7 w-10 shrink-0 cursor-pointer rounded border border-th-subtle bg-transparent p-0.5"
            />
            <input
              type="text"
              :value="appearance.accentColor"
              @change="(e) => onColorInput('accentColor', (e.target as HTMLInputElement).value)"
              @keydown.enter.prevent="(e) => onColorInput('accentColor', (e.target as HTMLInputElement).value)"
              maxlength="7"
              class="w-24 rounded-md border border-th-subtle bg-th-surface px-2 py-1 text-xs font-mono text-th-primary focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <!-- Couleur du texte -->
      <div class="flex items-center gap-3">
        <div
          class="h-9 w-9 shrink-0 rounded-md border-2 border-white/10"
          :style="{ backgroundColor: appearance.textColor }"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-th-primary mb-1">Couleur du texte</p>
          <div class="flex items-center gap-2">
            <input
              type="color"
              :value="appearance.textColor"
              @input="(e) => onColorInput('textColor', (e.target as HTMLInputElement).value)"
              class="h-7 w-10 shrink-0 cursor-pointer rounded border border-th-subtle bg-transparent p-0.5"
            />
            <input
              type="text"
              :value="appearance.textColor"
              @change="(e) => onColorInput('textColor', (e.target as HTMLInputElement).value)"
              @keydown.enter.prevent="(e) => onColorInput('textColor', (e.target as HTMLInputElement).value)"
              maxlength="7"
              class="w-24 rounded-md border border-th-subtle bg-th-surface px-2 py-1 text-xs font-mono text-th-primary focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

    </div>

    <!-- ── Taille du texte ────────────────────────────────────────────────── -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4 space-y-3">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted">Taille du texte</p>

      <div class="flex items-center gap-3">
        <span class="text-[10px] text-th-muted shrink-0">A</span>
        <input
          type="range"
          :min="FONT_SIZE_MIN"
          :max="FONT_SIZE_MAX"
          step="1"
          :value="appearance.fontSize ?? FONT_SIZE_DEFAULT"
          @input="(e) => appearance = { ...appearance, fontSize: Number((e.target as HTMLInputElement).value) }"
          class="flex-1 h-1.5 accent-[rgb(var(--accent-rgb))] cursor-pointer"
        />
        <span class="text-base text-th-muted shrink-0">A</span>
        <span class="w-12 text-center text-xs font-mono text-th-secondary tabular-nums">
          {{ appearance.fontSize ?? FONT_SIZE_DEFAULT }}px
        </span>
      </div>

      <button
        v-if="(appearance.fontSize ?? FONT_SIZE_DEFAULT) !== FONT_SIZE_DEFAULT"
        @click="appearance = { ...appearance, fontSize: FONT_SIZE_DEFAULT }"
        class="text-[10px] text-accent/60 hover:text-accent transition"
      >Réinitialiser ({{ FONT_SIZE_DEFAULT }}px)</button>
    </div>

    <!-- ── Position de la navigation ─────────────────────────────────────── -->
    <div class="rounded-lg border border-th-subtle bg-black/20 p-4">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted mb-3">Position de la navigation</p>

      <!-- Sélecteur visuel -->
      <div class="grid grid-cols-3 gap-2 mb-3">

        <!-- Haut -->
        <div />
        <button
          @click="setNavPosition('top')"
          class="flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all"
          :class="appearance.navPosition === 'top'
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-th-muted bg-th-card text-th-muted hover:border-th-subtle hover:text-th-secondary'"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
          </svg>
          <span class="text-[10px] font-semibold">Haut</span>
        </button>
        <div />

        <!-- Gauche, Centre (aperçu), Droite -->
        <button
          @click="setNavPosition('left')"
          class="flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all"
          :class="appearance.navPosition === 'left'
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-th-muted bg-th-card text-th-muted hover:border-th-subtle hover:text-th-secondary'"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          <span class="text-[10px] font-semibold">Gauche</span>
        </button>

        <!-- Mini preview de la fenêtre -->
        <div class="rounded border border-th-subtle bg-th-surface overflow-hidden h-14 relative">
          <!-- Nav Top -->
          <div
            v-if="appearance.navPosition === 'top'"
            class="absolute inset-x-0 top-0 h-3 transition-all"
            :style="{ backgroundColor: `rgba(var(--accent-rgb), 0.15)` }"
          />
          <!-- Nav Left -->
          <div
            v-if="appearance.navPosition === 'left'"
            class="absolute inset-y-0 left-0 w-3 transition-all"
            :style="{ backgroundColor: `rgba(var(--accent-rgb), 0.15)` }"
          />
          <!-- Nav Right -->
          <div
            v-if="appearance.navPosition === 'right'"
            class="absolute inset-y-0 right-0 w-3 transition-all"
            :style="{ backgroundColor: `rgba(var(--accent-rgb), 0.15)` }"
          />
          <!-- Content area -->
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="w-4 h-3 rounded-sm bg-th-hover" />
          </div>
        </div>

        <button
          @click="setNavPosition('right')"
          class="flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all"
          :class="appearance.navPosition === 'right'
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-th-muted bg-th-card text-th-muted hover:border-th-subtle hover:text-th-secondary'"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <span class="text-[10px] font-semibold">Droite</span>
        </button>

        <div />
        <div />
        <div />

      </div>
    </div>

    <!-- ── Indicateur sauvegarde ──────────────────────────────────────────── -->
    <div class="flex items-center gap-2 text-xs text-th-muted py-1">
      <svg v-if="saving" class="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <svg v-else class="w-3 h-3 shrink-0 text-emerald-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      {{ saving ? 'Sauvegarde…' : 'Sauvegarde automatique' }}
    </div>

  </div>
</template>
