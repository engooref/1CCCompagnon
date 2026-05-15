import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type {
  OcrProfile,
  OcrZone,
  OcrNormalizedResult,
  OcrCaptureSource,
} from '@renderer/ocr/OcrTypes'
import { buildZoneFromTemplate, FIXED_ZONES, buildZonesFromShipPreset, getShipPreset } from '@renderer/ocr/OcrShipPresets'

function makeDefaultProfile(): OcrProfile {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    label: 'Mon profil',
    referenceResolution: { width: 2560, height: 1440 },
    zones: [],
    createdAt: now,
    updatedAt: now,
  }
}

function isRockFieldKey(fieldKey: string): boolean {
  return (
    fieldKey === 'rockName' ||
    fieldKey === 'rockMass' ||
    fieldKey === 'rockResistance' ||
    fieldKey === 'rockInstability' ||
    fieldKey === 'totalScu' ||
    fieldKey === 'compositionBlock' ||
    fieldKey === 'composition' ||
    /^material\d+(Percent|Name|Qty)$/.test(fieldKey) ||
    /^composition\[\d+\]\.(percent|name|qty)$/.test(fieldKey)
  )
}

function defaultCategoryForZone(zone: OcrZone): OcrZone['category'] {
  if (isRockFieldKey(zone.fieldKey)) return 'rock'
  if (zone.fieldKey === 'coordinates' || zone.fieldKey === 'signal') return 'hud'
  return 'custom'
}

