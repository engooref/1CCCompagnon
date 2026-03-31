<script setup lang="ts">
import { ref } from 'vue'
import GeneralTab    from '../components/settings/GeneralTab.vue'
import OverlayTab    from '../components/settings/OverlayTab.vue'
import TransportTab  from '../components/settings/TransportTab.vue'
import MapsTab       from '../components/settings/MapsTab.vue'
import AppearanceTab from '../components/settings/AppearanceTab.vue'
import RadioTab      from '../components/settings/RadioTab.vue'

type Tab = 'general' | 'overlay' | 'transport' | 'maps' | 'appearance' | 'radio'
const activeTab = ref<Tab>('general')
</script>

<template>
  <section class="h-full flex flex-col gap-5">

    <!-- Page title -->
    <div class="shrink-0">
      <h2 class="text-base font-bold text-th-primary">Paramètres</h2>
      <p class="text-xs text-th-muted mt-0.5">Configuration de l'application</p>
    </div>

    <!-- Tabs -->
    <div class="shrink-0 flex gap-1 border-b border-accent2/20 pb-0">
      <button
        v-for="tab in ([
          { id: 'general',    label: 'Général'    },
          { id: 'overlay',    label: 'Overlay'    },
          { id: 'transport',  label: 'Transport'  },
          { id: 'maps',       label: 'Cartes'     },
          { id: 'appearance', label: 'Apparence'  },
        ] as const)"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="activeTab === tab.id
          ? 'border-accent text-accent'
          : 'border-transparent text-th-muted hover:text-accent2 hover:border-accent2/40'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab content -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <GeneralTab    v-if="activeTab === 'general'"    />
      <OverlayTab    v-if="activeTab === 'overlay'"    />
      <TransportTab  v-if="activeTab === 'transport'"  />
      <MapsTab       v-if="activeTab === 'maps'"       />
      <AppearanceTab v-if="activeTab === 'appearance'" />
    </div>

  </section>
</template>
