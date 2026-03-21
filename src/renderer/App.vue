<script setup lang="ts">
import { useRoute } from 'vue-router'
import { ref, watchEffect, onMounted } from 'vue'
import MainLayout from './layouts/MainLayout.vue'
import SplashScreen from './components/SplashScreen.vue'
import { useAppStore } from './stores/app'

const route = useRoute()
const app = useAppStore()
const isOverlay = ref(false)
const splashDone = ref(false)

watchEffect(() => {
  const overlay = route.name === 'overlay' || route.name === 'overlay-editor'
  isOverlay.value = overlay
  document.documentElement.classList.toggle('overlay-mode', overlay)
  if (overlay) splashDone.value = true
})

// Lancer l'init pendant la splash screen
onMounted(() => {
  if (!isOverlay.value) app.init()
})
</script>

<template>
  <RouterView v-if="isOverlay" />
  <template v-else>
    <SplashScreen v-if="!splashDone" :ready="!app.loading" @done="splashDone = true" />
    <MainLayout v-show="splashDone" />
  </template>
</template>
