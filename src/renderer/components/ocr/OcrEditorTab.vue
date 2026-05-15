<script setup lang="ts">
/**
 * OcrEditorTab — onglet OCR dans l'éditeur overlay.
 * Utilise le store Pinia partagé pour éviter les conflits de state avec OcrPage.
 */
import { ref, onMounted, computed } from 'vue'
import { useOcrStore } from '@renderer/stores/ocrStore'

const ocr = useOcrStore()

// UI états
const loading     = ref(false)
const renaming    = ref(false)
const renameValue = ref('')
const creating    = ref(false)
const createValue = ref('')

// Charge les profils si le store est vide (navigation directe vers /overlay)
onMounted(async () => {
  if (ocr.profiles.length === 0) {
    loading.value = true
    try { await ocr.loadProfiles() } finally { loading.value = false }
  }
})

// ── Profils ───────────────────────────────────────────────────────────────────
function switchProfile(id: string) {
  ocr.selectProfile(id)
}

function startCreate() {
  createValue.value = ''
  creating.value = true
}

function confirmCreate() {
  const label = createValue.value.trim() || 'Profil'
  ocr.createProfile(label)
  creating.value = false
}

function duplicateActive() {
  if (ocr.selectedProfileId) ocr.duplicateProfile(ocr.selectedProfileId)
}

function startRename() {
  renameValue.value = ocr.activeProfile?.label ?? ''
  renaming.value = true
}

function confirmRename() {
  if (!ocr.selectedProfileId || !renameValue.value.trim()) { renaming.value = false; return }
  ocr.renameProfile(ocr.selectedProfileId, renameValue.value.trim())
  renaming.value = false
}

function deleteActive() {
  if (ocr.profiles.length <= 1 || !ocr.selectedProfileId) return
  if (confirm('Supprimer ce profil ?')) ocr.deleteProfile(ocr.selectedProfileId)
}

// ── Zones ─────────────────────────────────────────────────────────────────────

function zoneCategory(zone: any): 'rock' | 'hud' | 'custom' {
  if (zone.category === 'rock' || /^material\d+(Percent|Name|Qty)$/.test(zone.fieldKey)) return 'rock'
  if (zone.category === 'hud' || zone.fieldKey === 'coordinates' || zone.fieldKey === 'signal') return 'hud'
  return 'custom'
}

const zoneGroups = computed(() => {
  const groups = [
    { key: 'rock', label: 'Rocher', zones: [] as any[] },
    { key: 'hud', label: 'HUD', zones: [] as any[] },
    { key: 'custom', label: 'Personnalisées', zones: [] as any[] },
  ]
  for (const zone of ocr.activeProfile?.zones ?? []) {
    groups.find(g => g.key === zoneCategory(zone))?.zones.push(zone)
  }
  return groups.filter(g => g.zones.length > 0)
})

function toggleZone(zoneId: string) {
  ocr.toggleZone(zoneId)
}

function removeZone(zoneId: string) {
  ocr.removeZone(zoneId)
}

</script>

