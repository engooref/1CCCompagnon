<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps<{ ready?: boolean }>()
const emit = defineEmits<{ done: [] }>()

const progress = ref(0)
const phase = ref<'enter' | 'load' | 'exit'>('enter')
const version = ref('0.2')

let appReady = false
let rafId: number | null = null

function finishSplash() {
  if (phase.value === 'exit') return
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  // Remplir rapidement la barre jusqu'à 100 %
  const fill = () => {
    progress.value = Math.min(100, progress.value + 8)
    if (progress.value < 100) {
      rafId = requestAnimationFrame(fill)
    } else {
      phase.value = 'exit'
      setTimeout(() => emit('done'), 420)
    }
  }
  rafId = requestAnimationFrame(fill)
}

watch(() => props.ready, (val) => {
  if (val) {
    appReady = true
    if (phase.value === 'load') finishSplash()
  }
})

onMounted(() => {
  try {
    ;(window as any).oneCC.getAppVersion().then((v: string) => { if (v) version.value = v })
  } catch { /* ignore */ }

  // Phase 1 : entrée du logo (600ms)
  setTimeout(() => {
    phase.value = 'load'

    // Si l'app est déjà prête, terminer directement
    if (appReady) { finishSplash(); return }

    // Phase 2 : progression lente plafonnée à 85% en attendant l'app
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      progress.value = Math.min(85, Math.round((elapsed / 2000) * 85))
      if (!appReady) {
        // Timeout de sécurité à 4s (depuis le début de phase 2)
        if (elapsed < 4000) rafId = requestAnimationFrame(tick)
        else finishSplash()
      }
    }
    rafId = requestAnimationFrame(tick)
  }, 600)
})
</script>

<template>
  <Transition name="splash-out">
    <div
      v-if="phase !== 'exit'"
      class="splash-root"
    >
      <!-- Grille de fond -->
      <div class="grid-bg" />

      <!-- Lignes de scan -->
      <div class="scan-line" />

      <!-- Contenu centré -->
      <div class="content" :class="phase === 'load' ? 'content--visible' : ''">

        <!-- Logo -->
        <img src="/1CC_Blanc.png" class="splash-logo" alt="1CC" />

        <!-- Titre -->
        <div class="title-block">
          <p class="label">1ER CORPS COLONIAL</p>
          <h1 class="title">1CC <span class="title-accent">COMPAGNON</span></h1>
          <p class="subtitle">STAR CITIZEN COMPANION v{{ version }}</p>
        </div>

        <!-- Barre de chargement -->
        <div class="bar-wrap">
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: progress + '%' }" />
            <div class="bar-glow" :style="{ left: progress + '%' }" />
          </div>
          <div class="bar-labels">
            <span class="bar-status">INITIALISATION SYSTÈME</span>
            <span class="bar-pct">{{ progress }}%</span>
          </div>
        </div>

        <!-- Coins décoratifs -->
        <div class="corner corner--tl" /><div class="corner corner--tr" />
        <div class="corner corner--bl" /><div class="corner corner--br" />
      </div>
    </div>
  </Transition>
</template>



<style scoped>
/* ── Root ─────────────────────────────────────────────────────────── */
.splash-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--bg-base, #03070f);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ── Grille de fond ───────────────────────────────────────────────── */
.grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(var(--accent-rgb, 34,211,238),.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--accent-rgb, 34,211,238),.04) 1px, transparent 1px);
  background-size: 48px 48px;
  animation: grid-drift 8s linear infinite;
}
@keyframes grid-drift {
  from { transform: translateY(0); }
  to   { transform: translateY(48px); }
}

/* ── Ligne de scan ────────────────────────────────────────────────── */
.scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(var(--accent-rgb, 34,211,238),.35), transparent);
  animation: scan 3s ease-in-out infinite;
}
@keyframes scan {
  0%   { top: -2px; opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

/* ── Bloc central ─────────────────────────────────────────────────── */
.content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  padding: 56px 72px;
  opacity: 0;
  transform: translateY(16px) scale(0.97);
  transition: opacity .5s ease, transform .5s ease;
}
.content--visible {
  opacity: 1;
  transform: none;
}

/* ── Logo ─────────────────────────────────────────────────────────── */
.splash-logo {
  width: 120px;
  height: auto;
  filter: drop-shadow(0 0 12px rgba(var(--accent-rgb, 34,211,238),.4));
  animation: logo-pulse 2s ease-in-out infinite;
}
@keyframes logo-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .75; }
}

/* ── Titre ────────────────────────────────────────────────────────── */
.title-block {
  text-align: center;
}
.label {
  font-size: 10px;
  letter-spacing: .35em;
  color: rgba(var(--accent-rgb, 34,211,238),.5);
  margin-bottom: 6px;
  text-transform: uppercase;
}
.title {
  font-size: 36px;
  font-weight: 800;
  letter-spacing: .2em;
  color: var(--text-primary, #e2e8f0);
  line-height: 1;
}
.title-accent {
  color: rgb(var(--accent-rgb, 34,211,238));
}
.subtitle {
  margin-top: 8px;
  font-size: 11px;
  letter-spacing: .25em;
  color: rgba(148,163,184,.4);
  text-transform: uppercase;
}

/* ── Barre ────────────────────────────────────────────────────────── */
.bar-wrap {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bar-track {
  position: relative;
  height: 2px;
  background: rgba(var(--accent-rgb, 34,211,238),.12);
}
.bar-fill {
  height: 100%;
  background: rgb(var(--accent-rgb, 34,211,238));
  transition: width .05s linear;
}
.bar-glow {
  position: absolute;
  top: -3px;
  width: 20px;
  height: 8px;
  margin-left: -10px;
  background: rgba(var(--accent-rgb, 34,211,238),.6);
  filter: blur(6px);
  transition: left .05s linear;
}
.bar-labels {
  display: flex;
  justify-content: space-between;
}
.bar-status {
  font-size: 9px;
  letter-spacing: .2em;
  color: rgba(var(--accent-rgb, 34,211,238),.45);
}
.bar-pct {
  font-size: 9px;
  letter-spacing: .1em;
  color: rgba(var(--accent-rgb, 34,211,238),.45);
  font-variant-numeric: tabular-nums;
}

/* ── Coins ────────────────────────────────────────────────────────── */
.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border-color: rgba(var(--accent-rgb, 34,211,238),.4);
  border-style: solid;
}
.corner--tl { top: 12px;  left: 12px;  border-width: 1px 0 0 1px; }
.corner--tr { top: 12px;  right: 12px; border-width: 1px 1px 0 0; }
.corner--bl { bottom: 12px; left: 12px;  border-width: 0 0 1px 1px; }
.corner--br { bottom: 12px; right: 12px; border-width: 0 1px 1px 0; }

/* ── Transition de sortie ─────────────────────────────────────────── */
.splash-out-leave-active { transition: opacity .4s ease, transform .4s ease; }
.splash-out-leave-to     { opacity: 0; transform: scale(1.03); }
</style>
