import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { radioService, type RadioConnectionState, type RadioParticipant } from '../services/livekit'
import type { RadioChannel, RadioSettings } from '@shared/general'

export const useRadioStore = defineStore('radio', () => {
  // ── State ────────────────────────────────────────────────────────────────

  const connectionState = ref<RadioConnectionState>('disconnected')
  const participants    = ref<RadioParticipant[]>([])
  const activeSpeakers  = ref<string[]>([])
  const isMicActive     = ref(false)
  const errorMessage    = ref<string | null>(null)
  const activeChannelId = ref<string | null>(null)

  // ── Computed ─────────────────────────────────────────────────────────────

  const isConnected  = computed(() => connectionState.value === 'connected')
  const isConnecting = computed(() => connectionState.value === 'connecting')

  // ── LiveKit listeners ─────────────────────────────────────────────────────

  function attachServiceListeners() {
    radioService.on('connectionStateChange', (s) => {
      connectionState.value = s
      if (s !== 'error') errorMessage.value = null
    })
    radioService.on('participantsChange', (list) => {
      participants.value = list
      isMicActive.value  = radioService.isMicActive
    })
    radioService.on('activeSpeakersChange', (ids) => {
      activeSpeakers.value = ids
    })
    radioService.on('error', (msg) => {
      errorMessage.value = msg
    })
  }

  attachServiceListeners()

  // ── PTT IPC ───────────────────────────────────────────────────────────────

  function setupPttListeners() {
    window.oneCC.onRadioPttStart(() => {
      if (!isConnected.value) return
      radioService.pttStart()
      isMicActive.value = true
    })
    window.oneCC.onRadioPttEnd(() => {
      radioService.pttEnd()
      isMicActive.value = false
    })
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function joinChannel(channel: RadioChannel, settings: RadioSettings, identity: string) {
    if (!settings.serverUrl || !settings.tokenUrl) {
      errorMessage.value = 'Serveur LiveKit non configuré'
      return
    }
    activeChannelId.value = channel.id
    await radioService.connect(
      settings.serverUrl,
      settings.tokenUrl,
      channel.roomName,
      identity,
      settings.inputDeviceId,
    )
  }

  async function leaveChannel() {
    await radioService.disconnect()
    activeChannelId.value = null
    isMicActive.value     = false
    participants.value    = []
    activeSpeakers.value  = []
  }

  async function getAudioDevices() {
    return radioService.getAudioInputDevices()
  }

  return {
    connectionState,
    participants,
    activeSpeakers,
    isMicActive,
    errorMessage,
    activeChannelId,
    isConnected,
    isConnecting,
    setupPttListeners,
    joinChannel,
    leaveChannel,
    getAudioDevices,
  }
})