export const useOcrStore = defineStore('ocr', () => {
  const enabled            = ref(false)
  const calibrationMode    = ref(false)
  const runtimeMode        = ref(false)
  const isScanning         = ref(false)
  const scanIntervalMs     = ref(2000)
  const selectedProfileId  = ref<string | null>(null)
  const profiles           = ref<OcrProfile[]>([])
  const results            = ref<Map<string, OcrNormalizedResult>>(new Map())
  const selectedSourceId   = ref<string | null>(null)
  const selectedSourceName = ref<string | null>(null)
  const lastError          = ref<string | null>(null)
  const hideOcrVisuals     = ref(false)
  const captureSafeMode    = ref(false)

  const activeProfile = computed<OcrProfile | null>(
    () => profiles.value.find(p => p.id === selectedProfileId.value) ?? null
  )
  const zones = computed<OcrZone[]>(
    () => activeProfile.value?.zones ?? []
  )
  const normalizedResults = computed<OcrNormalizedResult[]>(
    () => Array.from(results.value.values())
  )

  function ensureDefaultZones(profile: OcrProfile): boolean {
    let dirty = false

    // Ancien système : un gros bloc scanResults + zones material1..5.
    // Nouveau système : petites zones fixes + un seul bloc composition dynamique.
    const beforeLegacy = profile.zones.length
    profile.zones = profile.zones.filter(z =>
      z.fieldKey !== 'scanResults' &&
      !/^material\d+(Percent|Name|Qty)$/.test(z.fieldKey) &&
      !/^composition\[\d+\]\.(percent|name|qty)$/.test(z.fieldKey)
    )
    if (profile.zones.length !== beforeLegacy) dirty = true

    for (const zone of profile.zones) {
      if (zone.fieldKey === 'composition') {
        zone.fieldKey = 'compositionBlock'
        zone.label = zone.label || 'Composition minerais'
        zone.mode = 'composition'
        zone.category = 'rock'
        dirty = true
      }
    }

    for (const tpl of FIXED_ZONES) {
      const exists = profile.zones.some(z => z.fieldKey === tpl.zone.fieldKey)
      if (!exists) {
        profile.zones.push({ ...tpl.zone, id: crypto.randomUUID() })
        dirty = true
      }
    }

    for (const zone of profile.zones) {
      if (!zone.category) {
        zone.category = defaultCategoryForZone(zone)
        dirty = true
      }
    }

    return dirty
  }

  async function loadProfiles(): Promise<void> {
    try {
      const data = await window.oneCC.ocrLoadProfiles()
      profiles.value = data.profiles ?? []
      selectedProfileId.value = data.selectedProfileId ?? null
      scanIntervalMs.value = data.scanIntervalMs ?? 2000
      selectedSourceName.value = data.selectedSourceName ?? null

      let dirty = false

      if (profiles.value.length === 0) {
        const def = makeDefaultProfile()
        profiles.value = [def]
        selectedProfileId.value = def.id
        dirty = true
      } else if (!selectedProfileId.value || !profiles.value.find(p => p.id === selectedProfileId.value)) {
        selectedProfileId.value = profiles.value[0].id
        dirty = true
      }

      profiles.value.forEach(p => {
        if (ensureDefaultZones(p)) dirty = true
      })

      if (dirty) await saveProfiles()
    } catch (e) {
      lastError.value = String(e)
    }
  }

  /** Rechargement léger depuis IPC (sync inter-fenêtres) — sans dirty-save pour éviter les boucles. */
  async function reloadFromRemote(): Promise<void> {
    try {
      const data = await window.oneCC.ocrLoadProfiles()
      if (!data.profiles?.length) return          // rien à faire si vide
      profiles.value = data.profiles
      selectedProfileId.value = data.selectedProfileId ?? profiles.value[0]?.id ?? null
      scanIntervalMs.value = data.scanIntervalMs ?? scanIntervalMs.value
      selectedSourceName.value = data.selectedSourceName ?? selectedSourceName.value
    } catch (e) {
      lastError.value = String(e)
    }
  }

  async function saveProfiles(): Promise<void> {
    try {
      await window.oneCC.ocrSaveProfiles({
        profiles: JSON.parse(JSON.stringify(toRaw(profiles.value))),
        selectedProfileId: selectedProfileId.value,
        scanIntervalMs: scanIntervalMs.value,
        selectedSourceName: selectedSourceName.value,
      })
    } catch (e) {
      lastError.value = String(e)
      console.error('[OCR] saveProfiles failed:', e)
    }
  }

  async function createProfile(label: string, shipKey?: string): Promise<OcrProfile> {
    const now = new Date().toISOString()
    const shipPreset = shipKey ? getShipPreset(shipKey) : undefined
    const profile: OcrProfile = {
      id: crypto.randomUUID(),
      label: label.trim() || 'Profil',
      shipKey: shipKey ?? undefined,
      referenceResolution: shipPreset?.referenceResolution ?? { width: 2560, height: 1440 },
      zones: shipKey ? buildZonesFromShipPreset(shipKey) : [],
      createdAt: now,
      updatedAt: now,
    }
    ensureDefaultZones(profile)
    profiles.value.push(profile)
    console.log('Created profile', profile, profiles.value)
    selectedProfileId.value = profile.id
    await saveProfiles()
    return profile
  }

  function renameProfile(profileId: string, label: string): void {
    const profile = profiles.value.find(p => p.id === profileId)
    if (!profile || !label.trim()) return
    profile.label = label.trim()
    profile.updatedAt = new Date().toISOString()
    saveProfiles()
  }

  function addZoneFromTemplate(templateKey: string): OcrZone | null {
    const profile = activeProfile.value
    if (!profile) return null
    const zone = buildZoneFromTemplate(templateKey)
    if (!zone) return null
    const existingKeys = profile.zones.map(z => z.fieldKey)
    if (existingKeys.includes(zone.fieldKey)) {
      zone.fieldKey = `${zone.fieldKey}_${Date.now()}`
    }
    profile.zones.push(zone)
    profile.updatedAt = new Date().toISOString()
    saveProfiles()
    return zone
  }

  function duplicateProfile(profileId: string): OcrProfile | null {
    const src = profiles.value.find(p => p.id === profileId)
    if (!src) return null
    const now = new Date().toISOString()
    const copy: OcrProfile = {
      ...JSON.parse(JSON.stringify(src)),
      id: crypto.randomUUID(),
      label: `${src.label} (copie)`,
      createdAt: now,
      updatedAt: now,
    }
    copy.zones = copy.zones.map(z => ({ ...z, id: crypto.randomUUID() }))
    profiles.value.push(copy)
    saveProfiles()
    return copy
  }

  function deleteProfile(profileId: string): void {
    profiles.value = profiles.value.filter(p => p.id !== profileId)
    if (selectedProfileId.value === profileId) {
      selectedProfileId.value = profiles.value[0]?.id ?? null
    }
    saveProfiles()
  }

  function selectProfile(profileId: string): void {
    if (profiles.value.find(p => p.id === profileId)) {
      selectedProfileId.value = profileId
      saveProfiles()
    }
  }

  function updateZone(zoneId: string, patch: Partial<OcrZone>): void {
    const profile = activeProfile.value
    if (!profile) return
    const idx = profile.zones.findIndex(z => z.id === zoneId)
    if (idx === -1) return
    profile.zones[idx] = { ...profile.zones[idx], ...patch }
    profile.updatedAt = new Date().toISOString()
    saveProfiles()
  }
  function updateProfilePreprocessing(patch: Partial<import('@renderer/ocr/OcrTypes').OcrPreprocessPreset>): void {
    const profile = activeProfile.value
    if (!profile) return
    profile.profilePreprocessing = { ...(profile.profilePreprocessing ?? {}), ...patch }
    profile.updatedAt = new Date().toISOString()
    saveProfiles()
  }

  function resetProfilePreprocessing(): void {
    const profile = activeProfile.value
    if (!profile) return
    profile.profilePreprocessing = undefined
    profile.updatedAt = new Date().toISOString()
    saveProfiles()
  }

  function removeZone(zoneId: string): void {
    const profile = activeProfile.value
    if (!profile) return
    profile.zones = profile.zones.filter(z => z.id !== zoneId)
    profile.updatedAt = new Date().toISOString()
    saveProfiles()
  }

  function toggleZone(zoneId: string): void {
    const profile = activeProfile.value
    if (!profile) return
    const zone = profile.zones.find(z => z.id === zoneId)
    if (!zone) return
    zone.enabled = !zone.enabled
    profile.updatedAt = new Date().toISOString()
    saveProfiles()
  }

  function setCalibrationMode(value: boolean): void {
    calibrationMode.value = value
    if (value) runtimeMode.value = false
    window.oneCC.ocrSetOverlayClickThrough(!value)
  }

  function setRuntimeMode(value: boolean): void {
    runtimeMode.value = value
    if (value) calibrationMode.value = false
    window.oneCC.ocrSetOverlayClickThrough(value)
  }

  function setSource(source: OcrCaptureSource): void {
    selectedSourceId.value = source.id
    selectedSourceName.value = source.name
    saveProfiles()
  }

  function setResult(result: OcrNormalizedResult): void {
    results.value.set(result.zoneId, result)
  }

  function clearResults(): void {
    results.value.clear()
  }

  const scDetected = computed(() => selectedSourceId.value !== null)

  return {
    enabled, calibrationMode, runtimeMode, isScanning, scanIntervalMs,
    selectedProfileId, profiles, selectedSourceId, selectedSourceName,
    lastError, hideOcrVisuals, captureSafeMode,
    activeProfile, zones, normalizedResults,
    scDetected,
    loadProfiles, reloadFromRemote, saveProfiles,
    createProfile, renameProfile, addZoneFromTemplate, duplicateProfile, deleteProfile, selectProfile,
    updateZone, removeZone, toggleZone, updateProfilePreprocessing, resetProfilePreprocessing,
    setCalibrationMode, setRuntimeMode, setSource, setResult, clearResults,
  }
})
