<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import StatusBar from '../components/StatusBar.vue'
import { useAppStore } from '../stores/app'

const app = useAppStore()

onMounted(async () => {
  if (!app.settings) {
    await app.init()
  }
})
</script>

<template>
  <div class="h-full text-slate-100">
    <div class="grid h-full grid-rows-[64px_1fr_auto] overflow-hidden border border-cyan-400/20 bg-slate-950/80">
      <header class="flex items-center border-b border-cyan-400/20 px-5">
        <h1 class="text-lg font-bold tracking-[0.2em]">1CC OVERLAY</h1>
      </header>

      <div class="grid min-h-0 grid-cols-[260px_1fr]">
        <aside class="border-r border-cyan-400/20 p-4">
          <p class="mb-4 text-sm font-semibold text-slate-300">Navigation</p>
          <nav class="space-y-1 text-sm">
            <RouterLink to="/" class="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors" active-class="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
              </svg>
              Dashboard
            </RouterLink>
            <RouterLink to="/transport" class="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors" active-class="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M8 7h8"/>
              </svg>
              Transport
            </RouterLink>
            <RouterLink to="/maps" class="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors" active-class="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7"/>
              </svg>
              Cartes
            </RouterLink>
            <RouterLink to="/profils" class="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors" active-class="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
              Profil
            </RouterLink>
            <RouterLink to="/gamelog" class="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors" active-class="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
              </svg>
              Journal jeu
            </RouterLink>

            <RouterLink to="/perf" class="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors" active-class="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              Performances
            </RouterLink>

            <!-- Séparateur + Paramètres en bas -->
            <div class="pt-2 mt-2 border-t border-slate-800">
              <RouterLink to="/settings" class="flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-slate-400 hover:text-slate-200 transition-colors" active-class="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Paramètres
              </RouterLink>
            </div>
          </nav>
        </aside>

        <main class="min-h-0 overflow-hidden p-6">
          <RouterView />
        </main>
      </div>

      <StatusBar />
    </div>
  </div>
</template>
