<script setup lang="ts">
import { useRoute } from 'vue-router'
import { ref, watchEffect } from 'vue'
import MainLayout from './layouts/MainLayout.vue'
import SplashScreen from './components/SplashScreen.vue'

const route = useRoute()
const isOverlay = ref(false)
const splashDone = ref(false)

watchEffect(() => {
  const overlay = route.name === 'overlay' || route.name === 'overlay-editor'
  isOverlay.value = overlay
  document.documentElement.classList.toggle('overlay-mode', overlay)
  // Pas de splash pour les fenêtres overlay
  if (overlay) splashDone.value = true
})
</script>

<template>
  <RouterView v-if="isOverlay" />
  <template v-else>
    <SplashScreen v-if="!splashDone" @done="splashDone = true" />
    <MainLayout v-show="splashDone" />
  </template>
</template>