<template>
  <div class="et">
    <div v-if="loading" class="et-empty">Chargement…</div>

    <template v-else>

      <!-- ── Sélecteur profil ─────────────────────────────────────────── -->
      <div class="et-section">
        <div class="et-row">
          <select class="et-select" :value="ocr.selectedProfileId ?? ''" @change="switchProfile(($event.target as HTMLSelectElement).value)">
            <option v-for="p in ocr.profiles" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
          <!-- Renommer -->
          <button class="et-btn et-btn--icon" title="Renommer" @click="startRename">✎</button>
          <!-- Dupliquer -->
          <button class="et-btn et-btn--icon" title="Dupliquer" :disabled="!ocr.selectedProfileId" @click="duplicateActive">⧉</button>
          <!-- Supprimer -->
          <button class="et-btn et-btn--icon et-btn--danger" title="Supprimer" :disabled="ocr.profiles.length <= 1" @click="deleteActive">✕</button>
        </div>

        <!-- Inline rename -->
        <div v-if="renaming" class="et-inline-form">
          <input
            class="et-input"
            v-model="renameValue"
            placeholder="Nom du profil"
            autofocus
            @keydown.enter="confirmRename"
            @keydown.escape="renaming = false"
          />
          <button class="et-btn et-btn--primary" @click="confirmRename">OK</button>
          <button class="et-btn" @click="renaming = false">✕</button>
        </div>

        <!-- Nouveau profil -->
        <button v-if="!creating" class="et-btn et-btn--full" @click="startCreate">+ Nouveau profil</button>
        <div v-else class="et-inline-form">
          <input
            class="et-input"
            v-model="createValue"
            placeholder="Nom du profil"
            autofocus
            @keydown.enter="confirmCreate"
            @keydown.escape="creating = false"
          />
          <button class="et-btn et-btn--primary" @click="confirmCreate">Créer</button>
          <button class="et-btn" @click="creating = false">✕</button>
        </div>
      </div>

      <!-- ── Zones ────────────────────────────────────────────────────── -->
      <div v-if="ocr.activeProfile" class="et-section">
        <div class="et-section-title">Zones — {{ ocr.activeProfile.zones.length }}</div>

        <div class="et-zone-list">
          <div v-for="group in zoneGroups" :key="group.key" class="et-zone-group">
            <div class="et-zone-group-title">{{ group.label }} — {{ group.zones.length }}</div>
            <div
              v-for="zone in group.zones"
              :key="zone.id"
              class="et-zone"
              :class="{ 'et-zone--off': !zone.enabled }"
            >
              <input type="checkbox" :checked="zone.enabled" @change="toggleZone(zone.id)" />
              <span class="et-zone-label">{{ zone.label }}</span>
              <span class="et-zone-mode">{{ zone.mode }}</span>
              <button class="et-btn-del" @click="removeZone(zone.id)" title="Supprimer">×</button>
            </div>
          </div>
          <div v-if="!ocr.activeProfile.zones.length" class="et-empty">Aucune zone configurée</div>
        </div>
      </div>

    </template>
  </div>
</template>

<style scoped>
.et {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 440px;
  overflow-y: auto;
  padding-right: 2px;
}

.et-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.et-section:last-child { border-bottom: none; }

.et-section-title {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(56,189,248,0.5);
}

.et-row { display: flex; align-items: center; gap: 4px; }

.et-select {
  flex: 1;
  background: rgba(0,0,0,0.5);
  color: #f1f5f9;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 4px 7px;
  font-size: 11px;
  min-width: 0;
}

.et-input {
  flex: 1;
  background: rgba(0,0,0,0.6);
  color: #f1f5f9;
  border: 1px solid rgba(56,189,248,0.4);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  outline: none;
}

.et-inline-form { display: flex; gap: 4px; align-items: center; }

.et-btn {
  background: rgba(255,255,255,0.08);
  color: #e2e8f0;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s;
}
.et-btn:hover:not(:disabled) { background: rgba(255,255,255,0.16); }
.et-btn:disabled { opacity: 0.35; cursor: default; }
.et-btn--icon { padding: 4px 7px; }
.et-btn--full { width: 100%; text-align: left; }
.et-btn--primary {
  background: rgba(34,211,238,0.18);
  border-color: rgba(34,211,238,0.4);
  color: #67e8f9;
}
.et-btn--primary:hover:not(:disabled) { background: rgba(34,211,238,0.28); }
.et-btn--danger { color: #f87171; }
.et-btn--danger:hover:not(:disabled) { background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.3); }

.et-zone-list { display: flex; flex-direction: column; gap: 6px; }
.et-zone-group { border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; }
.et-zone-group-title { padding: 4px 6px; background: rgba(56,189,248,0.08); color: rgba(103,232,249,0.8); font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; }
.et-zone {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 5px;
  font-size: 11px;
  color: #e2e8f0;
  transition: background 0.1s;
}
.et-zone:hover { background: rgba(255,255,255,0.05); }
.et-zone--off { opacity: 0.38; }
.et-zone-label { flex: 1; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.et-zone-mode {
  font-size: 9px;
  padding: 1px 5px;
  background: rgba(255,255,255,0.07);
  border-radius: 4px;
  color: rgba(255,255,255,0.4);
  white-space: nowrap;
}
.et-btn-del {
  background: none;
  border: none;
  color: #f87171;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
  flex-shrink: 0;
}
.et-btn-del:hover { color: #ef4444; }

.et-hint {
  font-size: 9px;
  color: rgba(255,255,255,0.28);
  margin: 0;
  line-height: 1.4;
}
.et-empty {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  text-align: center;
  padding: 6px 0;
}
</style>
