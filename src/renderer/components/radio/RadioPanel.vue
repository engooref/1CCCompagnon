<script setup lang="ts">
import { ref } from 'vue'
import { useRadioStore } from '../../stores/radio'
import type { RadioChannel } from '@shared/radio'

const radio = useRadioStore()

// ── Gestion des canaux ────────────────────────────────────────────────────────
const managing    = ref(false)
const editingId   = ref<string | null>(null)
const editForm    = ref({ name: '', description: '' })
const newForm     = ref({ name: '', description: '' })
const showNewForm = ref(false)
const saving      = ref(false)
const error       = ref<string | null>(null)

function startEdit(channel: RadioChannel) {
  editingId.value = channel.id
  editForm.value  = { name: channel.name, description: channel.description }
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit() {
  if (!editingId.value) return
  saving.value = true
  error.value  = null
  try {
    await radio.updateChannel(editingId.value, editForm.value)
    editingId.value = null
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur'
  } finally {
    saving.value = false
  }
}

async function deleteChannel(id: string) {
  if (!confirm('Supprimer ce canal ?')) return
  saving.value = true
  error.value  = null
  try {
    await radio.deleteChannel(id)
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur'
  } finally {
    saving.value = false
  }
}

async function createChannel() {
  if (!newForm.value.name.trim()) return
  saving.value = true
  error.value  = null
  try {
    await radio.createChannel({ name: newForm.value.name.trim(), description: newForm.value.description.trim() })
    newForm.value  = { name: '', description: '' }
    showNewForm.value = false
  } catch (e: any) {
    error.value = e?.message ?? 'Erreur'
  } finally {
    saving.value = false
  }
}

// ── Double-clic : rejoindre en écoute normale / quitter ─────────────────────
async function onChannelDblClick(channelId: string) {
  if (managing.value) return
  if (radio.channelState[channelId]?.connecting) return

  const cs = radio.channelState[channelId]

  if (cs?.connected && !cs.whisperOnly) {
    // Déjà en écoute → quitter ce canal + tous les murmures actifs
    await radio.leaveChannel(channelId)
    for (const cid of [...radio.connectedChannels]) {
      if (radio.channelState[cid]?.whisperOnly) {
        await radio.leaveChannel(cid)
      }
    }
  } else {
    // Quitter uniquement les canaux d'écoute actifs (non-murmure).
    // On garde les canaux murmure déjà connectés pour éviter une reconnexion inutile.
    for (const cid of radio.connectedChannels) {
      if (radio.channelState[cid]?.connected && !radio.channelState[cid]?.whisperOnly) {
        console.log('Leaving channel', cid, 'before joining', channelId)
        await radio.leaveChannel(cid)
      }
    }
    // Si le canal était en murmure PTT, le quitter avant de rejoindre en écoute
    if (cs?.connected && cs.whisperOnly) {
      await radio.leaveChannel(channelId)
    }

    radio.joinChannel(channelId, false)
  }
}

// ── Liaison PTT par canal ─────────────────────────────────────────────────────
const recordingChannel = ref<string | null>(null)

function startPttRecord(channelId: string) {
  recordingChannel.value = channelId
  const handler = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') {
      recordingChannel.value = null
      window.removeEventListener('keydown', handler, true)
      return
    }
    const modOnly = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']
    if (modOnly.includes(e.key)) return
    const code = (e as any).keyCode ?? (e as any).which ?? null
    if (!code) return
    window.removeEventListener('keydown', handler, true)
    recordingChannel.value = null
    radio.setPttBinding(channelId, code, e.key.length === 1 ? e.key.toUpperCase() : e.key)
  }
  window.addEventListener('keydown', handler, true)
}
</script>

