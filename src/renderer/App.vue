<script setup lang="ts">
import { useRoute } from 'vue-router'
import { watchEffect } from 'vue'
import MainLayout from './layouts/MainLayout.vue'

const route = useRoute()

watchEffect(() => {
  document.documentElement.classList.toggle(
    'overlay-mode',
    route.name === 'overlay' || route.name === 'overlay-editor'
  )
})
</script>

<template>
  <RouterView v-if="route.name === 'overlay' || route.name === 'overlay-editor'" />
  <MainLayout v-else />
</template>
