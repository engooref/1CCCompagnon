<script setup lang="ts">
import { computed } from 'vue'
import { useRadioStore } from '../../stores/radio'
import RadioMeter from './RadioMeter.vue'

const radio = useRadioStore()

const pttLabel = computed(() => {
  if (radio.transmitting) return 'ÉMISSION…'
  if (!radio.connected) return 'PTT'
  return radio.muted ? 'MUTÉ' : 'PTT'
})

const transmittingChannel = computed(() => radio.transmittingChannel)
const transmittingChannelName = computed(() =>
  radio.channels.find(c => c.id === transmittingChannel.value)?.name ?? transmittingChannel.value ?? ''
)
</script>

<template>
  <div class="rounded-lg border border-th-subtle bg-black/20 p-4 space-y-4">
    <p class="text-xs font-bold uppercase tracking-wider text-th-muted">Contrôles</p>

    <!-- Indicateur d'émission -->
    <div
      class="flex flex-col items-center gap-1 rounded-xl border-2 py-3.5 text-xs font-bold tracking-wide uppercase transition-all duration-100 select-none"
      :class="radio.transmitting
        ? 'border-rose-500 bg-rose-500/20 text-rose-300 shadow-[0_0_24px_rgba(239,68,68,0.4)]'
        : radio.connected
          ? 'border-accent/30 bg-accent/[0.05] text-th-muted'
          : 'border-th-subtle bg-black/20 text-th-muted opacity-40'"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
      </svg>
      {{ pttLabel }}
      <span v-if="transmittingChannelName" class="text-[9px] font-normal tracking-normal normal-case text-rose-300/80">
        → {{ transmittingChannelName }}
      </span>
      <span v-else-if="!radio.connected" class="text-[9px] font-normal tracking-normal normal-case">
        Rejoindre un canal
      </span>
      <span v-else class="text-[9px] font-normal tracking-normal normal-case opacity-60">
        {{ radio.settings.pttBindings.length ? 'Appuyez sur la touche PTT du canal' : 'Configurez une touche PTT par canal' }}
      </span>
    </div>

    <!-- Vu-mètre micro -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <p class="text-[10px] text-th-muted uppercase tracking-wider">Niveau micro</p>
        <span class="text-[10px] tabular-nums" :class="radio.transmitting ? 'text-rose-300' : 'text-th-muted'">
          {{ Math.round(radio.micLevel * 100) }}%
        </span>
      </div>
      <RadioMeter :level="radio.micLevel" :active="radio.transmitting" :threshold="radio.gateThreshold || undefined" />
    </div>

    <!-- Gain d'entrée micro -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <p class="text-[10px] text-th-muted uppercase tracking-wider">Gain micro</p>
        <span class="text-[10px] tabular-nums text-th-secondary">
          {{ Math.round(radio.inputGain * 100) }}%
        </span>
      </div>
      <input
        type="range" min="0.5" max="4" step="0.1"
        :value="radio.inputGain"
        @input="(e) => radio.setInputGain(parseFloat((e.target as HTMLInputElement).value))"
        class="w-full h-1.5 rounded-full cursor-pointer appearance-none"
        :style="{
          background: `linear-gradient(to right, rgb(var(--accent-rgb)) ${(radio.inputGain - 0.5) / 3.5 * 100}%, rgb(30,41,59) 0%)`
        }"
      />
    </div>

    <!-- Noise gate -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <p class="text-[10px] text-th-muted uppercase tracking-wider">Seuil de voix</p>
        <span class="text-[10px] tabular-nums" :class="radio.gateThreshold > 0 ? 'text-amber-300' : 'text-th-muted'">
          {{ radio.gateThreshold > 0 ? Math.round(radio.gateThreshold * 100) + '%' : 'Désactivé' }}
        </span>
      </div>
      <input
        type="range" min="0" max="0.4" step="0.01"
        :value="radio.gateThreshold"
        @input="(e) => radio.setGateThreshold(parseFloat((e.target as HTMLInputElement).value))"
        class="w-full h-1.5 rounded-full cursor-pointer appearance-none"
        :style="{
          background: radio.gateThreshold > 0
            ? `linear-gradient(to right, rgb(var(--accent-rgb)) ${radio.gateThreshold / 0.4 * 100}%, rgb(30,41,59) 0%)`
            : 'rgb(30,41,59)'
        }"
      />
      <p class="text-[10px] text-th-muted/60">Coupe le micro en dessous du seuil (clavier, ventilateur…)</p>
    </div>

    <!-- Effet radio -->
    <div class="space-y-2 rounded-md border border-th-subtle bg-th-card/40 p-2.5">
      <button
        @click="radio.setRadioEffectEnabled(!radio.settings.radioEffectEnabled)"
        class="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs font-semibold transition"
        :class="radio.settings.radioEffectEnabled
          ? 'border-accent/40 bg-accent/[0.08] text-accent'
          : 'border-th-subtle bg-th-card text-th-secondary hover:text-th-primary hover:border-th-muted/50'"
      >
        <span class="flex items-center gap-2">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19V6l12-2v13M9 19a2 2 0 11-4 0 2 2 0 014 0zm12-2a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          Effet radio
        </span>
        <span class="text-[10px] opacity-70">{{ radio.settings.radioEffectEnabled ? 'Actif' : 'Inactif' }}</span>
      </button>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] text-th-muted uppercase tracking-wider">Intensité</p>
          <span class="text-[10px] tabular-nums text-th-secondary">
            {{ Math.round(radio.settings.radioEffectIntensity * 100) }}%
          </span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="radio.settings.radioEffectIntensity"
          :disabled="!radio.settings.radioEffectEnabled"
          @input="(e) => radio.setRadioEffectIntensity(parseFloat((e.target as HTMLInputElement).value))"
          class="w-full h-1.5 rounded-full cursor-pointer appearance-none disabled:opacity-40 disabled:cursor-not-allowed"
          :style="{
            background: `linear-gradient(to right, rgb(var(--accent-rgb)) ${radio.settings.radioEffectIntensity * 100}%, rgb(30,41,59) 0%)`
          }"
        />
        <p class="text-[10px] text-th-muted/60">Applique un rendu talkie-walkie sur émission et réception.</p>
      </div>
    </div>

    <!-- Monitor micro -->
    <button
      @click="radio.toggleMonitor()"
      :disabled="!radio.connected"
      class="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-40"
      :class="radio.monitoring
        ? 'border-accent/40 bg-accent/[0.08] text-accent'
        : 'border-th-subtle bg-th-card text-th-secondary hover:text-th-primary hover:border-th-muted/50'"
    >
      <span class="flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12m0-12v12M9 10l-2 2-2-2m0 4l2-2 2 2"/>
        </svg>
        Écoute micro
      </span>
      <span class="text-[10px] opacity-60">{{ radio.monitoring ? 'Actif' : 'Inactif' }}</span>
    </button>

    <!-- Mute -->
    <button
      @click="radio.toggleMute()"
      :disabled="!radio.connected"
      class="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-40"
      :class="radio.muted
        ? 'border-amber-400/30 bg-amber-400/[0.08] text-amber-300'
        : 'border-th-subtle bg-th-card text-th-secondary hover:text-th-primary hover:border-th-muted/50'"
    >
      <span class="flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path v-if="!radio.muted" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
          <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3zM3 3l18 18"/>
        </svg>
        {{ radio.muted ? 'Micro muté' : 'Micro actif' }}
      </span>
      <span class="text-[10px] opacity-60">
        {{ radio.muted ? 'Cliquer pour activer' : 'Cliquer pour muter' }}
      </span>
    </button>

    <!-- Volume entrant -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <p class="text-[10px] text-th-muted uppercase tracking-wider">Volume entrant</p>
        <span class="text-[10px] tabular-nums text-th-secondary">
          {{ Math.round(radio.settings.radioVolume * 100) }}%
        </span>
      </div>
      <input
        type="range"
        min="0" max="1" step="0.01"
        :value="radio.settings.radioVolume"
        @input="(e) => radio.setVolume(parseFloat((e.target as HTMLInputElement).value))"
        class="w-full h-1.5 rounded-full cursor-pointer appearance-none"
        :style="{
          background: `linear-gradient(to right, rgb(var(--accent-rgb)) ${radio.settings.radioVolume * 100}%, rgb(30,41,59) 0%)`
        }"
      />
    </div>

    <!-- Périphériques audio -->
    <div v-if="radio.availableInputs.length || radio.availableOutputs.length" class="space-y-2">
      <p class="text-[10px] text-th-muted uppercase tracking-wider">Périphériques</p>

      <div v-if="radio.availableInputs.length" class="space-y-1">
        <label class="text-[10px] text-th-muted">Microphone</label>
        <select
          :value="radio.selectedInputId ?? ''"
          @change="(e) => radio.setAudioInput((e.target as HTMLSelectElement).value)"
          class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50 transition"
        >
          <option value="">Par défaut</option>
          <option v-for="d in radio.availableInputs" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || `Micro ${d.deviceId.slice(0, 8)}` }}
          </option>
        </select>
      </div>

      <div v-if="radio.availableOutputs.length" class="space-y-1">
        <label class="text-[10px] text-th-muted">Sortie audio</label>
        <select
          :value="radio.selectedOutputId ?? ''"
          @change="(e) => radio.setAudioOutput((e.target as HTMLSelectElement).value)"
          class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50 transition"
        >
          <option value="">Par défaut</option>
          <option v-for="d in radio.availableOutputs" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || `Sortie ${d.deviceId.slice(0, 8)}` }}
          </option>
        </select>
      </div>
    </div>

  </div>
</template>