<template>
  <div class="space-y-3 pr-1">

    <div class="flex items-center justify-between">
      <p class="text-xs font-bold uppercase tracking-wider text-th-muted">Canaux disponibles</p>
      <button
        v-if="radio.canManageChannels"
        @click="managing = !managing; showNewForm = false; editingId = null"
        class="text-[10px] px-2 py-0.5 rounded border transition"
        :class="managing
          ? 'border-accent/40 text-accent bg-accent/10'
          : 'border-th-subtle text-th-muted hover:text-accent hover:border-accent/30'"
      >
        {{ managing ? 'Terminer' : 'Gérer' }}
      </button>
    </div>

    <!-- Barre de contrôle rapide -->
    <div v-if="radio.connected" class="flex items-center gap-2">
      <!-- Déconnecter tout -->
      <button
        @click="radio.leaveAll()"
        class="flex-1 flex items-center justify-center gap-1.5 rounded border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] font-semibold text-rose-300 hover:bg-rose-400/20 transition"
        title="Se déconnecter de tous les canaux"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/>
        </svg>
        Déconnecter
      </button>
      <!-- Couper sons entrants -->
      <button
        @click="radio.toggleMutedIncoming()"
        class="flex items-center justify-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold transition"
        :class="radio.mutedIncoming
          ? 'border-amber-400/40 bg-amber-400/15 text-amber-300 hover:bg-amber-400/25'
          : 'border-th-subtle text-th-muted hover:text-accent hover:border-accent/30'"
        :title="radio.mutedIncoming ? 'Réactiver les sons entrants' : 'Couper les sons entrants'"
      >
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path v-if="!radio.mutedIncoming" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9H5a1 1 0 00-1 1v4a1 1 0 001 1h4l5 5V4L9 9z"/>
          <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
        </svg>
        {{ radio.mutedIncoming ? 'Son coupé' : 'Son' }}
      </button>
    </div>

    <!-- Erreur CRUD -->
    <p v-if="error" class="text-[10px] text-rose-300">{{ error }}</p>

    <div class="space-y-2">

      <div
        v-for="channel in radio.channels"
        :key="channel.id"
          class="rounded-lg border transition-colors select-none cursor-pointer"
          @dblclick="onChannelDblClick(channel.id)"
          :title="radio.channelState[channel.id]?.connected && !radio.channelState[channel.id]?.whisperOnly ? 'Double-clic pour quitter' : 'Double-clic pour rejoindre'"
          :class="radio.channelState[channel.id]?.connected && !radio.channelState[channel.id]?.whisperOnly
          ? 'border-accent/50 bg-accent/10'
          : radio.channelState[channel.id]?.connected && radio.channelState[channel.id]?.whisperOnly
            ? 'border-violet-500/30 bg-violet-500/[0.05]'
            : 'border-th-subtle bg-black/20 hover:border-accent/10'"
      >
        <!-- Formulaire d'édition inline -->
        <div v-if="managing && editingId === channel.id" class="p-3 space-y-2">
          <input
            v-model="editForm.name"
            placeholder="Nom du canal"
            class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
          />
          <input
            v-model="editForm.description"
            placeholder="Description"
            class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
          />
          <div class="flex gap-2">
            <button @click="saveEdit" :disabled="saving" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
              {{ saving ? 'Sauvegarde…' : 'Sauvegarder' }}
            </button>
            <button @click="cancelEdit" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
              Annuler
            </button>
          </div>
        </div>

        <!-- En-tête canal -->
        <div v-else class="flex items-start justify-between gap-3 p-2.5">

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-sm font-semibold text-th-primary truncate">{{ channel.name }}</p>

              <!-- Indicateur LIVE (quelqu'un parle dans ce canal) -->
              <span
                v-if="radio.activeSpeakers.some(s => s.channel === channel.id)"
                class="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-semibold shrink-0"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>

              <!-- Indicateur ÉMISSION (je transmets sur ce canal) -->
              <span
                v-if="radio.channelState[channel.id]?.transmitting"
                class="inline-flex items-center gap-1 text-[10px] text-rose-300 font-semibold shrink-0"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                TX
              </span>

              <!-- Badge participants -->
              <span
                v-if="radio.participantsFor(channel.id).length"
                class="inline-flex items-center gap-0.5 text-[10px] text-th-muted shrink-0"
                :title="`${radio.participantsFor(channel.id).length} participant(s)`"
              >
                <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a4 4 0 00-5.477-3.662M9 20H4v-2a4 4 0 015.477-3.662M15 8a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                {{ radio.participantsFor(channel.id).length }}
              </span>
            </div>

            <p class="text-[11px] text-th-muted mt-0.5 truncate">{{ channel.description }}</p>

            <!-- Liste visuelle des participants de ce canal -->
            <div v-if="radio.participantsFor(channel.id).length" class="mt-1.5 rounded-md border border-th-subtle/40 bg-black/20 px-2 py-1.5">
              <div class="max-h-24 overflow-y-auto scrollbar-none space-y-1">
                <div
                  v-for="participant in radio.participantsFor(channel.id)"
                  :key="`${channel.id}-${participant.identity}`"
                  class="flex items-center gap-1.5"
                >
                  <img
                    v-if="participant.avatar"
                    :src="participant.avatar"
                    :alt="participant.identity"
                    class="h-4 w-4 rounded-full shrink-0 object-cover bg-th-card"
                    @error="($event.target as HTMLImageElement).style.display = 'none'"
                  />
                  <span
                    v-else
                    class="h-4 w-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold bg-white/5 text-th-muted"
                  >
                    {{ participant.identity.charAt(0).toUpperCase() }}
                  </span>
                  <span class="text-[10px] text-th-secondary truncate">{{ participant.identity }}</span>
                </div>
              </div>
            </div>

            <!-- Touche PTT liée à ce canal -->
            <div class="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <template v-if="recordingChannel === channel.id">
                <span class="text-[10px] text-amber-300 animate-pulse">Appuyez sur une touche… (Échap annule)</span>
              </template>
              <template v-else>
                <kbd
                  v-if="radio.pttBinding(channel.id)"
                  class="inline-flex items-center rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-accent"
                >
                  {{ radio.pttBinding(channel.id)!.key }}
                </kbd>
                <button
                  @click="startPttRecord(channel.id)"
                  class="text-[10px] text-th-muted hover:text-accent transition px-1.5 py-0.5 rounded border border-th-subtle/50 hover:border-accent/30"
                >
                  {{ radio.pttBinding(channel.id) ? 'Changer PTT' : '+ PTT' }}
                </button>
                <button
                  v-if="radio.pttBinding(channel.id)"
                  @click="radio.removePttBinding(channel.id)"
                  class="text-[10px] text-th-muted/50 hover:text-rose-300 transition"
                  title="Supprimer la liaison PTT"
                >
                  ✕
                </button>
              </template>
            </div>
          </div>

          <!-- Boutons gestion (mode manage) -->
          <div v-if="managing" class="flex items-center gap-1.5 shrink-0">
            <button
              @click.stop="startEdit(channel)"
              class="p-1.5 rounded border border-th-subtle text-th-muted hover:text-accent hover:border-accent/30 transition"
              title="Modifier"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-.586 1.414H9v-2a2 2 0 01.586-1.414z"/>
              </svg>
            </button>
            <button
              @click.stop="deleteChannel(channel.id)"
              :disabled="saving || radio.participantsFor(channel.id).length > 0"
              class="p-1.5 rounded border border-th-subtle text-th-muted hover:text-rose-300 hover:border-rose-400/30 transition disabled:opacity-40"
              :title="radio.participantsFor(channel.id).length > 0 ? 'Suppression impossible: participants dans le canal' : 'Supprimer'"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>

          <!-- Indicateur de statut (hors mode manage) -->
          <div v-else class="shrink-0 flex items-center">
            <!-- Connexion en cours -->
            <svg v-if="radio.channelState[channel.id]?.connecting" class="w-4 h-4 animate-spin text-accent/60" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>

        </div>



      </div>

      <div v-if="!radio.channels.length" class="rounded-lg border border-th-subtle bg-black/20 p-8 text-center text-xs text-th-muted">
        Aucun canal disponible.
      </div>

      <!-- Formulaire de création (mode manage) -->
      <div v-if="managing">
        <div v-if="showNewForm" class="rounded-lg border border-accent/30 bg-accent/[0.05] p-3 space-y-2">
          <p class="text-[10px] font-bold uppercase tracking-wider text-accent">Nouveau canal</p>
          <input
            v-model="newForm.name"
            placeholder="Nom du canal"
            class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
          />
          <input
            v-model="newForm.description"
            placeholder="Description"
            class="w-full rounded border border-th-subtle bg-th-surface px-2 py-1 text-xs text-th-primary focus:outline-none focus:border-accent/50"
          />
          <div class="flex gap-2">
            <button @click="createChannel" :disabled="saving || !newForm.name.trim()" class="text-[10px] px-2 py-1 rounded border border-accent/30 text-accent hover:bg-accent/10 transition disabled:opacity-50">
              {{ saving ? 'Création…' : 'Créer' }}
            </button>
            <button @click="showNewForm = false" class="text-[10px] px-2 py-1 rounded border border-th-subtle text-th-muted hover:text-th-primary transition">
              Annuler
            </button>
          </div>
        </div>

        <button
          v-else
          @click="showNewForm = true"
          class="w-full rounded-lg border border-dashed border-th-subtle/50 py-3 text-[11px] text-th-muted hover:text-accent hover:border-accent/30 transition flex items-center justify-center gap-1.5"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nouveau canal
        </button>
      </div>

    </div>

  </div>
</template>

<style scoped>
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

@keyframes eq-bar {
  0%, 100% { transform: scaleY(0.4); }
  50%       { transform: scaleY(1.2); }
}
</style>
